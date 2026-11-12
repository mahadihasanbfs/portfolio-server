const { ObjectId } = require("mongodb");
const { task_collection, user_collection } = require("../Collection/all_collection");
const { effective } = require("../Middleware/access");

// Board columns (keep in step with the frontend).
const COLUMN_LABELS = { backlog: "Backlog", ready: "Ready", in_progress: "In Progress", in_review: "In Review", done: "Done" };
const PRIORITIES = ["low", "medium", "high", "critical"];

const fail = (res, status, message) => res.status(status).send({ success: false, message, request_time: Date.now() });
const clean = (v, max) => String(v ?? "").trim().slice(0, max);

const me = (req) => ({ id: String(req.user._id), name: req.user.name || req.user.email || "Unknown", email: req.user.email || "", image: req.user.image || "" });
// Assignees were stored as a user's id, username or email depending on the version of the page.
const my_ids = (req) => [String(req.user._id), req.user.email, req.user.username].filter(Boolean).map(String);
// Super admin (CEO), admin (manager) and anyone whose role has full access see every task.
// Set once per request by `load_admin`, which the router runs after sign-in.
const is_admin = (req) => req.is_task_admin === true;
const load_admin = async (req, res, next) => {
      try {
            req.is_task_admin = (await effective(req.user)).permissions.includes("*");
            next();
      } catch (error) {
            next(error);
      }
};

const is_creator = (t, req) => String(t.created_by?.id || "") === String(req.user._id);
const is_assignee = (t, req) => (t.assignees || []).some((a) => my_ids(req).includes(String(a)));
const can_see = (t, req) => is_admin(req) || is_creator(t, req) || is_assignee(t, req);
const can_edit = (t, req) => is_admin(req) || is_creator(t, req);

// What the signed-in user may do with a task, sent along with it.
const with_perms = (t, req) => ({
      ...t,
      can_edit: can_edit(t, req),
      can_delete: can_edit(t, req),
      can_move: can_see(t, req),
      is_assignee: is_assignee(t, req),
});

const mine_query = (req) => ({ $or: [{ assignees: { $in: my_ids(req) } }, { "created_by.id": String(req.user._id) }] });

const find_task = async (id) => (ObjectId.isValid(id) ? task_collection.findOne({ _id: new ObjectId(id) }) : null);

// Display names for assignee ids, so history reads "Rafi, Mahadi" instead of raw ids.
const names_for = async (ids) => {
      const oids = (ids || []).filter(ObjectId.isValid).map((i) => new ObjectId(i));
      const users = oids.length ? await user_collection.find({ _id: { $in: oids } }).project({ name: 1 }).toArray() : [];
      const map = new Map(users.map((u) => [String(u._id), u.name]));
      return (ids || []).map((i) => map.get(String(i)) || String(i));
};

/* ---------- read ---------- */

// Admins see the whole team by default (and can switch to just their own with ?scope=mine).
// Everyone else only gets their own tasks (assigned to them, or created by them).
const get_all_tasks = async (req, res, next) => {
      try {
            const admin = is_admin(req);
            const scope = admin && req.query.scope !== "mine" ? "all" : "mine";
            const tasks = await task_collection.find(scope === "all" ? {} : mine_query(req)).toArray();
            res.send({
                  success: true,
                  message: "Tasks found successfully",
                  request_time: Date.now(),
                  meta: { is_admin: admin, scope, me: String(req.user._id) },
                  data: tasks.map((t) => with_perms(t, req)),
            });
      } catch (error) {
            next(error);
      }
};

const get_task_by_id = async (req, res, next) => {
      try {
            const task = await find_task(req.query.id || req.params.id);
            if (!task || !can_see(task, req)) return fail(res, 404, "Task not found");
            res.send({ success: true, message: "Task found successfully", request_time: Date.now(), data: with_perms(task, req) });
      } catch (error) {
            next(error);
      }
};

/* ---------- create ---------- */

const add_new_task = async (req, res, next) => {
      try {
            const b = req.body || {};
            const title = clean(b.title, 200);
            if (!title) return fail(res, 400, "Title is required");
            const column = COLUMN_LABELS[b.column] ? b.column : "backlog";
            const now = Date.now();
            const creator = me(req);
            const doc = {
                  title,
                  column,
                  description: String(b.description ?? "").slice(0, 50000),
                  type: clean(b.type || "blank", 40),
                  assignees: Array.isArray(b.assignees) ? [...new Set(b.assignees.map(String))].slice(0, 50) : [],
                  labels: Array.isArray(b.labels) ? b.labels.map((l) => clean(l, 40)).filter(Boolean).slice(0, 20) : [],
                  deadline: clean(b.deadline, 40),
                  priority: PRIORITIES.includes(b.priority) ? b.priority : "medium",
                  images: Array.isArray(b.images) ? b.images.map(String).slice(0, 20) : [],
                  order: typeof b.order === "number" ? b.order : now,
                  comment: [],
                  created_by: creator, // who assigned the task
                  create_at: now,
                  history: [{ id: new ObjectId().toString(), at: now, by: creator, field: "created", from: null, to: COLUMN_LABELS[column] }],
            };
            const result = await task_collection.insertOne(doc);
            res.send({ success: true, message: "Task added successfully", request_time: now, data: { ...doc, _id: result.insertedId } });
      } catch (error) {
            next(error);
      }
};

/* ---------- update (with history) ---------- */

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const update_task = async (req, res, next) => {
      try {
            const task = await find_task(req.query.id);
            if (!task || !can_see(task, req)) return fail(res, 404, "Task not found");
            const b = req.body || {};
            const full = can_edit(task, req);
            const $set = {};
            const entries = [];
            const by = me(req);
            const now = Date.now();
            const log = (field, from, to) => entries.push({ id: new ObjectId().toString(), at: now, by, field, from, to });

            // Anyone involved can move a card between columns; only the creator or an admin edits the rest.
            if (b.column !== undefined && COLUMN_LABELS[b.column] && b.column !== task.column) {
                  $set.column = b.column;
                  log("status", COLUMN_LABELS[task.column] || task.column, COLUMN_LABELS[b.column]);
            }
            if (typeof b.order === "number") $set.order = b.order;

            if (full) {
                  if (b.title !== undefined) {
                        const title = clean(b.title, 200);
                        if (!title) return fail(res, 400, "Title is required");
                        if (title !== task.title) { $set.title = title; log("title", task.title, title); }
                  }
                  if (b.description !== undefined && String(b.description) !== String(task.description || "")) {
                        $set.description = String(b.description).slice(0, 50000);
                        log("description", null, "updated");
                  }
                  if (b.priority !== undefined && PRIORITIES.includes(b.priority) && b.priority !== task.priority) {
                        $set.priority = b.priority;
                        log("priority", task.priority, b.priority);
                  }
                  if (b.deadline !== undefined && clean(b.deadline, 40) !== String(task.deadline || "")) {
                        $set.deadline = clean(b.deadline, 40);
                        log("deadline", task.deadline || "none", $set.deadline || "none");
                  }
                  if (Array.isArray(b.assignees)) {
                        const next_ids = [...new Set(b.assignees.map(String))].slice(0, 50);
                        if (!same([...next_ids].sort(), [...(task.assignees || []).map(String)].sort())) {
                              $set.assignees = next_ids;
                              log("assignees", (await names_for(task.assignees)).join(", ") || "nobody", (await names_for(next_ids)).join(", ") || "nobody");
                        }
                  }
                  if (Array.isArray(b.labels)) {
                        const next_labels = b.labels.map((l) => clean(l, 40)).filter(Boolean).slice(0, 20);
                        if (!same(next_labels, task.labels || [])) {
                              $set.labels = next_labels;
                              log("labels", (task.labels || []).join(", ") || "none", next_labels.join(", ") || "none");
                        }
                  }
            }

            if (!Object.keys($set).length) return res.send({ success: true, message: "Nothing to update", request_time: now, data: with_perms(task, req) });
            if (entries.length) { $set.updated_at = now; $set.updated_by = by; }
            const update = { $set };
            if (entries.length) update.$push = { history: { $each: entries } };
            await task_collection.updateOne({ _id: task._id }, update);
            const fresh = await task_collection.findOne({ _id: task._id });
            res.send({ success: true, message: "Task updated successfully", request_time: now, data: with_perms(fresh, req) });
      } catch (error) {
            next(error);
      }
};

/* ---------- comments ---------- */

const add_comment = async (req, res, next) => {
      try {
            const task = await find_task((req.body || {}).task_id);
            if (!task || !can_see(task, req)) return fail(res, 404, "Task not found");
            const text = clean((req.body || {}).text, 2000);
            if (!text) return fail(res, 400, "Write a comment first");
            const comment = { id: new ObjectId().toString(), text, by: me(req), at: Date.now() };
            await task_collection.updateOne({ _id: task._id }, { $push: { comment } });
            res.send({ success: true, message: "Comment added", request_time: Date.now(), data: comment });
      } catch (error) {
            next(error);
      }
};

const delete_comment = async (req, res, next) => {
      try {
            const task = await find_task(req.query.task_id);
            if (!task || !can_see(task, req)) return fail(res, 404, "Task not found");
            const target = (task.comment || []).find((c) => c && c.id === req.query.comment_id);
            if (!target) return fail(res, 404, "Comment not found");
            if (!is_admin(req) && String(target.by?.id) !== String(req.user._id)) return fail(res, 403, "You can only delete your own comments");
            await task_collection.updateOne({ _id: task._id }, { $pull: { comment: { id: req.query.comment_id } } });
            res.send({ success: true, message: "Comment deleted", request_time: Date.now() });
      } catch (error) {
            next(error);
      }
};

/* ---------- delete ---------- */

const delete_task = async (req, res, next) => {
      try {
            const task = await find_task(req.query.id);
            if (!task || !can_see(task, req)) return fail(res, 404, "Task not found");
            if (!can_edit(task, req)) return fail(res, 403, "Only the person who assigned this task or an admin can delete it");
            await task_collection.deleteOne({ _id: task._id });
            res.send({ success: true, message: "Task deleted successfully", request_time: Date.now() });
      } catch (error) {
            next(error);
      }
};

module.exports = { load_admin, add_new_task, get_all_tasks, get_task_by_id, update_task, add_comment, delete_comment, delete_task };

const { ObjectId } = require("mongodb");
const { att_records_collection, att_leaves_collection, user_collection } = require("../Collection/all_collection");
const c = require("./attendance_calc");

const ok = (res, message, data) => res.send({ success: true, message, request_time: new Date().getTime(), data });
const bad = (res, message, status = 400) =>
      res.status(status).send({ success: false, message, request_time: new Date().getTime() });

const LEAVE_TYPES = ["casual", "sick", "annual", "unpaid", "other"];
const STATUSES = ["present", "late"];
const uid = (req) => String(req.user._id);

// One record per person per day. Created lazily because the connection is opened by the first query.
let indexed = false;
const ensure_index = async () => {
      if (indexed) return;
      await att_records_collection.createIndex({ userId: 1, date: 1 }, { unique: true });
      await att_leaves_collection.createIndex({ userId: 1, from: 1 });
      indexed = true;
};

const leaves_of = (userId) => att_leaves_collection.find({ userId }).toArray();

/* ============ employee ============ */

const today = async (req, res, next) => {
      try {
            await ensure_index();
            const { date } = c.local_parts();
            const record = await att_records_collection.findOne({ userId: uid(req), date });
            ok(res, "Today", { date, record: record && { ...record, ...c.day_view(record) }, config: c.CONFIG });
      } catch (e) { next(e); }
};

// A person can check in and out many times a day. The first check-in sets late/present.
const check_in = async (req, res, next) => {
      try {
            await ensure_index();
            const now = new Date();
            const { date, minutes } = c.local_parts(now);
            const userId = uid(req);
            const session = { in: now.toISOString(), out: null };

            const existing = await att_records_collection.findOne({ userId, date });
            if (!existing) {
                  const doc = { userId, date, checkIn: session.in, checkOut: null, sessions: [session], status: c.status_for_check_in(minutes), workedMinutes: 0, createdAt: session.in };
                  try {
                        await att_records_collection.insertOne(doc);
                        return ok(res, doc.status === "late" ? "Checked in (late)" : "Checked in", { ...doc, ...c.day_view(doc) });
                  } catch (e) {
                        if (e.code !== 11000) throw e; // lost a race with another tab: fall through to the "already has a record" path
                  }
            }

            const rec = existing || (await att_records_collection.findOne({ userId, date }));
            const sessions = c.sessions_of(rec);
            if (sessions.length && !sessions[sessions.length - 1].out) return bad(res, "You are already checked in", 409);

            // Legacy records have no sessions array yet: write it back with the new session.
            const next_sessions = [...sessions, session];
            const r = await att_records_collection.updateOne(
                  { _id: rec._id, sessions: rec.sessions },
                  { $set: { sessions: next_sessions, checkOut: null } }
            );
            if (r.matchedCount !== 1) return bad(res, "Attendance changed, try again", 409);
            ok(res, "Checked in", { ...rec, sessions: next_sessions, ...c.day_view({ sessions: next_sessions }) });
      } catch (e) { next(e); }
};

const check_out = async (req, res, next) => {
      try {
            await ensure_index();
            const now = new Date();
            const { date } = c.local_parts(now);
            const rec = await att_records_collection.findOne({ userId: uid(req), date });
            const sessions = c.sessions_of(rec);
            if (!sessions.length) return bad(res, "Check in first", 409);
            if (sessions[sessions.length - 1].out) return bad(res, "You are not checked in", 409);

            const closed = sessions.map((x, i) => (i === sessions.length - 1 ? { ...x, out: now.toISOString() } : x));
            const changes = { sessions: closed, checkOut: now.toISOString(), workedMinutes: c.total_minutes(closed) };
            const r = await att_records_collection.updateOne({ _id: rec._id, sessions: rec.sessions }, { $set: changes });
            if (r.matchedCount !== 1) return bad(res, "Attendance changed, try again", 409);
            ok(res, "Checked out", { ...rec, ...changes, ...c.day_view({ sessions: closed }) });
      } catch (e) { next(e); }
};

// One person's month: every day with its status, plus the summary. Used by the employee and by admins.
const month_for = async (userId, month) => {
      const records = await att_records_collection.find({ userId, date: { $regex: `^${month}-` } }).sort({ date: 1 }).toArray();
      const leaves = await leaves_of(userId);
      const todayDate = c.local_parts().date;
      const byDate = new Map(records.map((r) => [r.date, r]));
      const days = c.month_days(month).map((date) => {
            const r = byDate.get(date);
            return { date, status: c.day_status({ date, record: r, leaves, today: todayDate }), ...c.day_view(r) };
      });
      return { month, days, summary: c.summarize({ month, records, leaves, today: todayDate }), leaves };
};

const my_month = async (req, res, next) => {
      try {
            const month = req.query.month || c.local_parts().date.slice(0, 7);
            if (!c.is_month(month)) return bad(res, "month must be YYYY-MM");
            const { leaves, ...data } = await month_for(uid(req), month);
            ok(res, "My attendance", data);
      } catch (e) { next(e); }
};

const request_leave = async (req, res, next) => {
      try {
            const { from, to, type = "casual", reason = "" } = req.body || {};
            if (!c.is_date(from) || !c.is_date(to)) return bad(res, "from and to must be YYYY-MM-DD");
            if (from > to) return bad(res, "'from' must not be after 'to'");
            if (c.days_between(from, to).length > 90) return bad(res, "A leave request can cover at most 90 days");
            if (!LEAVE_TYPES.includes(type)) return bad(res, `type must be one of: ${LEAVE_TYPES.join(", ")}`);
            const mine = await leaves_of(uid(req));
            if (mine.some((l) => l.status !== "rejected" && l.from <= to && from <= l.to)) return bad(res, "You already have a leave request overlapping these dates", 409);
            const doc = { userId: uid(req), from, to, type, reason: String(reason).slice(0, 500), status: "pending", createdAt: new Date().toISOString() };
            const r = await att_leaves_collection.insertOne(doc);
            ok(res, "Leave requested", { ...doc, _id: r.insertedId });
      } catch (e) { next(e); }
};

const my_leaves = async (req, res, next) => {
      try {
            const rows = await att_leaves_collection.find({ userId: uid(req) }).sort({ from: -1 }).toArray();
            ok(res, "My leaves", rows);
      } catch (e) { next(e); }
};

const cancel_leave = async (req, res, next) => {
      try {
            if (!ObjectId.isValid(req.params.id)) return bad(res, "Invalid id");
            const r = await att_leaves_collection.deleteOne({ _id: new ObjectId(req.params.id), userId: uid(req), status: "pending" });
            if (r.deletedCount !== 1) return bad(res, "Only your own pending requests can be cancelled", 404);
            ok(res, "Leave request cancelled");
      } catch (e) { next(e); }
};

/* ============ admin ============ */

const staff = () => user_collection.find({}, { projection: { name: 1, email: 1, designation: 1, image: 1 } }).sort({ name: 1 }).toArray();

const daily = async (req, res, next) => {
      try {
            const date = req.query.date || c.local_parts().date;
            if (!c.is_date(date)) return bad(res, "date must be YYYY-MM-DD");
            const [users, records, leaves] = await Promise.all([
                  staff(),
                  att_records_collection.find({ date }).toArray(),
                  att_leaves_collection.find({ status: "approved", from: { $lte: date }, to: { $gte: date } }).toArray(),
            ]);
            const rec = new Map(records.map((r) => [r.userId, r]));
            const onLeave = new Set(leaves.map((l) => l.userId));
            const todayDate = c.local_parts().date;
            const rows = users.map((u) => {
                  const id = String(u._id);
                  const r = rec.get(id);
                  const status = c.day_status({ date, record: r, leaves: onLeave.has(id) ? [{ status: "approved", from: date, to: date }] : [], today: todayDate });
                  return { userId: id, name: u.name, email: u.email, designation: u.designation, image: u.image, status, ...c.day_view(r), note: r?.note || "" };
            });
            const counts = rows.reduce((a, r) => ({ ...a, [r.status]: (a[r.status] || 0) + 1 }), {});
            ok(res, "Daily attendance", { date, weekend: c.is_weekend(date), counts, rows });
      } catch (e) { next(e); }
};

const monthly = async (req, res, next) => {
      try {
            const month = req.query.month || c.local_parts().date.slice(0, 7);
            if (!c.is_month(month)) return bad(res, "month must be YYYY-MM");
            const first = `${month}-01`;
            const last = c.month_days(month).pop();
            const [users, records, leaves] = await Promise.all([
                  staff(),
                  att_records_collection.find({ date: { $regex: `^${month}-` } }).toArray(),
                  att_leaves_collection.find({ status: "approved", from: { $lte: last }, to: { $gte: first } }).toArray(),
            ]);
            const todayDate = c.local_parts().date;
            const group = (rows) => rows.reduce((m, r) => m.set(r.userId, [...(m.get(r.userId) || []), r]), new Map());
            const recBy = group(records), leaveBy = group(leaves);
            const rows = users.map((u) => {
                  const id = String(u._id);
                  return { userId: id, name: u.name, email: u.email, designation: u.designation, ...c.summarize({ month, records: recBy.get(id) || [], leaves: leaveBy.get(id) || [], today: todayDate }) };
            });
            ok(res, "Monthly attendance", { month, rows });
      } catch (e) { next(e); }
};

// Admin fix: set or correct one person's day. Send `sessions: [{ checkIn: "HH:MM", checkOut: "HH:MM" | "" }]`
// (several allowed, in order, last one may be open) or the older single `checkIn` / `checkOut`. Times are local.
const correct_record = async (req, res, next) => {
      try {
            await ensure_index();
            const { userId, date, status, note } = req.body || {};
            if (!ObjectId.isValid(userId)) return bad(res, "userId is invalid");
            if (!c.is_date(date)) return bad(res, "date must be YYYY-MM-DD");
            if (status && !STATUSES.includes(status)) return bad(res, "status must be present or late");

            const input = Array.isArray(req.body.sessions) ? req.body.sessions : [{ checkIn: req.body.checkIn, checkOut: req.body.checkOut }];
            if (!input.length || input.length > 20) return bad(res, "Provide 1 to 20 sessions");
            const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
            let prevEnd = "";
            const hm = [];
            for (const [i, x] of input.entries()) {
                  const n = i + 1;
                  if (!x || !hhmm.test(x.checkIn || "")) return bad(res, `Session ${n}: checkIn must be HH:MM`);
                  if (x.checkOut && !hhmm.test(x.checkOut)) return bad(res, `Session ${n}: checkOut must be HH:MM`);
                  if (x.checkOut && x.checkOut <= x.checkIn) return bad(res, `Session ${n}: checkOut must be after checkIn`);
                  if (x.checkIn < prevEnd) return bad(res, `Session ${n} starts before the previous one ends`);
                  if (!x.checkOut && i < input.length - 1) return bad(res, `Session ${n}: only the last session can be open`);
                  prevEnd = x.checkOut || "";
                  hm.push(x);
            }
            if (!(await user_collection.findOne({ _id: new ObjectId(userId) }, { projection: { _id: 1 } }))) return bad(res, "User not found", 404);

            const sessions = hm.map((x) => ({ in: c.local_time_to_iso(date, x.checkIn), out: x.checkOut ? c.local_time_to_iso(date, x.checkOut) : null }));
            const view = c.day_view({ sessions });
            const set = {
                  sessions, checkIn: view.checkIn, checkOut: view.checkOut, workedMinutes: view.workedMinutes,
                  status: status || c.status_for_check_in(c.local_parts(view.checkIn).minutes),
                  note: String(note || "").slice(0, 300),
                  editedBy: uid(req), editedAt: new Date().toISOString(),
            };
            await att_records_collection.updateOne({ userId, date }, { $set: set, $setOnInsert: { createdAt: new Date().toISOString() } }, { upsert: true });
            ok(res, "Record saved", { userId, date, ...set });
      } catch (e) { next(e); }
};

const delete_record = async (req, res, next) => {
      try {
            const { userId, date } = req.query;
            if (!ObjectId.isValid(userId) || !c.is_date(date)) return bad(res, "userId and date are required");
            const r = await att_records_collection.deleteOne({ userId, date });
            if (r.deletedCount !== 1) return bad(res, "Record not found", 404);
            ok(res, "Record deleted");
      } catch (e) { next(e); }
};

// Admin: one employee's month, profile and full leave history.
const employee = async (req, res, next) => {
      try {
            const { userId } = req.params;
            if (!ObjectId.isValid(userId)) return bad(res, "Invalid id");
            const month = req.query.month || c.local_parts().date.slice(0, 7);
            if (!c.is_month(month)) return bad(res, "month must be YYYY-MM");
            const user = await user_collection.findOne({ _id: new ObjectId(userId) }, { projection: { name: 1, email: 1, designation: 1, image: 1, phone: 1, timestamp: 1 } });
            if (!user) return bad(res, "Employee not found", 404);
            const data = await month_for(userId, month);
            ok(res, "Employee attendance", { user, ...data, leaves: [...data.leaves].sort((a, b) => (a.from < b.from ? 1 : -1)) });
      } catch (e) { next(e); }
};

const all_leaves = async (req, res, next) => {
      try {
            const { status } = req.query;
            const filter = ["pending", "approved", "rejected"].includes(status) ? { status } : {};
            const [rows, users] = await Promise.all([att_leaves_collection.find(filter).sort({ createdAt: -1 }).toArray(), staff()]);
            const name = new Map(users.map((u) => [String(u._id), u]));
            ok(res, "Leaves", rows.map((l) => ({ ...l, name: name.get(l.userId)?.name || "Unknown", email: name.get(l.userId)?.email })));
      } catch (e) { next(e); }
};

const decide_leave = async (req, res, next) => {
      try {
            if (!ObjectId.isValid(req.params.id)) return bad(res, "Invalid id");
            const { status, note = "" } = req.body || {};
            if (!["approved", "rejected"].includes(status)) return bad(res, "status must be approved or rejected");
            if (status === "rejected" && !String(note).trim()) return bad(res, "Give a reason when rejecting a request");
            const leave = await att_leaves_collection.findOne({ _id: new ObjectId(req.params.id) });
            if (!leave) return bad(res, "Leave request not found", 404);
            // Leave only counts once someone else approves it. The CEO is the top of the chain, so may decide their own.
            if (leave.userId === uid(req) && req.user.designation !== "Chief Executive Officer") return bad(res, "You cannot decide your own leave request", 403);
            await att_leaves_collection.updateOne(
                  { _id: leave._id },
                  { $set: { status, decisionNote: String(note).trim().slice(0, 300), decidedBy: uid(req), decidedByName: req.user.name || "", decidedAt: new Date().toISOString() } }
            );
            ok(res, `Leave ${status}`);
      } catch (e) { next(e); }
};

module.exports = { today, check_in, check_out, my_month, request_leave, my_leaves, cancel_leave, daily, monthly, employee, correct_record, delete_record, all_leaves, decide_leave };

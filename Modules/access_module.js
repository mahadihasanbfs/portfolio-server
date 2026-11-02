const { ObjectId } = require("mongodb");
const { hr_roles_collection, user_collection } = require("../Collection/all_collection");
const { effective, ensure_roles, is_designation_admin } = require("../Middleware/access");

const ok = (res, message, data) => res.send({ success: true, message, request_time: new Date().getTime(), data });
const bad = (res, message, status = 400) =>
      res.status(status).send({ success: false, message, request_time: new Date().getTime() });

const ONLINE_MS = 3 * 60 * 1000;
const PAGE_KEY = /^\/dashboard\/[\w\-/]{1,60}$/;

// Page list from the request: '*' or valid dashboard paths, no duplicates.
const clean_pages = (list) => {
      if (!Array.isArray(list)) return null;
      const pages = [...new Set(list.map((p) => String(p).trim()))];
      return pages.every((p) => p === "*" || PAGE_KEY.test(p)) && pages.length <= 60 ? pages : null;
};

// What the signed-in user may open. The dashboard calls this to build its menu.
const me = async (req, res, next) => {
      try {
            const access = await effective(req.user);
            ok(res, "Access", { permissions: access.permissions, role: access.role?.name || null, admin: access.permissions.includes("*"), source: access.source });
      } catch (e) { next(e); }
};

// Presence ping: the dashboard sends one every minute while open.
const heartbeat = async (req, res, next) => {
      try {
            await user_collection.updateOne({ _id: req.user._id }, { $set: { lastSeenAt: new Date() } });
            ok(res, "ok", { at: Date.now() });
      } catch (e) { next(e); }
};

const list_roles = async (req, res, next) => {
      try {
            await ensure_roles();
            const [roles, users] = await Promise.all([
                  hr_roles_collection.find().sort({ system: -1, name: 1 }).toArray(),
                  user_collection.find({ roleId: { $exists: true } }, { projection: { roleId: 1 } }).toArray(),
            ]);
            const used = users.reduce((m, u) => m.set(String(u.roleId), (m.get(String(u.roleId)) || 0) + 1), new Map());
            ok(res, "Roles", roles.map((r) => ({ ...r, users: used.get(String(r._id)) || 0 })));
      } catch (e) { next(e); }
};

const create_role = async (req, res, next) => {
      try {
            await ensure_roles();
            const name = String(req.body?.name || "").trim().slice(0, 40);
            const permissions = clean_pages(req.body?.permissions);
            if (!name) return bad(res, "Role name is required");
            if (!permissions) return bad(res, "Invalid page list");
            if (await hr_roles_collection.findOne({ name })) return bad(res, "A role with this name already exists", 409);
            const doc = { name, permissions, system: false, createdAt: new Date() };
            const r = await hr_roles_collection.insertOne(doc);
            ok(res, "Role created", { ...doc, _id: r.insertedId });
      } catch (e) { next(e); }
};

const update_role = async (req, res, next) => {
      try {
            if (!ObjectId.isValid(req.params.id)) return bad(res, "Invalid id");
            const role = await hr_roles_collection.findOne({ _id: new ObjectId(req.params.id) });
            if (!role) return bad(res, "Role not found", 404);
            if (role.name === "Admin") return bad(res, "The Admin role always has every page", 403);
            const set = {};
            if (req.body?.name !== undefined) {
                  if (role.system) return bad(res, "System roles cannot be renamed", 403);
                  set.name = String(req.body.name).trim().slice(0, 40);
                  if (!set.name) return bad(res, "Role name is required");
                  if (await hr_roles_collection.findOne({ name: set.name, _id: { $ne: role._id } })) return bad(res, "A role with this name already exists", 409);
            }
            if (req.body?.permissions !== undefined) {
                  const permissions = clean_pages(req.body.permissions);
                  if (!permissions) return bad(res, "Invalid page list");
                  set.permissions = permissions;
            }
            if (!Object.keys(set).length) return bad(res, "Nothing to update");
            await hr_roles_collection.updateOne({ _id: role._id }, { $set: set });
            ok(res, "Role updated", { ...role, ...set });
      } catch (e) { next(e); }
};

const delete_role = async (req, res, next) => {
      try {
            if (!ObjectId.isValid(req.params.id)) return bad(res, "Invalid id");
            const role = await hr_roles_collection.findOne({ _id: new ObjectId(req.params.id) });
            if (!role) return bad(res, "Role not found", 404);
            if (role.system) return bad(res, "System roles cannot be deleted", 403);
            if (await user_collection.countDocuments({ roleId: String(role._id) })) return bad(res, "Move the employees on this role to another role first", 409);
            await hr_roles_collection.deleteOne({ _id: role._id });
            ok(res, "Role deleted");
      } catch (e) { next(e); }
};

// Put one employee on a role, optionally with their own page list (permissions: null clears the override).
const set_user_access = async (req, res, next) => {
      try {
            await ensure_roles();
            if (!ObjectId.isValid(req.params.id)) return bad(res, "Invalid id");
            const target = await user_collection.findOne({ _id: new ObjectId(req.params.id) });
            if (!target) return bad(res, "Employee not found", 404);
            if (is_designation_admin(target)) return bad(res, `${target.designation} is always a full admin. Change their designation first.`, 409);
            if (String(target._id) === String(req.user._id)) return bad(res, "You cannot change your own access", 403);

            const set = {}, unset = {};
            const { roleId, permissions } = req.body || {};
            if (roleId !== undefined) {
                  if (!ObjectId.isValid(roleId) || !(await hr_roles_collection.findOne({ _id: new ObjectId(roleId) }))) return bad(res, "Unknown role");
                  set.roleId = String(roleId);
            }
            if (permissions === null) unset.permissions = "";
            else if (permissions !== undefined) {
                  const pages = clean_pages(permissions);
                  if (!pages) return bad(res, "Invalid page list");
                  set.permissions = pages;
            }
            const update = {};
            if (Object.keys(set).length) update.$set = set;
            if (Object.keys(unset).length) update.$unset = unset;
            if (!Object.keys(update).length) return bad(res, "Nothing to update");
            await user_collection.updateOne({ _id: target._id }, update);
            const fresh = await user_collection.findOne({ _id: target._id });
            const access = await effective(fresh);
            ok(res, "Access updated", { permissions: access.permissions, role: access.role?.name || null, source: access.source });
      } catch (e) { next(e); }
};

module.exports = { me, heartbeat, list_roles, create_role, update_role, delete_role, set_user_access, ONLINE_MS };

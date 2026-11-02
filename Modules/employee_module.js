const bcrypt = require("bcrypt");
const { ObjectId } = require("mongodb");
const { user_collection, att_records_collection, att_leaves_collection } = require("../Collection/all_collection");
const { ADMIN_DESIGNATIONS, effective } = require("../Middleware/access");
const c = require("./attendance_calc");

const ONLINE_MS = 3 * 60 * 1000;

const ok = (res, message, data) => res.send({ success: true, message, request_time: new Date().getTime(), data });
const bad = (res, message, status = 400) =>
      res.status(status).send({ success: false, message, request_time: new Date().getTime() });

const CEO = "Chief Executive Officer";
const EDITABLE = ["name", "email", "designation", "possition", "phone", "linkedin", "dob", "salary", "image"];
const clean = (v, max = 200) => String(v ?? "").trim().slice(0, max);
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const same = (a, b) => String(a) === String(b);

const ceo_count = () => user_collection.countDocuments({ designation: CEO, active: { $ne: false } });

// Everyone, newest first, with today's attendance so admins see who is in right now.
const list = async (req, res, next) => {
      try {
            const todayDate = c.local_parts().date;
            const [users, records, leaves] = await Promise.all([
                  user_collection.find({}, { projection: { password: 0 } }).sort({ timestamp: -1 }).toArray(),
                  att_records_collection.find({ date: todayDate }).toArray(),
                  att_leaves_collection.find({ status: "approved", from: { $lte: todayDate }, to: { $gte: todayDate } }).toArray(),
            ]);
            const rec = new Map(records.map((r) => [r.userId, r]));
            const onLeave = new Set(leaves.map((l) => l.userId));
            const now = Date.now();
            const rows = await Promise.all(users.map(async (u) => {
                  const id = String(u._id);
                  const today = c.day_status({ date: todayDate, record: rec.get(id), leaves: onLeave.has(id) ? [{ status: "approved", from: todayDate, to: todayDate }] : [], today: todayDate });
                  const access = await effective(u);
                  const seen = u.lastSeenAt ? new Date(u.lastSeenAt).getTime() : null;
                  return {
                        ...u,
                        isAdmin: ADMIN_DESIGNATIONS.includes(u.designation),
                        active: u.active !== false,
                        online: seen !== null && now - seen < ONLINE_MS,
                        lastSeenAt: seen ? new Date(seen).toISOString() : null,
                        roleName: access.role?.name || null,
                        roleId: access.role?._id ? String(access.role._id) : null,
                        permissions: access.permissions,
                        customAccess: access.source === "custom",
                        today,
                        inOffice: c.day_view(rec.get(id)).open,
                  };
            }));
            ok(res, "Employees", rows);
      } catch (e) { next(e); }
};

const update = async (req, res, next) => {
      try {
            if (!ObjectId.isValid(req.params.id)) return bad(res, "Invalid id");
            const target = await user_collection.findOne({ _id: new ObjectId(req.params.id) });
            if (!target) return bad(res, "Employee not found", 404);

            const body = req.body || {};
            const set = {};
            EDITABLE.forEach((k) => { if (body[k] !== undefined) set[k] = k === "image" ? clean(body[k], 1000) : clean(body[k]); });
            if ("name" in set && !set.name) return bad(res, "Name is required");
            if ("designation" in set && !set.designation) return bad(res, "Designation is required");
            if ("email" in set) {
                  if (!emailOk(set.email)) return bad(res, "Invalid email format");
                  const taken = await user_collection.findOne({ email: set.email, _id: { $ne: target._id } });
                  if (taken) return bad(res, "Another employee already uses this email", 409);
            }
            if ("salary" in set && set.salary !== "" && !/^\d+(\.\d{1,2})?$/.test(set.salary)) return bad(res, "Salary must be a number");

            // Never lock the company out: you cannot demote yourself, and the last CEO stays CEO.
            if (set.designation && set.designation !== target.designation) {
                  if (same(target._id, req.user._id)) return bad(res, "You cannot change your own designation", 403);
                  if (target.designation === CEO && (await ceo_count()) <= 1) return bad(res, "There must be at least one Chief Executive Officer", 409);
            }
            if (!Object.keys(set).length) return bad(res, "Nothing to update");

            await user_collection.updateOne({ _id: target._id }, { $set: set });
            const { password, ...user } = await user_collection.findOne({ _id: target._id });
            ok(res, "Employee updated", user);
      } catch (e) { next(e); }
};

const reset_password = async (req, res, next) => {
      try {
            if (!ObjectId.isValid(req.params.id)) return bad(res, "Invalid id");
            const password = String(req.body?.password || "");
            if (password.length < 6) return bad(res, "Password should be at least 6 characters long");
            const r = await user_collection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: { password: await bcrypt.hash(password, 10) } });
            if (r.matchedCount !== 1) return bad(res, "Employee not found", 404);
            ok(res, "Password reset");
      } catch (e) { next(e); }
};

const remove = async (req, res, next) => {
      try {
            if (!ObjectId.isValid(req.params.id)) return bad(res, "Invalid id");
            const target = await user_collection.findOne({ _id: new ObjectId(req.params.id) });
            if (!target) return bad(res, "Employee not found", 404);
            if (same(target._id, req.user._id)) return bad(res, "You cannot delete your own account", 403);
            if (target.designation === CEO && (await ceo_count()) <= 1) return bad(res, "There must be at least one Chief Executive Officer", 409);
            await user_collection.deleteOne({ _id: target._id });
            ok(res, "Employee deleted");
      } catch (e) { next(e); }
};

// Deactivate or reactivate an account. A deactivated person cannot sign in and their token stops working.
const set_status = async (req, res, next) => {
      try {
            if (!ObjectId.isValid(req.params.id)) return bad(res, "Invalid id");
            if (typeof req.body?.active !== "boolean") return bad(res, "active must be true or false");
            const target = await user_collection.findOne({ _id: new ObjectId(req.params.id) });
            if (!target) return bad(res, "Employee not found", 404);
            if (!req.body.active) {
                  if (same(target._id, req.user._id)) return bad(res, "You cannot deactivate your own account", 403);
                  if (target.designation === CEO && (await ceo_count()) <= 1) return bad(res, "There must be at least one active Chief Executive Officer", 409);
            }
            await user_collection.updateOne({ _id: target._id }, { $set: { active: req.body.active } });
            ok(res, req.body.active ? "Account activated" : "Account deactivated");
      } catch (e) { next(e); }
};

module.exports = { list, update, reset_password, set_status, remove };

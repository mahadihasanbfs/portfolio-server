const { ObjectId } = require("mongodb");
const { att_records_collection, att_leaves_collection, user_collection, hr_settings_collection } = require("../Collection/all_collection");
const c = require("./attendance_calc");
const pay = require("./payroll_calc");
const discord = require("./discord_module");

const ok = (res, message, data) => res.send({ success: true, message, request_time: new Date().getTime(), data });
const bad = (res, message, status = 400) =>
      res.status(status).send({ success: false, message, request_time: new Date().getTime() });

const LEAVE_TYPES = ["casual", "sick", "annual", "unpaid"];
const POLICY_KEY = "attendance_policy";
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

const REPORT_PART = (v) => String(v ?? "").trim().slice(0, 1500);
// "None", "no", "not yet", "-" and the like mean there is no blocker.
const NO_BLOCKER = /^(none|no|nil|nothing|n\/a|na|not yet|no blockers?|nope|nai|nei|no issues?|all good|fine|[-.]+)$/i;
const BLOCKER_PART = (v) => { const t = REPORT_PART(v); return NO_BLOCKER.test(t.replace(/[.!\s]+$/g, "")) ? "" : t; };
// Accepts { done, progress, blockers }, or a plain { report } (treated as "done"), or falls back to the saved one.
const report_parts = (body = {}, rec = {}) => {
      if (body.done !== undefined || body.progress !== undefined || body.blockers !== undefined) {
            return { done: REPORT_PART(body.done), progress: REPORT_PART(body.progress), blockers: BLOCKER_PART(body.blockers) };
      }
      if (body.report !== undefined) return { done: REPORT_PART(body.report), progress: "", blockers: "" };
      if (rec.reportParts) return rec.reportParts;
      return rec.report ? { done: REPORT_PART(rec.report), progress: "", blockers: "" } : null;
};
const compose_report = (p) => [p.done && `Done: ${p.done}`, p.progress && `In progress: ${p.progress}`, p.blockers && `Blockers: ${p.blockers}`].filter(Boolean).join("\n");

const leaves_of = (userId) => att_leaves_collection.find({ userId }).toArray();

// Leave limits, the off-day bonus and company holidays, editable by admins.
const load_policy = async () => {
      const saved = (await hr_settings_collection.findOne({ _id: POLICY_KEY })) || {};
      return { ...pay.DEFAULT_POLICY, ...saved, quotas: { ...pay.DEFAULT_POLICY.quotas, ...Object.fromEntries(Object.entries(saved.quotas || {}).filter(([, v]) => v !== null)) }, holidays: saved.holidays || [] };
};
const holiday_set = (policy) => new Set(policy.holidays.map((h) => h.date));

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
                  { $set: { sessions: next_sessions, checkOut: null }, $unset: { dayClosedAt: "" } }
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
            const open = !sessions[sessions.length - 1].out;

            // A normal check-out (break, lunch, stepping out) needs nothing. Ending the day (`endDay: true`) needs the daily report:
            // what was done (required), what is in progress, and any blocker. After the first one it is pre-filled.
            const endDay = req.body?.endDay === true;
            if (!open && !endDay) return bad(res, "You are not checked in", 409);
            let parts = null;
            if (endDay) {
                  parts = report_parts(req.body, rec);
                  if (!parts || parts.done.length < 10) return bad(res, "Write what you finished today (at least 10 characters) to end your day", 422);
            }

            // Already stepped out (lunch, etc.) and now finishing for the day: keep the sessions, just add the report.
            const closed = open ? sessions.map((x, i) => (i === sessions.length - 1 ? { ...x, out: now.toISOString() } : x)) : sessions;
            const changes = {
                  sessions: closed, checkOut: open ? now.toISOString() : sessions[sessions.length - 1].out, workedMinutes: c.total_minutes(closed),
                  ...(endDay ? { report: compose_report(parts), reportParts: parts, reportAt: now.toISOString(), dayClosedAt: now.toISOString() } : {}),
            };
            // Ending the day twice (came back and worked more): the new report replaces the old, which is kept in the history.
            const update = { $set: changes };
            if (endDay && rec.reportParts) update.$push = { reportHistory: { parts: rec.reportParts, at: rec.reportAt || rec.createdAt } };
            const r = await att_records_collection.updateOne({ _id: rec._id, sessions: rec.sessions }, update);
            if (r.matchedCount !== 1) return bad(res, "Attendance changed, try again", 409);
            // Awaited (and it never throws) so the post is not lost if the host stops the function after replying.
            if (endDay) await discord.notify_checkout(req.user, { ...rec, ...changes }, parts);
            ok(res, endDay ? "Day ended" : "Checked out", { ...rec, ...changes, ...c.day_view({ sessions: closed }) });
      } catch (e) { next(e); }
};

// One person's month: every day with its status, plus the summary. Used by the employee and by admins.
const month_for = async (userId, month) => {
      const records = await att_records_collection.find({ userId, date: { $regex: `^${month}-` } }).sort({ date: 1 }).toArray();
      const leaves = await leaves_of(userId);
      const holidays = holiday_set(await load_policy());
      const todayDate = c.local_parts().date;
      const byDate = new Map(records.map((r) => [r.date, r]));
      const days = c.month_days(month).map((date) => {
            const r = byDate.get(date);
            return { date, status: c.day_status({ date, record: r, leaves, today: todayDate, holidays }), ...c.day_view(r), report: r?.report || "", reportParts: r?.reportParts || null, reportAt: r?.reportAt || null, reportHistory: r?.reportHistory || [] };
      });
      return { month, days, summary: c.summarize({ month, records, leaves, today: todayDate, holidays }), leaves };
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
            const policy = await load_policy();
            const holidays = holiday_set(policy);
            if (pay.working_days(from, to, holidays) === 0) return bad(res, "Those dates are all weekend or holiday, nothing to request", 422);
            // Paid types have a yearly cap. Pending requests count so nobody can queue up more than the limit.
            const cap = policy.quotas[type];
            if (cap !== null && cap !== undefined) {
                  for (const year of new Set([from.slice(0, 4), to.slice(0, 4)])) {
                        const asked = pay.working_days(from < `${year}-01-01` ? `${year}-01-01` : from, to > `${year}-12-31` ? `${year}-12-31` : to, holidays);
                        const has = pay.leave_usage(mine, Number(year), holidays)[type] || { used: 0, pending: 0 };
                        const left = Math.max(0, cap - has.used - has.pending);
                        if (asked > left) return bad(res, `${type[0].toUpperCase()}${type.slice(1)} leave: you asked for ${asked} day${asked === 1 ? "" : "s"} but only ${left} of ${cap} left in ${year}`, 422);
                  }
            }
            const doc = { userId: uid(req), from, to, type, reason: String(reason).slice(0, 500), status: "pending", createdAt: new Date().toISOString() };
            const r = await att_leaves_collection.insertOne(doc);
            await discord.notify_leave_requested(req.user, doc);
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

// Yearly allowance per leave type, what is used / waiting, and the company holidays.
const balance = async (req, res, next) => {
      try {
            const year = Number(req.query.year) || Number(c.local_parts().date.slice(0, 4));
            const policy = await load_policy();
            const usage = pay.leave_usage(await leaves_of(uid(req)), year, holiday_set(policy));
            const types = LEAVE_TYPES.map((type) => {
                  const cap = policy.quotas[type] ?? null;
                  const { used = 0, pending = 0 } = usage[type] || {};
                  return { type, cap, used, pending, left: cap === null ? null : Math.max(0, cap - used - pending) };
            });
            ok(res, "Leave balance", { year, types, holidays: policy.holidays });
      } catch (e) { next(e); }
};

/* ============ admin ============ */

const staff = () => user_collection.find({}, { projection: { name: 1, email: 1, designation: 1, image: 1 } }).sort({ name: 1 }).toArray();

const daily = async (req, res, next) => {
      try {
            const date = req.query.date || c.local_parts().date;
            if (!c.is_date(date)) return bad(res, "date must be YYYY-MM-DD");
            const holidays = holiday_set(await load_policy());
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
                  const status = c.day_status({ date, record: r, leaves: onLeave.has(id) ? [{ status: "approved", from: date, to: date }] : [], today: todayDate, holidays });
                  return { userId: id, name: u.name, email: u.email, designation: u.designation, image: u.image, status, ...c.day_view(r), note: r?.note || "", report: r?.report || "", reportParts: r?.reportParts || null, reportAt: r?.reportAt || null, reportHistory: r?.reportHistory || [] };
            });
            const counts = rows.reduce((a, r) => ({ ...a, [r.status]: (a[r.status] || 0) + 1 }), {});
            ok(res, "Daily attendance", { date, weekend: c.is_off(date, holidays), counts, rows });
      } catch (e) { next(e); }
};

const monthly = async (req, res, next) => {
      try {
            const month = req.query.month || c.local_parts().date.slice(0, 7);
            if (!c.is_month(month)) return bad(res, "month must be YYYY-MM");
            const first = `${month}-01`;
            const last = c.month_days(month).pop();
            const holidays = holiday_set(await load_policy());
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
                  return { userId: id, name: u.name, email: u.email, designation: u.designation, ...c.summarize({ month, records: recBy.get(id) || [], leaves: leaveBy.get(id) || [], today: todayDate, holidays }) };
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

const get_policy = async (req, res, next) => { try { ok(res, "Attendance policy", await load_policy()); } catch (e) { next(e); } };

const put_policy = async (req, res, next) => {
      try {
            const { quotas = {}, offDayBonusPercent, lateDaysPerDeduction, holidays } = req.body || {};
            const set = {};
            const clean = {};
            for (const t of LEAVE_TYPES) {
                  if (!(t in quotas)) continue;
                  const v = quotas[t];
                  if (v === null || v === "") return bad(res, `${t}: set a yearly limit in days`);
                  if (Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 366) clean[t] = Number(v);
                  else return bad(res, `${t}: days must be a whole number from 0 to 366`);
            }
            Object.entries(clean).forEach(([t, v]) => { set[`quotas.${t}`] = v; });
            if (offDayBonusPercent !== undefined) {
                  const n = Number(offDayBonusPercent);
                  if (!Number.isFinite(n) || n < 0 || n > 500) return bad(res, "Bonus percent must be between 0 and 500");
                  set.offDayBonusPercent = n;
            }
            if (lateDaysPerDeduction !== undefined) {
                  const n = Number(lateDaysPerDeduction);
                  if (!Number.isInteger(n) || n < 0 || n > 31) return bad(res, "Late days per deduction must be a whole number from 0 to 31 (0 = off)");
                  set.lateDaysPerDeduction = n;
            }
            if (holidays !== undefined) {
                  if (!Array.isArray(holidays) || holidays.length > 200) return bad(res, "holidays must be a list of up to 200");
                  if (holidays.some((h) => !c.is_date(h?.date))) return bad(res, "Every holiday needs a date (YYYY-MM-DD)");
                  const seen = new Map(holidays.map((h) => [h.date, String(h.name || "Holiday").trim().slice(0, 60) || "Holiday"]));
                  set.holidays = [...seen].map(([date, name]) => ({ date, name })).sort((a, b) => (a.date < b.date ? -1 : 1));
            }
            if (Object.keys(set).length) await hr_settings_collection.updateOne({ _id: POLICY_KEY }, { $set: set }, { upsert: true });
            ok(res, "Policy saved", await load_policy());
      } catch (e) { next(e); }
};

// Salary for a month for everyone, from attendance + approved unpaid leave + weekend/holiday work.
const payroll = async (req, res, next) => {
      try {
            const month = req.query.month || c.local_parts().date.slice(0, 7);
            if (!c.is_month(month)) return bad(res, "month must be YYYY-MM");
            const policy = await load_policy();
            const holidays = holiday_set(policy);
            const last = c.month_days(month).pop();
            const [users, records, leaves] = await Promise.all([
                  user_collection.find({}, { projection: { name: 1, email: 1, designation: 1, image: 1, salary: 1 } }).sort({ name: 1 }).toArray(),
                  att_records_collection.find({ date: { $regex: `^${month}-` } }).toArray(),
                  att_leaves_collection.find({ status: "approved", from: { $lte: last }, to: { $gte: `${month}-01` } }).toArray(),
            ]);
            const today = c.local_parts().date;
            const group = (rows) => rows.reduce((m, r) => m.set(r.userId, [...(m.get(r.userId) || []), r]), new Map());
            const recBy = group(records), leaveBy = group(leaves);
            const rows = users.map((u) => {
                  const id = String(u._id);
                  return { userId: id, name: u.name, email: u.email, designation: u.designation, ...pay.payroll({ salary: u.salary, month, records: recBy.get(id) || [], leaves: leaveBy.get(id) || [], holidays, today, offDayBonusPercent: policy.offDayBonusPercent, lateDaysPerDeduction: policy.lateDaysPerDeduction }) };
            });
            const total = rows.reduce((t, r) => ({ salary: t.salary + r.salary, deduction: t.deduction + r.deduction, bonus: t.bonus + r.bonus, net: t.net + r.net }), { salary: 0, deduction: 0, bonus: 0, net: 0 });
            ok(res, "Payroll", { month, offDayBonusPercent: policy.offDayBonusPercent, lateDaysPerDeduction: policy.lateDaysPerDeduction, total, rows });
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
            await discord.notify_leave_decided(leave.userId, (await user_collection.findOne({ _id: new ObjectId(leave.userId) }, { projection: { name: 1 } }))?.name || "Someone", leave, status, String(note).trim(), req.user.name || "an admin");
            ok(res, `Leave ${status}`);
      } catch (e) { next(e); }
};

module.exports = { balance, get_policy, put_policy, payroll, today, check_in, check_out, my_month, request_leave, my_leaves, cancel_leave, daily, monthly, employee, correct_record, delete_record, all_leaves, decide_leave };

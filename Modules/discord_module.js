const axios = require("axios");
const { ObjectId } = require("mongodb");
const { hr_settings_collection, user_collection, att_records_collection, att_leaves_collection, sales_leads_collection, sales_visits_collection } = require("../Collection/all_collection");
const c = require("./attendance_calc");

const ok = (res, message, data) => res.send({ success: true, message, request_time: new Date().getTime(), data });
const bad = (res, message, status = 400) =>
      res.status(status).send({ success: false, message, request_time: new Date().getTime() });

const KEY = "discord";
const DEFAULTS = { enabled: false, webhookUrl: "", time: "18:00", leaveEvents: true, checkoutReports: true, reminder: true, reminderTime: "19:00", lastReminderDate: "", sections: { attendance: true, leave: true, sales: true }, lastSentDate: "", lastError: "" };
// Only real Discord webhooks, so this cannot be pointed at other servers.
const WEBHOOK = /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/;

const load = async () => ({ ...DEFAULTS, ...(await hr_settings_collection.findOne({ _id: KEY })) });
const save = (set) => hr_settings_collection.updateOne({ _id: KEY }, { $set: set }, { upsert: true });
const mask = (url) => (url ? `https://discord.com/api/webhooks/…${url.slice(-6)}` : "");
const public_view = (s) => ({ enabled: s.enabled, hasWebhook: Boolean(s.webhookUrl), webhookMasked: mask(s.webhookUrl), time: s.time, leaveEvents: s.leaveEvents, checkoutReports: s.checkoutReports, reminder: s.reminder, reminderTime: s.reminderTime, sections: s.sections, lastSentDate: s.lastSentDate, lastError: s.lastError });

const post = async (webhookUrl, payload) => {
      await axios.post(webhookUrl, { username: "Bright Future Soft", ...payload }, { timeout: 10000 });
};

const trim = (list, max = 1000) => {
      let out = "";
      for (let i = 0; i < list.length; i += 1) {
            const next = (out ? ", " : "") + list[i];
            if (out.length + next.length > max - 20) return `${out} +${list.length - i} more`;
            out += next;
      }
      return out || "–";
};

// Today's report as a Discord embed.
const build_report = async (date, sections) => {
      const embeds = [];
      const [users, records, leaves, pending] = await Promise.all([
            user_collection.find({}, { projection: { name: 1 } }).toArray(),
            att_records_collection.find({ date }).toArray(),
            att_leaves_collection.find({ status: "approved", from: { $lte: date }, to: { $gte: date } }).toArray(),
            att_leaves_collection.find({ status: "pending" }).toArray(),
      ]);
      const name = new Map(users.map((u) => [String(u._id), u.name]));
      const rec = new Map(records.map((r) => [r.userId, r]));
      const onLeave = new Map(leaves.map((l) => [l.userId, l]));

      const groups = { present: [], late: [], leave: [], absent: [] };
      users.forEach((u) => {
            const id = String(u._id);
            const r = rec.get(id);
            if (r) groups[r.status === "late" ? "late" : "present"].push(u.name);
            else if (onLeave.has(id)) groups.leave.push(`${u.name} (${onLeave.get(id).type})`);
            else groups.absent.push(u.name);
      });

      if (sections.attendance) {
            embeds.push({
                  title: `📋 Attendance · ${date}`,
                  color: 0x1c65b4,
                  description: `**${groups.present.length + groups.late.length}** of ${users.length} came in · **${groups.late.length}** late · **${groups.leave.length}** on leave · **${groups.absent.length}** absent`,
                  fields: [
                        { name: `✅ Present (${groups.present.length})`, value: trim(groups.present) },
                        { name: `⏰ Late (${groups.late.length})`, value: trim(groups.late) },
                        { name: `🏖️ On leave (${groups.leave.length})`, value: trim(groups.leave) },
                        { name: `❌ No check-in (${groups.absent.length})`, value: trim(groups.absent) },
                  ],
            });
            const reports = records.filter((r) => r.report).map((r) => { const t = (r.reportParts?.done || r.report).replace(/\s+/g, " "); return `**${name.get(r.userId) || "Unknown"}:** ${t.slice(0, 140)}${t.length > 140 ? "…" : ""}${r.reportParts?.blockers ? " ⛔" : ""}`; });
            const missing = records.filter((r) => !r.report && c.sessions_of(r).length).map((r) => name.get(r.userId) || "Unknown");
            embeds.push({
                  title: `📝 Daily work reports (${reports.length})`,
                  color: 0x8b5cf6,
                  description: reports.length ? reports.join("\n").slice(0, 3800) : "No reports yet.",
                  ...(missing.length ? { footer: { text: `No report yet: ${missing.join(", ")}`.slice(0, 2000) } } : {}),
            });
      }

      if (sections.leave) {
            const decided = (await att_leaves_collection.find({ status: { $in: ["approved", "rejected"] }, decidedAt: { $exists: true } }).sort({ decidedAt: -1 }).limit(60).toArray()).filter((l) => c.local_parts(l.decidedAt).date === date);
            const line = (l) => `${name.get(l.userId) || "Unknown"} · ${l.from === l.to ? l.from : `${l.from} → ${l.to}`} · ${l.type}`;
            embeds.push({
                  title: "🌴 Leave",
                  color: 0xf59e0b,
                  fields: [
                        { name: `⏳ Waiting for approval (${pending.length})`, value: trim(pending.map(line), 1000) },
                        { name: `Decided today (${decided.length})`, value: trim(decided.map((l) => `${l.status === "approved" ? "✅" : "🚫"} ${line(l)}${l.decisionNote ? ` — ${l.decisionNote}` : ""}`), 1000) },
                  ],
            });
      }

      if (sections.sales) {
            const dayStart = new Date(`${date}T00:00:00+06:00`).toISOString();
            const dayEnd = new Date(new Date(dayStart).getTime() + 86400000).toISOString();
            const [visits, won, open] = await Promise.all([
                  sales_visits_collection.find({ at: { $gte: dayStart, $lt: dayEnd } }).toArray(),
                  sales_leads_collection.find({ stage: "won", wonAt: { $gte: dayStart, $lt: dayEnd } }).toArray(),
                  sales_leads_collection.find({ stage: { $nin: ["won", "lost"] }, nextFollowUp: { $ne: "", $lte: date } }).toArray(),
            ]);
            const per = visits.reduce((m, v) => m.set(v.userId, (m.get(v.userId) || 0) + 1), new Map());
            embeds.push({
                  title: "💼 Software sales",
                  color: 0x10b981,
                  fields: [
                        { name: `📍 Visits (${visits.length})`, value: trim([...per.entries()].map(([id, n]) => `${name.get(id) || "Unknown"}: ${n}`)) },
                        { name: `🏆 Won today (${won.length})`, value: trim(won.map((l) => `${l.company || l.contactName} · ৳${Math.round(l.value || 0).toLocaleString("en-IN")}`)) },
                        { name: "📞 Follow-ups due or overdue", value: String(open.length) },
                  ],
            });
      }
      return { content: `**Daily report · ${date}**`, embeds };
};

// Sends today's report once per day. `force` skips the time and already-sent checks (manual send).
const send_daily = async ({ force = false } = {}) => {
      const s = await load();
      if (!s.webhookUrl) return { sent: false, reason: "No Discord webhook is set" };
      const { date, minutes } = c.local_parts();
      if (!force) {
            if (!s.enabled) return { sent: false, reason: "Daily report is off" };
            if (c.is_weekend(date)) return { sent: false, reason: "Weekend" };
            const [h, m] = String(s.time).split(":").map(Number);
            if (minutes < h * 60 + m) return { sent: false, reason: "Not time yet" };
            // Claim today atomically so two schedulers cannot both post it.
            const claim = await hr_settings_collection.updateOne({ _id: KEY, lastSentDate: { $ne: date } }, { $set: { lastSentDate: date } });
            if (claim.matchedCount !== 1) return { sent: false, reason: "Already sent today" };
      }
      try {
            await post(s.webhookUrl, await build_report(date, s.sections));
            await save({ lastSentDate: date, lastError: "" });
            return { sent: true, date };
      } catch (e) {
            await save({ lastError: `${new Date().toISOString()} ${e.message}`.slice(0, 300), ...(force ? {} : { lastSentDate: "" }) });
            throw e;
      }
};

// After the reminder time, name everyone who checked in today but has not pressed "End day" (no daily report yet). Once a day.
const remind_end_day = async () => {
      const s = await load();
      if (!s.webhookUrl || !s.enabled || !s.reminder) return { sent: false, reason: "Reminder is off" };
      const { date, minutes } = c.local_parts();
      const holidays = new Set(((await hr_settings_collection.findOne({ _id: "attendance_policy" }))?.holidays || []).map((h) => h.date));
      if (c.is_off(date, holidays)) return { sent: false, reason: "Weekend or holiday" };
      const [h, m] = String(s.reminderTime).split(":").map(Number);
      if (minutes < h * 60 + m) return { sent: false, reason: "Not time yet" };
      const claim = await hr_settings_collection.updateOne({ _id: KEY, lastReminderDate: { $ne: date } }, { $set: { lastReminderDate: date } });
      if (claim.matchedCount !== 1) return { sent: false, reason: "Already reminded today" };
      try {
            const open = await att_records_collection.find({ date, dayClosedAt: { $exists: false } }).toArray();
            if (!open.length) return { sent: false, reason: "Everyone ended the day" };
            const users = await user_collection.find({ _id: { $in: open.map((r) => new ObjectId(r.userId)) } }, { projection: { name: 1 } }).toArray();
            const name = new Map(users.map((u) => [String(u._id), u.name]));
            const still = open.filter((r) => c.day_view(r).open).map((r) => name.get(r.userId) || "Unknown");
            const out = open.filter((r) => !c.day_view(r).open).map((r) => name.get(r.userId) || "Unknown");
            const fields = [
                  still.length && { name: `🟢 Still checked in (${still.length})`, value: trim(still) },
                  out.length && { name: `🚪 Stepped out, no report (${out.length})`, value: trim(out) },
            ].filter(Boolean);
            await post(s.webhookUrl, { embeds: [{ title: "⏰ Please end your day", description: "Press **End day** and write your daily report.", color: 0xf59e0b, fields, timestamp: new Date().toISOString() }] });
            return { sent: true, date, count: open.length };
      } catch (e) {
            await save({ lastError: `${new Date().toISOString()} ${e.message}`.slice(0, 300), lastReminderDate: "" });
            throw e;
      }
};

// Run by the scheduler: the daily report and the end-of-day reminder, each when its time comes.
const tick = async () => {
      const out = {};
      for (const [k, fn] of [["daily", send_daily], ["reminder", remind_end_day]]) {
            try { out[k] = await fn(); } catch (e) { out[k] = { sent: false, error: e.message }; console.error(`Discord ${k} failed:`, e.message); }
      }
      return out;
};

// Instant message when someone asks for leave or it is decided. Never blocks or breaks the request.
const notify = async (embed, flag = "leaveEvents") => {
      try {
            const s = await load();
            if (!s.enabled || !s[flag] || !s.webhookUrl) return;
            await post(s.webhookUrl, { embeds: [{ color: 0xf59e0b, ...embed, timestamp: new Date().toISOString() }] });
      } catch (e) { console.error("Discord notify failed:", e.message); }
};
const leave_range = (l) => (l.from === l.to ? l.from : `${l.from} → ${l.to}`);
const notify_leave_requested = (user, l) => notify({ title: "🌴 New leave request", description: `**${user.name}** asked for **${l.type}** leave\n${leave_range(l)}${l.reason ? `\n“${l.reason}”` : ""}\nWaiting for approval.` });
const notify_leave_decided = (who, name, l, status, note, by) => notify({ title: status === "approved" ? "✅ Leave approved" : "🚫 Leave rejected", color: status === "approved" ? 0x10b981 : 0xef4444, description: `**${name}** · ${l.type} · ${leave_range(l)}\nBy ${by}${note ? `\n“${note}”` : ""}` });

/* ============ routes ============ */

const get_settings = async (req, res, next) => { try { ok(res, "Discord settings", public_view(await load())); } catch (e) { next(e); } };

const put_settings = async (req, res, next) => {
      try {
            const b = req.body || {};
            const set = {};
            if (typeof b.webhookUrl === "string" && b.webhookUrl.trim()) {
                  if (!WEBHOOK.test(b.webhookUrl.trim())) return bad(res, "That does not look like a Discord webhook URL (https://discord.com/api/webhooks/…)");
                  set.webhookUrl = b.webhookUrl.trim();
            }
            if (b.clearWebhook === true) { set.webhookUrl = ""; set.enabled = false; }
            if (typeof b.enabled === "boolean") set.enabled = b.enabled;
            if (typeof b.leaveEvents === "boolean") set.leaveEvents = b.leaveEvents;
            if (typeof b.checkoutReports === "boolean") set.checkoutReports = b.checkoutReports;
            if (typeof b.reminder === "boolean") set.reminder = b.reminder;
            if (b.reminderTime !== undefined) { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.reminderTime)) return bad(res, "Reminder time must be HH:MM"); set.reminderTime = b.reminderTime; }
            if (b.time !== undefined) { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.time)) return bad(res, "Time must be HH:MM"); set.time = b.time; }
            if (b.sections && typeof b.sections === "object") set.sections = { attendance: Boolean(b.sections.attendance), leave: Boolean(b.sections.leave), sales: Boolean(b.sections.sales) };
            const now = await load();
            if (set.enabled && !(set.webhookUrl ?? now.webhookUrl)) return bad(res, "Add a webhook URL before turning the report on");
            await save(set);
            ok(res, "Saved", public_view(await load()));
      } catch (e) { next(e); }
};

const test = async (req, res, next) => {
      try {
            const s = await load();
            if (!s.webhookUrl) return bad(res, "Add a webhook URL first");
            await post(s.webhookUrl, { content: `✅ Connected. Daily reports from Bright Future Soft will appear here. (Test by ${req.user.name})` });
            ok(res, "Test message sent");
      } catch (e) { bad(res, `Discord rejected it: ${e.response?.status || ""} ${e.message}`, 502); }
};

const send_now = async (req, res, next) => {
      try {
            const r = await send_daily({ force: true });
            r.sent ? ok(res, "Report sent to Discord", r) : bad(res, r.reason);
      } catch (e) { bad(res, `Discord rejected it: ${e.response?.status || ""} ${e.message}`, 502); }
};

// Called by Vercel Cron (Authorization: Bearer $CRON_SECRET). It posts once per day, after the configured time.
const cron = async (req, res, next) => {
      try {
            const secret = process.env.CRON_SECRET;
            if (!secret || req.header("Authorization") !== `Bearer ${secret}`) return bad(res, "Forbidden", 403);
            ok(res, "Cron", await tick());
      } catch (e) { next(e); }
};

const clock = (iso) => new Date(iso).toLocaleTimeString("en-US", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit" });
const bullets = (t) => String(t).split(/\r?\n/).map((l) => l.replace(/^\s*[-•*·]\s*/, "").trim()).filter(Boolean).map((l) => `• ${l}`).join("\n");
const long_date = (date) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" });
// Discord only draws an avatar when the link looks like an image, so extension-less links get a harmless .jpg suffix.
const avatar = (url) => (/^https:\/\//.test(url || "") ? (/\.(png|jpe?g|webp|gif)(\?|$)/i.test(url) ? url : `${url}${url.includes("?") ? "&" : "?"}.jpg`) : undefined);

// Posted the moment someone checks out: who (name, role, photo), what they did, and the hours.
const notify_checkout = (user, rec, parts) => {
      const sessions = c.sessions_of(rec);
      const mins = c.total_minutes(sessions);
      const hours = `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
      const late = rec.status === "late";
      const blocks = [
            `**✅ Done today**\n${bullets(parts.done)}`,
            parts.progress && `**🔄 In progress**\n${bullets(parts.progress)}`,
            parts.blockers && `**⛔ Needs help**\n${bullets(parts.blockers)}`,
      ].filter(Boolean);
      const icon = avatar(user.image);
      return notify({
            author: { name: [user.name || "Someone", user.designation].filter(Boolean).join(" · "), ...(icon ? { icon_url: icon } : {}) },
            title: `Daily report · ${long_date(rec.date)}`,
            description: blocks.join("\n\n").slice(0, 4000),
            color: parts.blockers ? 0xf59e0b : late ? 0xf97316 : 0x22c55e,
            footer: { text: `🕐 ${sessions[0] ? clock(sessions[0].in) : "–"} → ${clock(rec.checkOut)}   ·   ⏱ ${hours}   ·   ${late ? "⚠️ Came in late" : "✅ On time"}` },
      }, "checkoutReports");
};

module.exports = { tick, remind_end_day, notify_checkout, send_daily, notify_leave_requested, notify_leave_decided, get_settings, put_settings, test, send_now, cron };

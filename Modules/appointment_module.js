const crypto = require("crypto");
const { ObjectId } = require("mongodb");
const { appointment_collection, meeting_collection } = require("../Collection/all_collection");
const { ALL_CLOSED, WEEKEND_DAYS, BLOCKED_WINDOWS } = require("./holidays");
const { APPOINTMENT_TYPES, MEETING_MODES, MODE_INFO, prep_for } = require("./appointment_types");
const google = require("./appointment_google");
const mail = require("./appointment_mail");
const { check_map } = require("./appointment_office");

// Business hours in Dhaka time (UTC+6, no DST). Weekend, holidays, company events
// and weekly no-meeting windows come from ./holidays.
const TZ_OFFSET = "+06:00";
const OPEN_HOUR = 10;
const CLOSE_HOUR = 18;
const BLOCK_MINUTES = 30; // slots start on a 30-minute grid
const MAX_DAYS_AHEAD = 60;
const STATUSES = ["confirmed", "completed", "cancelled"];
const MIN_NOTICE_HOURS = 2; // visitors can change or cancel up to this long before the start

const with_timeout = (promise, ms = 9000) =>
      Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error("timed out")), ms))]);
const safe_tz = (tz) => {
      try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return tz; } catch { return "Asia/Dhaka"; }
};
const reminder_flags = (start_ms) => {
      const diff = start_ms - Date.now();
      return { d1: diff <= 24 * 3600 * 1000, h1: diff <= 3600 * 1000 };
};
const public_view = ({ slot_keys, slot_key, cancel_token, ...rest }) => rest;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

let index_ready = null;
const ensure_index = () => {
      // Every 30-minute block a booking covers is a key; unique while the booking is active.
      // Cancelling unsets slot_keys, which frees the blocks.
      if (!index_ready) {
            index_ready = appointment_collection
                  .createIndex({ slot_keys: 1 }, { unique: true, sparse: true })
                  .catch(err => { index_ready = null; throw err; });
      }
      return index_ready;
};

const slot_start = (date, time) => new Date(`${date}T${time}:00${TZ_OFFSET}`);
const type_by_id = id => APPOINTMENT_TYPES.find(t => t.id === id);
const closed_dates = () => new Set(ALL_CLOSED().map(h => h.date));
const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const mins = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

const block_keys = (date, time, duration) => {
      const keys = [];
      for (let m = mins(time); m < mins(time) + duration; m += BLOCK_MINUTES) keys.push(`${date}_${hhmm(m)}`);
      return keys;
};

// Candidate start times for a day and duration, ignoring existing bookings.
const candidate_slots = (date, duration) => {
      const d = new Date(`${date}T12:00:00${TZ_OFFSET}`);
      if (isNaN(d.getTime())) return [];
      if (WEEKEND_DAYS.includes(d.getUTCDay()) || closed_dates().has(date)) return [];
      const windows = BLOCKED_WINDOWS.filter(w => w.day === d.getUTCDay());
      const slots = [];
      for (let m = OPEN_HOUR * 60; m + duration <= CLOSE_HOUR * 60; m += BLOCK_MINUTES) {
            if (windows.some(w => m < mins(w.to) && m + duration > mins(w.from))) continue;
            slots.push(hhmm(m));
      }
      return slots;
};

const in_window = (date) => {
      const start = slot_start(date, "00:00").getTime();
      const now = Date.now();
      return start + 24 * 3600 * 1000 > now && start < now + MAX_DAYS_AHEAD * 24 * 3600 * 1000;
};

// Time ranges already taken on a date: active appointments + internal staff meetings.
const busy_ranges = async (date, exclude_id) => {
      const day_start = slot_start(date, "00:00").getTime();
      const day_end = day_start + 24 * 3600 * 1000;
      const ranges = [];

      const booked = await appointment_collection
            .find({ date, status: { $ne: "cancelled" }, ...(ObjectId.isValid(exclude_id) ? { _id: { $ne: new ObjectId(exclude_id) } } : {}) })
            .project({ start_time: 1, duration_minutes: 1 })
            .toArray();
      for (const a of booked) {
            const start = new Date(a.start_time).getTime();
            if (!isNaN(start)) ranges.push([start, start + (a.duration_minutes || 30) * 60000]);
      }

      const meetings = await meeting_collection.find({ status: { $ne: "end" } }).project({ date: 1, duration: 1 }).toArray();
      for (const m of meetings) {
            if (typeof m.date !== "string") continue;
            // datetime-local strings carry no timezone: treat them as Dhaka time.
            const has_tz = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(m.date);
            const iso = has_tz ? m.date : `${m.date.length === 16 ? `${m.date}:00` : m.date}${TZ_OFFSET}`;
            const start = new Date(iso).getTime();
            if (isNaN(start)) continue;
            const end = start + (Number(m.duration) || 60) * 60000;
            if (end > day_start && start < day_end) ranges.push([start, end]);
      }
      return ranges;
};

const is_free = (date, time, duration, busy) => {
      const st = slot_start(date, time).getTime();
      const en = st + duration * 60000;
      return st > Date.now() && !busy.some(([a, b]) => st < b && en > a);
};

// Online bookings get a Google Meet link when the company Google Calendar is connected.
const attach_meet = async (a) => {
      if (a.mode !== "online") return a;
      try {
            const start = new Date(a.start_time);
            const r = await with_timeout(google.create_meet({
                  id: String(a._id),
                  title: `${a.type_name}: ${a.name}`,
                  description: `${a.type_name} booked on brightfuturesoft.com\n${a.topic || ""}`,
                  start,
                  end: new Date(start.getTime() + a.duration_minutes * 60000),
                  attendee: { email: a.email, name: a.name },
            }));
            if (r) {
                  a.meet_link = r.meetLink;
                  a.google_event_id = r.eventId;
                  await appointment_collection.updateOne({ _id: a._id }, { $set: { meet_link: r.meetLink, google_event_id: r.eventId } });
            }
      } catch (err) {
            console.error("Google Meet creation failed:", err.message);
      }
      return a;
};

// Moves a confirmed appointment to a new date/time. Returns { doc } or { status, message }.
const reschedule_core = async (cur, date, time) => {
      const type = type_by_id(cur.type) || { duration: cur.duration_minutes || 30 };
      const duration = cur.duration_minutes || type.duration;
      if (cur.status !== "confirmed") return { status: 409, message: "Only confirmed appointments can be rescheduled" };
      if (!DATE_RE.test(date || "") || !TIME_RE.test(time || "") || !in_window(date)
            || !candidate_slots(date, duration).includes(time)
            || slot_start(date, time).getTime() <= Date.now()) {
            return { status: 400, message: "Selected slot is not available" };
      }
      const busy = await busy_ranges(date, cur._id);
      if (!is_free(date, time, duration, busy)) return { status: 409, message: "That time is no longer available. Pick another." };

      const start = slot_start(date, time);
      const set = {
            date, time,
            start_time: start.toISOString(),
            slot_keys: block_keys(date, time, duration),
            reminders: reminder_flags(start.getTime()),
            rescheduled_at: Date.now(),
      };
      try {
            await ensure_index();
            await appointment_collection.updateOne({ _id: cur._id, status: "confirmed" }, { $set: set, $inc: { reschedule_count: 1 } });
      } catch (err) {
            if (err && err.code === 11000) return { status: 409, message: "That time was just taken. Pick another." };
            throw err;
      }
      const doc = { ...cur, ...set };
      if (doc.google_event_id) {
            try { await with_timeout(google.move_event(doc.google_event_id, start, new Date(start.getTime() + duration * 60000))); }
            catch (err) { console.error("Google event move failed:", err.message); }
      }
      mail.rescheduled(doc, cur.start_time).catch(() => {});
      return { doc };
};

// Frees the time, removes the Calendar event and tells the visitor/team.
const cancel_core = async (cur, by) => {
      await appointment_collection.updateOne({ _id: cur._id }, { $set: { status: "cancelled", cancelled_at: Date.now(), cancelled_by: by }, $unset: { slot_keys: "", slot_key: "" } });
      if (cur.google_event_id) {
            try { await with_timeout(google.delete_event(cur.google_event_id)); }
            catch (err) { console.error("Google event delete failed:", err.message); }
      }
      await mail.cancelled(cur, by).catch(() => {});
};

const load_with_token = async (id, token) => {
      if (!ObjectId.isValid(id) || typeof token !== "string" || !token) return null;
      return appointment_collection.findOne({ _id: new ObjectId(id), cancel_token: token });
};

const too_late = (a) => new Date(a.start_time).getTime() - Date.now() < MIN_NOTICE_HOURS * 3600 * 1000;

const get_types = (req, res) => {
      res.send({ success: true, message: "Appointment types", data: APPOINTMENT_TYPES, modes: MODE_INFO, request_time: Date.now() });
};

const check_map_link = async (req, res, next) => {
      try {
            res.send({ success: true, data: await check_map(req.query.url), request_time: Date.now() });
      } catch (error) {
            next(error);
      }
};

const get_office = async (req, res, next) => {
      try {
            res.send({ success: true, data: await require("./appointment_office").office(), request_time: Date.now() });
      } catch (error) {
            next(error);
      }
};

const get_holidays = (req, res) => {
      res.send({ success: true, message: "Company holidays and events", data: ALL_CLOSED(), weekend_days: WEEKEND_DAYS, request_time: Date.now() });
};

const get_slots = async (req, res, next) => {
      try {
            const { date } = req.query;
            const type = type_by_id(req.query.type || "consultation");
            if (!DATE_RE.test(date || "") || !type) {
                  return res.status(400).send({ success: false, message: "Valid date (YYYY-MM-DD) and type required" });
            }
            if (!in_window(date)) {
                  return res.send({ success: true, data: [], request_time: Date.now() });
            }
            const busy = await busy_ranges(date, req.query.exclude);
            const slots = candidate_slots(date, type.duration).filter(t => is_free(date, t, type.duration, busy));
            res.send({ success: true, message: "Available slots", data: slots, duration: type.duration, request_time: Date.now() });
      } catch (error) {
            next(error);
      }
};

const book_appointment = async (req, res, next) => {
      try {
            const { name, email, phone, company, topic, date, time, type: type_id, mode, tz, visit_address, visit_map_url, agenda } = req.body || {};
            const clean = (v, max) => String(v || "").trim().slice(0, max);
            const type = type_by_id(clean(type_id, 40) || "consultation");
            if (!type) return res.status(400).send({ success: false, message: "Unknown appointment type" });

            const doc = {
                  type: type.id,
                  type_name: type.name,
                  name: clean(name, 100),
                  email: clean(email, 150),
                  phone: clean(phone, 40),
                  company: clean(company, 120),
                  topic: clean(topic, 1000),
                  agenda: clean(agenda, 1000),
                  mode: MEETING_MODES.includes(mode) ? mode : "online",
                  date: clean(date, 10),
                  time: clean(time, 5),
                  tz: safe_tz(clean(tz, 60)),
            };
            if (doc.mode === "client_site") {
                  const given = clean(visit_map_url, 500);
                  if (!given) return res.status(400).send({ success: false, message: "Share the map link of the place we should visit" });
                  const map = await check_map(given);
                  if (!map.valid) {
                        return res.status(400).send({ success: false, message: "Map link must be an https Google Maps, Apple Maps or OpenStreetMap link" });
                  }
                  doc.visit_map_url = map.url;
                  doc.visit_lat = map.lat;
                  doc.visit_lng = map.lng;
                  doc.visit_place = map.place;
                  doc.visit_address = clean(visit_address, 300) || map.place || "See map link";
            }
            if (doc.mode === "phone" && doc.phone.replace(/\D/g, "").length < 6) {
                  return res.status(400).send({ success: false, message: "Enter the phone number we should call" });
            }
            if (doc.agenda.length < 5) {
                  return res.status(400).send({ success: false, message: "Tell us the meeting agenda" });
            }
            if (!doc.name || !doc.email || !doc.date || !doc.time) {
                  return res.status(400).send({ success: false, message: "name, email, date and time are required" });
            }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(doc.email)) {
                  return res.status(400).send({ success: false, message: "Invalid email" });
            }
            if (!DATE_RE.test(doc.date) || !TIME_RE.test(doc.time) || !in_window(doc.date)
                  || !candidate_slots(doc.date, type.duration).includes(doc.time)
                  || slot_start(doc.date, doc.time).getTime() <= Date.now()) {
                  return res.status(400).send({ success: false, message: "Selected slot is not available" });
            }
            const busy = await busy_ranges(doc.date);
            if (!is_free(doc.date, doc.time, type.duration, busy)) {
                  return res.status(409).send({ success: false, message: "That time is no longer available. Pick another." });
            }

            await ensure_index();
            doc.slot_keys = block_keys(doc.date, doc.time, type.duration);
            doc.start_time = slot_start(doc.date, doc.time).toISOString();
            doc.duration_minutes = type.duration;
            doc.status = "confirmed";
            doc.cancel_token = crypto.randomBytes(12).toString("hex");
            doc.created_at = Date.now();
            doc.reminders = reminder_flags(slot_start(doc.date, doc.time).getTime());

            try {
                  const result = await appointment_collection.insertOne(doc);
                  doc._id = result.insertedId;
                  await attach_meet(doc);
                  doc.email_sent = await mail.confirmation(doc).catch(() => false);
                  await appointment_collection.updateOne({ _id: doc._id }, { $set: { email_sent: doc.email_sent } });
                  const { slot_keys, ...data } = doc; // cancel_token goes back once, to the booker
                  res.send({ success: true, message: "Appointment booked", data: { ...data, prep: prep_for(doc) }, request_time: Date.now() });
            } catch (err) {
                  if (err && err.code === 11000) {
                        return res.status(409).send({ success: false, message: "That time was just taken. Pick another." });
                  }
                  throw err;
            }
      } catch (error) {
            next(error);
      }
};

// Visitor self-service: view, reschedule and cancel. All need the id plus the token from the booking email.
const manage_get = async (req, res, next) => {
      try {
            const a = await load_with_token(req.query.id, req.query.token);
            if (!a) return res.status(404).send({ success: false, message: "Booking not found" });
            res.send({ success: true, data: { ...public_view(a), prep: prep_for(a), can_change: a.status === "confirmed" && !too_late(a), min_notice_hours: MIN_NOTICE_HOURS }, request_time: Date.now() });
      } catch (error) {
            next(error);
      }
};

const reschedule_with_token = async (req, res, next) => {
      try {
            const { id, token, date, time } = req.body || {};
            const a = await load_with_token(id, token);
            if (!a) return res.status(404).send({ success: false, message: "Booking not found" });
            if (too_late(a)) return res.status(403).send({ success: false, message: `Changes close ${MIN_NOTICE_HOURS} hours before the meeting. Please contact us.` });
            const r = await reschedule_core(a, date, time);
            if (!r.doc) return res.status(r.status).send({ success: false, message: r.message });
            res.send({ success: true, message: "Appointment rescheduled", data: public_view(r.doc), request_time: Date.now() });
      } catch (error) {
            next(error);
      }
};

const cancel_with_token = async (req, res, next) => {
      try {
            const { id, token } = req.body || {};
            const a = await load_with_token(id, token);
            if (!a || a.status !== "confirmed") return res.status(404).send({ success: false, message: "Booking not found or already cancelled" });
            if (too_late(a)) return res.status(403).send({ success: false, message: `Changes close ${MIN_NOTICE_HOURS} hours before the meeting. Please contact us.` });
            await cancel_core(a, "visitor");
            res.send({ success: true, message: "Appointment cancelled", request_time: Date.now() });
      } catch (error) {
            next(error);
      }
};

// Dashboard: move any appointment, no notice limit.
const admin_reschedule = async (req, res, next) => {
      try {
            const id = req.query.appointment_id;
            if (!ObjectId.isValid(id)) return res.status(400).send({ success: false, message: "Invalid appointment_id" });
            const cur = await appointment_collection.findOne({ _id: new ObjectId(id) });
            if (!cur) return res.status(404).send({ success: false, message: "Appointment not found" });
            const r = await reschedule_core(cur, (req.body || {}).date, (req.body || {}).time);
            if (!r.doc) return res.status(r.status).send({ success: false, message: r.message });
            res.send({ success: true, message: "Appointment rescheduled", request_time: Date.now() });
      } catch (error) {
            next(error);
      }
};

// Email reminders: about 24 hours and about 1 hour before the start. Safe to call often; each is sent once.
const run_reminders = async () => {
      const now = Date.now();
      const due = await appointment_collection.find({
            status: "confirmed",
            start_time: { $gt: new Date(now).toISOString(), $lte: new Date(now + 24 * 3600 * 1000).toISOString() },
      }).toArray();
      let sent = 0;
      for (const a of due) {
            const diff = new Date(a.start_time).getTime() - now;
            const which = diff <= 3600 * 1000 ? "h1" : "d1";
            if (a.reminders?.[which]) continue;
            // Claim first so two overlapping runs never send twice.
            const claim = await appointment_collection.updateOne(
                  { _id: a._id, [`reminders.${which}`]: { $ne: true } },
                  { $set: which === "h1" ? { "reminders.h1": true, "reminders.d1": true } : { "reminders.d1": true } }
            );
            if (!claim.modifiedCount) continue;
            await mail.reminder(a, which === "h1" ? "in about 1 hour" : "in about 24 hours").catch(() => {});
            sent++;
      }
      return { checked: due.length, sent };
};

// Admin: create Meet links for upcoming online bookings that were made before Google was connected, and email them.
const backfill_meets = async (req, res, next) => {
      try {
            const list = await appointment_collection.find({
                  status: "confirmed", mode: "online", meet_link: { $in: [null, ""] }, start_time: { $gt: new Date().toISOString() },
            }).sort({ start_time: 1 }).limit(50).toArray();
            let created = 0;
            for (const a of list) {
                  await attach_meet(a);
                  if (a.meet_link) {
                        created++;
                        await mail.link_added(a).catch(() => {});
                  }
            }
            res.send({ success: true, data: { checked: list.length, created }, request_time: Date.now() });
      } catch (error) {
            next(error);
      }
};

const reminders_cron = async (req, res, next) => {
      try {
            const secret = process.env.CRON_SECRET;
            const given = (req.header("Authorization") || "").replace(/^Bearer /, "") || req.query.key;
            if (!secret || given !== secret) return res.status(403).send({ success: false, message: "Forbidden" });
            res.send({ success: true, data: await run_reminders(), request_time: Date.now() });
      } catch (error) {
            next(error);
      }
};

const list_appointments = async (req, res, next) => {
      try {
            const data = await appointment_collection
                  .find()
                  .project({ slot_keys: 0, slot_key: 0, cancel_token: 0 })
                  .sort({ start_time: 1 })
                  .toArray();
            res.send({ success: true, message: "All appointments", data, request_time: Date.now() });
      } catch (error) {
            next(error);
      }
};

const update_appointment = async (req, res, next) => {
      try {
            const id = req.query.appointment_id;
            const { status } = req.body || {};
            if (!ObjectId.isValid(id) || !STATUSES.includes(status)) {
                  return res.status(400).send({ success: false, message: "Valid appointment_id and status required" });
            }
            const cur = await appointment_collection.findOne({ _id: new ObjectId(id) });
            if (!cur) return res.status(404).send({ success: false, message: "Appointment not found" });

            if (status === "cancelled" && cur.status !== "cancelled") {
                  await cancel_core(cur, "team");
                  return res.send({ success: true, message: "Appointment cancelled", request_time: Date.now() });
            }
            const update = { $set: { status } };
            if (cur.status === "cancelled") {
                  // Reviving a cancelled booking: re-claim its blocks, fails if someone else took them.
                  update.$set.slot_keys = block_keys(cur.date, cur.time, cur.duration_minutes || 30);
            }
            try {
                  await ensure_index();
                  await appointment_collection.updateOne({ _id: cur._id }, update);
            } catch (err) {
                  if (err && err.code === 11000) {
                        return res.status(409).send({ success: false, message: "Time already rebooked by someone else" });
                  }
                  throw err;
            }
            res.send({ success: true, message: "Appointment updated", request_time: Date.now() });
      } catch (error) {
            next(error);
      }
};

const delete_appointment = async (req, res, next) => {
      try {
            const id = req.query.appointment_id;
            if (!ObjectId.isValid(id)) return res.status(400).send({ success: false, message: "Invalid appointment_id" });
            await appointment_collection.deleteOne({ _id: new ObjectId(id) });
            res.send({ success: true, message: "Appointment deleted", request_time: Date.now() });
      } catch (error) {
            next(error);
      }
};

module.exports = { backfill_meets, check_map_link, get_office, run_reminders, reminders_cron, manage_get, reschedule_with_token, admin_reschedule, get_types, get_holidays, get_slots, book_appointment, cancel_with_token, list_appointments, update_appointment, delete_appointment };

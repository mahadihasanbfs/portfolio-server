// Pure attendance rules (no DB). All dates are Bangladesh local time (UTC+6, no DST).
const TZ_OFFSET_MIN = 6 * 60;

const CONFIG = {
      startMinutes: 10 * 60, // office starts 10:00
      graceMinutes: 15, // check-in up to 10:15 is on time
      weekend: [5, 6], // 0 = Sunday ... 5 = Friday, 6 = Saturday
};

// { date: 'YYYY-MM-DD', minutes: minutes since local midnight } for a Date or ISO string.
const local_parts = (when = new Date()) => {
      const local = new Date(new Date(when).getTime() + TZ_OFFSET_MIN * 60000);
      return {
            date: local.toISOString().slice(0, 10),
            minutes: local.getUTCHours() * 60 + local.getUTCMinutes(),
      };
};

const is_date = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const is_month = (s) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

const is_weekend = (date, weekend = CONFIG.weekend) => weekend.includes(new Date(`${date}T00:00:00Z`).getUTCDay());

// Every YYYY-MM-DD from `from` to `to` inclusive.
const days_between = (from, to) => {
      const out = [];
      for (let t = Date.parse(from); t <= Date.parse(to); t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
      return out;
};

const month_days = (month) => {
      const [y, m] = month.split('-').map(Number);
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      return days_between(`${month}-01`, `${month}-${String(last).padStart(2, '0')}`);
};

const status_for_check_in = (minutes, cfg = CONFIG) => (minutes > cfg.startMinutes + cfg.graceMinutes ? 'late' : 'present');

const worked_minutes = (checkIn, checkOut) =>
      checkIn && checkOut ? Math.max(0, Math.round((new Date(checkOut) - new Date(checkIn)) / 60000)) : 0;

// A day holds many check-in/check-out sessions. Older records only have checkIn/checkOut: treat them as one session.
const sessions_of = (rec) => {
      if (!rec) return [];
      if (Array.isArray(rec.sessions)) return rec.sessions;
      return rec.checkIn ? [{ in: rec.checkIn, out: rec.checkOut || null }] : [];
};

// Minutes across closed sessions.
const total_minutes = (sessions) => sessions.reduce((n, x) => n + worked_minutes(x.in, x.out), 0);

// First check-in, last check-out (null while a session is still open), and whether the person is in the office now.
const day_view = (rec) => {
      const sessions = sessions_of(rec);
      const last = sessions[sessions.length - 1];
      return {
            sessions,
            checkIn: sessions[0]?.in || null,
            checkOut: last && last.out ? last.out : null,
            open: Boolean(last && !last.out),
            workedMinutes: total_minutes(sessions),
      };
};

// 'HH:MM' on a local date -> ISO instant.
const local_time_to_iso = (date, hhmm) => {
      const [h, m] = hhmm.split(':').map(Number);
      return new Date(Date.parse(`${date}T00:00:00Z`) + (h * 60 + m - TZ_OFFSET_MIN) * 60000).toISOString();
};

const approved_leave_on = (leaves, date) => leaves.some((l) => l.status === 'approved' && l.from <= date && date <= l.to);

// Status of one person on one day. `today` is the local date now.
const day_status = ({ date, record, leaves, today }) => {
      if (record) return record.status;
      if (approved_leave_on(leaves, date)) return 'leave';
      if (is_weekend(date)) return 'weekend';
      if (date > today) return 'upcoming';
      if (date === today) return 'not_in';
      return 'absent';
};

const summarize = ({ month, records, leaves, today }) => {
      const byDate = new Map(records.map((r) => [r.date, r]));
      const out = { present: 0, late: 0, leave: 0, absent: 0, workedMinutes: 0, workingDays: 0 };
      month_days(month).forEach((date) => {
            const st = day_status({ date, record: byDate.get(date), leaves, today });
            if (!is_weekend(date) && date <= today) out.workingDays += 1;
            if (st === 'present' || st === 'late' || st === 'leave' || st === 'absent') out[st] += 1;
      });
      out.workedMinutes = records.reduce((n, r) => n + total_minutes(sessions_of(r)), 0);
      return out;
};

module.exports = {
      CONFIG, local_parts, is_date, is_month, is_weekend, days_between, month_days,
      status_for_check_in, worked_minutes, sessions_of, total_minutes, day_view, local_time_to_iso, approved_leave_on, day_status, summarize,
};

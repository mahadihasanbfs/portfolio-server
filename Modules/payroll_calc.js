// Pure salary rules (no DB). Salary is monthly; a day's pay is salary / 30.
const c = require('./attendance_calc');

const DAYS_IN_PAY_MONTH = 30;
const DEFAULT_POLICY = {
      // Days a year per type. Once used up, no more can be requested. Unpaid days are deducted from salary.
      quotas: { casual: 10, sick: 10, annual: 15, unpaid: 5 },
      // Working on a weekend or holiday pays that day's salary plus this much extra on top.
      offDayBonusPercent: 20,
      // Every this many late arrivals costs one day's pay. 0 turns it off.
      lateDaysPerDeduction: 3,
};

const money = (n) => Math.round(n * 100) / 100;

const worked = (rec) => c.sessions_of(rec).length > 0;

// Working days (not weekend or holiday) in an inclusive range.
const working_days = (from, to, holidays) => c.days_between(from, to).filter((d) => !c.is_off(d, holidays)).length;

/*
 * One person's pay for a month, up to `today`.
 * - absent working day: lose a day's pay
 * - approved unpaid leave on a working day: lose a day's pay
 * - every `lateDaysPerDeduction` late arrivals on working days: lose a day's pay
 * - worked on a weekend/holiday: earn that day's pay again plus `offDayBonusPercent`
 */
const payroll = ({ salary, month, records, leaves, holidays, today, offDayBonusPercent = DEFAULT_POLICY.offDayBonusPercent, lateDaysPerDeduction = DEFAULT_POLICY.lateDaysPerDeduction }) => {
      const base = Number(salary) || 0;
      const daily = base / DAYS_IN_PAY_MONTH;
      const byDate = new Map(records.map((r) => [r.date, r]));
      const unpaid = leaves.filter((l) => l.status === 'approved' && l.type === 'unpaid');
      let absent = 0, unpaidLeave = 0, offDaysWorked = 0, lateDays = 0;
      c.month_days(month).forEach((date) => {
            if (date > today) return;
            const rec = byDate.get(date);
            if (c.is_off(date, holidays)) {
                  if (worked(rec)) offDaysWorked += 1;
                  return;
            }
            if (rec) { if (rec.status === 'late') lateDays += 1; return; }
            if (unpaid.some((l) => l.from <= date && date <= l.to)) unpaidLeave += 1;
            else if (c.day_status({ date, record: rec, leaves, today, holidays }) === 'absent') absent += 1;
      });
      const lateCharged = lateDaysPerDeduction > 0 ? Math.floor(lateDays / lateDaysPerDeduction) : 0;
      const deduction = money((absent + unpaidLeave + lateCharged) * daily);
      const bonus = money(offDaysWorked * daily * (1 + offDayBonusPercent / 100));
      return { salary: base, daily: money(daily), absent, unpaidLeave, lateDays, lateCharged, offDaysWorked, deduction, bonus, net: money(base - deduction + bonus) };
};

// Days used by a person in a calendar year: { casual: { used, pending }, ... } counted in working days.
const leave_usage = (leaves, year, holidays) => {
      const out = {};
      leaves.forEach((l) => {
            if (l.status !== 'approved' && l.status !== 'pending') return;
            const from = l.from < `${year}-01-01` ? `${year}-01-01` : l.from;
            const to = l.to > `${year}-12-31` ? `${year}-12-31` : l.to;
            if (from > to) return;
            const n = working_days(from, to, holidays);
            const row = (out[l.type] ||= { used: 0, pending: 0 });
            row[l.status === 'approved' ? 'used' : 'pending'] += n;
      });
      return out;
};

module.exports = { DEFAULT_POLICY, DAYS_IN_PAY_MONTH, working_days, payroll, leave_usage };

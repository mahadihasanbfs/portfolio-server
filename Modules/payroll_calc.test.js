const test = require('node:test');
const assert = require('node:assert');
const p = require('./payroll_calc');
const c = require('./attendance_calc');

const rec = (date) => ({ date, status: 'present', sessions: [{ in: c.local_time_to_iso(date, '10:00'), out: c.local_time_to_iso(date, '18:00') }] });

test('absent day costs a day, weekend work earns day + 20%', () => {
      // Nov 2026: Sun 1 ... Fri 6, Sat 7. Today = Tue 10 (not counted yet). Working days before it: 1-5, 8, 9.
      const records = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-08', '2026-11-07'].map(rec); // missing 9th, worked Sat 7th
      const r = p.payroll({ salary: 30000, month: '2026-11', records, leaves: [], holidays: new Set(), today: '2026-11-10' });
      assert.strictEqual(r.daily, 1000);
      assert.strictEqual(r.absent, 1);
      assert.strictEqual(r.offDaysWorked, 1);
      assert.strictEqual(r.deduction, 1000);
      assert.strictEqual(r.bonus, 1200);
      assert.strictEqual(r.net, 30200);
});

test('unpaid leave deducts, paid leave does not, holiday work earns bonus', () => {
      const leaves = [{ status: 'approved', type: 'unpaid', from: '2026-11-01', to: '2026-11-01' }, { status: 'approved', type: 'casual', from: '2026-11-02', to: '2026-11-02' }];
      const r = p.payroll({ salary: 30000, month: '2026-11', records: [rec('2026-11-03')], leaves, holidays: new Set(['2026-11-03']), today: '2026-11-03' });
      assert.strictEqual(r.unpaidLeave, 1);
      assert.strictEqual(r.absent, 0);
      assert.strictEqual(r.offDaysWorked, 1);
      assert.strictEqual(r.net, 30000 - 1000 + 1200);
});

test('leave usage counts working days only and clips to the year', () => {
      const leaves = [{ status: 'approved', type: 'casual', from: '2026-11-01', to: '2026-11-08' }, { status: 'pending', type: 'sick', from: '2026-12-30', to: '2027-01-02' }];
      const u = p.leave_usage(leaves, 2026, new Set(['2026-11-03']));
      assert.strictEqual(u.casual.used, 5); // 1,2,4,5,8 (3 holiday, 6-7 weekend)
      assert.strictEqual(u.sick.pending, 2); // Dec 30 (Wed), Dec 31 (Thu)
});

test('every 3 late arrivals cost a day', () => {
      const late = (date) => ({ ...rec(date), status: 'late' });
      const records = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'].map(late);
      const r = p.payroll({ salary: 30000, month: '2026-11', records, leaves: [], holidays: new Set(), today: '2026-11-06' });
      assert.strictEqual(r.lateDays, 5);
      assert.strictEqual(r.lateCharged, 1);
      assert.strictEqual(r.net, 29000);
      const off = p.payroll({ salary: 30000, month: '2026-11', records, leaves: [], holidays: new Set(), today: '2026-11-06', lateDaysPerDeduction: 0 });
      assert.strictEqual(off.net, 30000);
});

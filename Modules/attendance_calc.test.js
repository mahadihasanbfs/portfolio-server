const test = require('node:test');
const assert = require('node:assert');
const c = require('./attendance_calc');

test('local_parts uses UTC+6', () => {
      assert.deepStrictEqual(c.local_parts('2026-10-30T18:30:00Z'), { date: '2026-10-31', minutes: 30 });
      assert.deepStrictEqual(c.local_parts('2026-10-30T04:00:00Z'), { date: '2026-10-30', minutes: 600 });
});

test('weekend is Friday and Saturday', () => {
      assert.ok(c.is_weekend('2026-10-30')); // Friday
      assert.ok(c.is_weekend('2026-10-31')); // Saturday
      assert.ok(!c.is_weekend('2026-11-01')); // Sunday
});

test('late only after grace', () => {
      assert.strictEqual(c.status_for_check_in(10 * 60 + 15), 'present');
      assert.strictEqual(c.status_for_check_in(10 * 60 + 16), 'late');
});

test('worked minutes and local time conversion', () => {
      const a = c.local_time_to_iso('2026-11-01', '10:00');
      assert.strictEqual(a, '2026-11-01T04:00:00.000Z');
      assert.strictEqual(c.worked_minutes(a, c.local_time_to_iso('2026-11-01', '18:30')), 510);
      assert.strictEqual(c.worked_minutes(a, null), 0);
});

test('day_status and summarize', () => {
      const leaves = [{ status: 'approved', from: '2026-11-03', to: '2026-11-03' }, { status: 'pending', from: '2026-11-04', to: '2026-11-04' }];
      const day = (date, status, mins) => ({ date, status, sessions: [{ in: c.local_time_to_iso(date, '10:00'), out: c.local_time_to_iso(date, `${String(10 + Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`) }] });
      const records = [day('2026-11-01', 'present', 480), day('2026-11-02', 'late', 400)];
      const today = '2026-11-05'; // Thursday
      assert.strictEqual(c.day_status({ date: '2026-11-03', record: null, leaves, today }), 'leave');
      assert.strictEqual(c.day_status({ date: '2026-11-04', record: null, leaves, today }), 'absent'); // pending leave does not count
      assert.strictEqual(c.day_status({ date: '2026-11-05', record: null, leaves, today }), 'not_in');
      assert.strictEqual(c.day_status({ date: '2026-11-06', record: null, leaves, today }), 'weekend'); // Friday
      const s = c.summarize({ month: '2026-11', records, leaves, today });
      assert.deepStrictEqual(s, { present: 1, late: 1, leave: 1, absent: 1, workedMinutes: 880, workingDays: 5 });
});

test('sessions: many per day, legacy record, open session', () => {
      const t = (h, m) => c.local_time_to_iso('2026-11-01', `${h}:${m}`);
      const rec = { sessions: [{ in: t('10', '00'), out: t('13', '00') }, { in: t('14', '00'), out: t('18', '30') }] };
      assert.strictEqual(c.total_minutes(rec.sessions), 180 + 270);
      const v = c.day_view(rec);
      assert.deepStrictEqual([v.checkIn, v.checkOut, v.open, v.workedMinutes], [t('10', '00'), t('18', '30'), false, 450]);
      const open = c.day_view({ sessions: [{ in: t('10', '00'), out: t('12', '00') }, { in: t('13', '00'), out: null }] });
      assert.deepStrictEqual([open.checkOut, open.open, open.workedMinutes], [null, true, 120]);
      const legacy = c.day_view({ checkIn: t('10', '00'), checkOut: t('11', '00') });
      assert.deepStrictEqual([legacy.sessions.length, legacy.workedMinutes], [1, 60]);
      assert.strictEqual(c.day_view(null).checkIn, null);
});

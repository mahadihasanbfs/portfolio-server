const test = require('node:test');
const assert = require('node:assert');
const { calc_invoice, calc_payslip, check_payment, aging } = require('./accounts_calc');

const today = new Date('2026-10-21');

test('invoice totals: discount then tax', () => {
      const inv = calc_invoice({
            items: [{ description: 'Web', qty: 1, rate: 100000 }, { description: 'Hosting', qty: 2, rate: 5000 }],
            discount: 10000,
            taxPercent: 5,
            dueDate: '2026-12-01',
      }, today);
      assert.strictEqual(inv.subtotal, 110000);
      assert.strictEqual(inv.tax, 5000);
      assert.strictEqual(inv.total, 105000);
      assert.strictEqual(inv.status, 'unpaid');
});

test('advance + partial payments leave a balance, then paid', () => {
      const base = { items: [{ qty: 1, rate: 100000 }], dueDate: '2026-12-01' };
      let inv = calc_invoice({ ...base, payments: [{ amount: 30000, type: 'advance' }] }, today);
      assert.strictEqual(inv.status, 'partial');
      assert.strictEqual(inv.balance, 70000);
      inv = calc_invoice({ ...base, payments: [{ amount: 30000 }, { amount: 70000 }] }, today);
      assert.strictEqual(inv.status, 'paid');
      assert.strictEqual(inv.balance, 0);
});

test('overdue when past due with balance; partial payment stays overdue', () => {
      const inv = calc_invoice({ items: [{ qty: 1, rate: 1000 }], dueDate: '2026-10-01', payments: [{ amount: 100 }] }, today);
      assert.strictEqual(inv.status, 'overdue');
      assert.strictEqual(inv.daysOverdue, 20);
});

test('paid invoice is never overdue; draft and cancelled win', () => {
      const paid = calc_invoice({ items: [{ qty: 1, rate: 1000 }], dueDate: '2026-01-01', payments: [{ amount: 1000 }] }, today);
      assert.strictEqual(paid.status, 'paid');
      assert.strictEqual(calc_invoice({ items: [{ qty: 1, rate: 1 }], draft: true, dueDate: '2026-01-01' }, today).status, 'draft');
      assert.strictEqual(calc_invoice({ items: [{ qty: 1, rate: 1 }], cancelled: true }, today).status, 'cancelled');
});

test('discount cannot exceed subtotal', () => {
      const inv = calc_invoice({ items: [{ qty: 1, rate: 500 }], discount: 900 }, today);
      assert.strictEqual(inv.total, 0);
});

test('payslip: TA/DA, extra work, bonus minus advance recovery', () => {
      const slip = calc_payslip({
            earnings: [
                  { kind: 'basic', amount: 30000 },
                  { kind: 'ta', amount: 2000 },
                  { kind: 'da', amount: 1500 },
                  { kind: 'extra', amount: 4000 },
                  { kind: 'bonus', amount: 3000 },
            ],
            deductions: [{ kind: 'advance', amount: 5000 }, { kind: 'absence', amount: 1000 }],
            payments: [{ amount: 20000 }],
      });
      assert.strictEqual(slip.gross, 40500);
      assert.strictEqual(slip.totalDeductions, 6000);
      assert.strictEqual(slip.net, 34500);
      assert.strictEqual(slip.balance, 14500);
      assert.strictEqual(slip.status, 'partial');
});

test('check_payment rejects zero and overpay', () => {
      assert.ok(check_payment(0, 100));
      assert.ok(check_payment(101, 100));
      assert.strictEqual(check_payment(100, 100), null);
});

test('aging buckets', () => {
      const rows = [
            { status: 'unpaid', daysOverdue: 0, balance: 100 },
            { status: 'overdue', daysOverdue: 10, balance: 200 },
            { status: 'overdue', daysOverdue: 45, balance: 300 },
            { status: 'overdue', daysOverdue: 120, balance: 400 },
            { status: 'paid', daysOverdue: 0, balance: 0 },
      ];
      assert.deepStrictEqual(aging(rows), { current: 100, '0-30': 200, '31-60': 300, '61-90': 0, '90+': 400 });
});

test('foreign invoice: BDT values use invoice rate, payments use their own rate', () => {
      const inv = calc_invoice({
            currency: 'USD',
            exchangeRate: 120,
            items: [{ qty: 1, rate: 1000 }],
            dueDate: '2026-12-01',
            payments: [{ amount: 400, rate: 125 }, { amount: 100 }],
      }, today);
      assert.strictEqual(inv.total, 1000);
      assert.strictEqual(inv.totalBase, 120000);
      assert.strictEqual(inv.balance, 500);
      assert.strictEqual(inv.balanceBase, 60000);
      assert.strictEqual(inv.paidBase, 400 * 125 + 100 * 120);
      assert.strictEqual(inv.fxGain, 2000);
});

test('BDT invoice ignores any stray exchange rate', () => {
      const inv = calc_invoice({ currency: 'BDT', exchangeRate: 99, items: [{ qty: 1, rate: 500 }] }, today);
      assert.strictEqual(inv.exchangeRate, 1);
      assert.strictEqual(inv.totalBase, 500);
});

test('aging uses BDT balance for foreign invoices', () => {
      const inv = calc_invoice({ currency: 'USD', exchangeRate: 100, items: [{ qty: 1, rate: 10 }], dueDate: '2026-10-01' }, today);
      assert.strictEqual(aging([inv])['0-30'], 1000);
});

test('provident fund: 5% employee off net, 5% company on top, base = basic', () => {
      const slip = calc_payslip({
            earnings: [{ kind: 'basic', amount: 30000 }, { kind: 'ta', amount: 2000 }, { kind: 'bonus', amount: 3000 }],
            deductions: [{ kind: 'advance', amount: 1000 }],
            pf: { enabled: true, employeePercent: 5, companyPercent: 5, base: 'basic' },
      });
      assert.strictEqual(slip.gross, 35000);
      assert.strictEqual(slip.pf.employee, 1500);
      assert.strictEqual(slip.pf.company, 1500);
      assert.strictEqual(slip.pf.total, 3000);
      assert.strictEqual(slip.totalDeductions, 2500);
      assert.strictEqual(slip.net, 32500); // company share does not change net
});

test('provident fund on gross, and disabled fund changes nothing', () => {
      const earnings = [{ kind: 'basic', amount: 20000 }, { kind: 'extra', amount: 10000 }];
      const onGross = calc_payslip({ earnings, pf: { enabled: true, employeePercent: 5, companyPercent: 5, base: 'gross' } });
      assert.strictEqual(onGross.pf.employee, 1500);
      assert.strictEqual(onGross.net, 28500);
      const off = calc_payslip({ earnings, pf: { enabled: false, employeePercent: 5, companyPercent: 5 } });
      assert.strictEqual(off.net, 30000);
      assert.strictEqual(calc_payslip({ earnings }).pf.total, 0);
});

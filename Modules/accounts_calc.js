// Pure money helpers for invoices and payslips. No DB access, so they can be tested alone.

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const BASE_CURRENCY = 'BDT';
const CURRENCIES = ['BDT', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'AED', 'SAR', 'SGD', 'MYR', 'INR', 'JPY'];

// Rates are BDT per 1 unit of the invoice currency. Kept to 6 decimals, not rounded to cents.
const round_rate = (n) => Math.round(Number(n) * 1e6) / 1e6;

const rate_of = (doc) =>
      (doc.currency || BASE_CURRENCY) === BASE_CURRENCY ? 1 : round_rate(num(doc.exchangeRate)) || 1;

const sum_payments = (payments = []) =>
      round2(payments.reduce((total, p) => total + num(p.amount), 0));

const days_between = (from, to) =>
      Math.floor((new Date(to).setHours(0, 0, 0, 0) - new Date(from).setHours(0, 0, 0, 0)) / 86400000);

// Status is derived on every read, never stored, so it cannot go stale when a due date passes.
const derive_invoice_status = (inv, today = new Date()) => {
      if (inv.cancelled) return 'cancelled';
      if (inv.draft) return 'draft';
      if (inv.balance <= 0 && inv.total > 0) return 'paid';
      if (inv.dueDate && days_between(inv.dueDate, today) > 0) return 'overdue';
      if (inv.paid > 0) return 'partial';
      return 'unpaid';
};

const calc_invoice = (inv, today = new Date()) => {
      const items = (inv.items || []).map((it) => ({
            ...it,
            qty: num(it.qty) || 1,
            rate: num(it.rate),
            amount: round2((num(it.qty) || 1) * num(it.rate)),
      }));
      const subtotal = round2(items.reduce((t, it) => t + it.amount, 0));
      const discount = Math.min(round2(num(inv.discount)), subtotal);
      const taxable = round2(subtotal - discount);
      const tax = round2((taxable * num(inv.taxPercent)) / 100);
      const total = round2(taxable + tax);
      const paid = sum_payments(inv.payments);
      const balance = round2(total - paid);
      const currency = inv.currency || BASE_CURRENCY;
      const exchangeRate = rate_of(inv);
      // Each payment is valued at the rate on the day it arrived; the open balance at the invoice rate.
      const payments = (inv.payments || []).map((p) => ({ ...p, rate: round_rate(num(p.rate)) || exchangeRate }));
      const paidBase = round2(payments.reduce((t, p) => t + num(p.amount) * p.rate, 0));
      const fxGain = round2(paidBase - paid * exchangeRate);
      const out = {
            ...inv, items, subtotal, discount, tax, total, paid, balance, payments,
            currency, exchangeRate,
            totalBase: round2(total * exchangeRate),
            paidBase,
            balanceBase: round2(balance * exchangeRate),
            fxGain,
      };
      out.status = derive_invoice_status(out, today);
      out.daysOverdue =
            out.status === 'overdue' || (out.dueDate && balance > 0 && !out.draft && !out.cancelled)
                  ? Math.max(0, days_between(out.dueDate, today))
                  : 0;
      return out;
};

// Provident fund: the employee's share comes out of pay; the company's share is added on top
// and never touches net pay. Both are credited to the employee's fund balance.
const calc_pf = (pf, earnings, gross) => {
      if (!pf || !pf.enabled) return { enabled: false, employee: 0, company: 0, total: 0 };
      const basic = earnings.filter((e) => e.kind === 'basic').reduce((t, e) => t + e.amount, 0);
      const base = pf.base === 'gross' ? gross : basic;
      const employee = round2((base * num(pf.employeePercent)) / 100);
      const company = round2((base * num(pf.companyPercent)) / 100);
      return {
            enabled: true,
            base: pf.base === 'gross' ? 'gross' : 'basic',
            employeePercent: num(pf.employeePercent),
            companyPercent: num(pf.companyPercent),
            baseAmount: round2(base),
            employee,
            company,
            total: round2(employee + company),
      };
};

const calc_payslip = (slip, today = new Date()) => {
      const earnings = (slip.earnings || []).map((e) => ({ ...e, amount: round2(num(e.amount)) }));
      const deductions = (slip.deductions || []).map((d) => ({ ...d, amount: round2(num(d.amount)) }));
      const gross = round2(earnings.reduce((t, e) => t + e.amount, 0));
      const pf = calc_pf(slip.pf, earnings, gross);
      const otherDeductions = round2(deductions.reduce((t, d) => t + d.amount, 0));
      const totalDeductions = round2(otherDeductions + pf.employee);
      const net = round2(gross - totalDeductions);
      const paid = sum_payments(slip.payments);
      const balance = round2(net - paid);
      let status = 'unpaid';
      if (net > 0 && balance <= 0) status = 'paid';
      else if (paid > 0) status = 'partial';
      return { ...slip, earnings, deductions, pf, otherDeductions, gross, totalDeductions, net, paid, balance, status };
};

// Reject a payment that would push paid above the amount due.
const check_payment = (amount, balance) => {
      const a = round2(num(amount));
      if (a <= 0) return 'Payment amount must be greater than zero';
      if (a > round2(balance)) return `Payment exceeds balance (${round2(balance)})`;
      return null;
};

const AGING_BUCKETS = [
      { key: '0-30', min: 1, max: 30 },
      { key: '31-60', min: 31, max: 60 },
      { key: '61-90', min: 61, max: 90 },
      { key: '90+', min: 91, max: Infinity },
];

const aging = (invoices) => {
      const buckets = Object.fromEntries(AGING_BUCKETS.map((b) => [b.key, 0]));
      let current = 0;
      for (const inv of invoices) {
            if (['draft', 'cancelled', 'paid'].includes(inv.status)) continue;
            if (inv.daysOverdue <= 0) {
                  current = round2(current + (inv.balanceBase ?? inv.balance));
                  continue;
            }
            const b = AGING_BUCKETS.find((x) => inv.daysOverdue >= x.min && inv.daysOverdue <= x.max);
            buckets[b.key] = round2(buckets[b.key] + (inv.balanceBase ?? inv.balance));
      }
      return { current, ...buckets };
};

module.exports = {
      BASE_CURRENCY,
      CURRENCIES,
      round_rate,
      rate_of,
      round2,
      sum_payments,
      derive_invoice_status,
      calc_invoice,
      calc_payslip,
      calc_pf,
      check_payment,
      aging,
};

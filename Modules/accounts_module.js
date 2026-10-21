const { ObjectId } = require("mongodb");
const {
      acc_clients_collection,
      acc_invoices_collection,
      acc_payslips_collection,
      acc_salary_profiles_collection,
      acc_expenses_collection,
      acc_counters_collection,
      user_collection,
} = require("../Collection/all_collection");
const { round2, round_rate, rate_of, BASE_CURRENCY, CURRENCIES, calc_invoice, calc_payslip, check_payment, aging } = require("./accounts_calc");

const ok = (res, message, data) =>
      res.send({ success: true, message, request_time: new Date().getTime(), data });
const bad = (res, message, status = 400) =>
      res.status(status).send({ success: false, message, request_time: new Date().getTime() });

const oid = (id) => (ObjectId.isValid(id) ? new ObjectId(id) : null);
const pick = (src, keys) =>
      Object.fromEntries(keys.filter((k) => src[k] !== undefined).map((k) => [k, src[k]]));

const PAYMENT_KEYS = ["amount", "date", "method", "type", "note"];
const make_payment = (body, defaultRate = 1) => ({
      _id: new ObjectId(),
      ...pick(body, PAYMENT_KEYS),
      amount: round2(body.amount),
      rate: Number(body.rate) > 0 ? round_rate(body.rate) : defaultRate,
      date: body.date || new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
});

/* ================= CLIENTS ================= */

const CLIENT_KEYS = ["name", "company", "email", "phone", "address", "notes"];

const list_clients = async (req, res, next) => {
      try {
            const clients = await acc_clients_collection.find().sort({ name: 1 }).toArray();
            ok(res, "Clients found", clients);
      } catch (e) { next(e); }
};

const create_client = async (req, res, next) => {
      try {
            if (!req.body.name) return bad(res, "Client name is required");
            const doc = { ...pick(req.body, CLIENT_KEYS), createdAt: new Date().toISOString() };
            const r = await acc_clients_collection.insertOne(doc);
            ok(res, "Client added", { ...doc, _id: r.insertedId });
      } catch (e) { next(e); }
};

const update_client = async (req, res, next) => {
      try {
            const _id = oid(req.params.id);
            if (!_id) return bad(res, "Invalid id");
            await acc_clients_collection.updateOne({ _id }, { $set: pick(req.body, CLIENT_KEYS) });
            ok(res, "Client updated", await acc_clients_collection.findOne({ _id }));
      } catch (e) { next(e); }
};

const delete_client = async (req, res, next) => {
      try {
            const _id = oid(req.params.id);
            if (!_id) return bad(res, "Invalid id");
            if (await acc_invoices_collection.countDocuments({ clientId: String(_id) })) {
                  return bad(res, "Client has invoices. Delete or cancel them first.", 409);
            }
            await acc_clients_collection.deleteOne({ _id });
            ok(res, "Client deleted", null);
      } catch (e) { next(e); }
};

/* ================= INVOICES ================= */

const INVOICE_KEYS = [
      "clientId", "kind", "projectName", "issueDate", "dueDate", "periodFrom", "periodTo",
      "items", "discount", "taxPercent", "notes", "terms", "draft", "currency", "exchangeRate",
];

// Returns an error message when currency / rate are unusable, else null.
const currency_problem = ({ currency = BASE_CURRENCY, exchangeRate }) => {
      if (!CURRENCIES.includes(currency)) return `Unsupported currency: ${currency}`;
      if (currency !== BASE_CURRENCY && !(Number(exchangeRate) > 0)) {
            return `Enter the exchange rate (BDT per 1 ${currency})`;
      }
      return null;
};

const normalize_currency = (changes) => {
      if (changes.currency === undefined && changes.exchangeRate === undefined) return;
      const currency = changes.currency || BASE_CURRENCY;
      changes.exchangeRate = currency === BASE_CURRENCY ? 1 : round_rate(changes.exchangeRate);
};

const next_invoice_number = async (issueDate) => {
      const year = new Date(issueDate || Date.now()).getFullYear();
      const counter = await acc_counters_collection.findOneAndUpdate(
            { _id: `invoice-${year}` },
            { $inc: { seq: 1 } },
            { upsert: true, returnDocument: "after" }
      );
      return `INV-${year}-${String(counter.seq).padStart(4, "0")}`;
};

// Snapshot the client on the invoice so later client edits do not rewrite old invoices.
const client_snapshot = async (clientId) => {
      const client = oid(clientId) && (await acc_clients_collection.findOne({ _id: oid(clientId) }));
      if (!client) return null;
      return { name: client.name, company: client.company, email: client.email, phone: client.phone, address: client.address };
};

const list_invoices = async (req, res, next) => {
      try {
            const { clientId, kind, status } = req.query;
            const filter = {};
            if (clientId) filter.clientId = clientId;
            if (kind) filter.kind = kind;
            let rows = (await acc_invoices_collection.find(filter).sort({ issueDate: -1, _id: -1 }).toArray())
                  .map((i) => calc_invoice(i));
            if (status) rows = rows.filter((i) => i.status === status);
            ok(res, "Invoices found", rows);
      } catch (e) { next(e); }
};

const get_invoice = async (req, res, next) => {
      try {
            const _id = oid(req.params.id);
            if (!_id) return bad(res, "Invalid id");
            const inv = await acc_invoices_collection.findOne({ _id });
            if (!inv) return bad(res, "Invoice not found", 404);
            ok(res, "Invoice found", calc_invoice(inv));
      } catch (e) { next(e); }
};

const create_invoice = async (req, res, next) => {
      try {
            const body = req.body;
            if (!body.clientId) return bad(res, "Client is required");
            if (!Array.isArray(body.items) || !body.items.length) return bad(res, "Add at least one item");
            const currencyError = currency_problem(body);
            if (currencyError) return bad(res, currencyError);
            const snapshot = await client_snapshot(body.clientId);
            if (!snapshot) return bad(res, "Client not found", 404);

            const doc = {
                  ...pick(body, INVOICE_KEYS),
                  kind: body.kind || "project",
                  currency: body.currency || BASE_CURRENCY,
                  issueDate: body.issueDate || new Date().toISOString().slice(0, 10),
                  client: snapshot,
                  number: await next_invoice_number(body.issueDate),
                  payments: [],
                  createdAt: new Date().toISOString(),
            };
            normalize_currency(doc);
            const r = await acc_invoices_collection.insertOne(doc);
            ok(res, "Invoice created", calc_invoice({ ...doc, _id: r.insertedId }));
      } catch (e) { next(e); }
};

const update_invoice = async (req, res, next) => {
      try {
            const _id = oid(req.params.id);
            if (!_id) return bad(res, "Invalid id");
            const current = await acc_invoices_collection.findOne({ _id });
            if (!current) return bad(res, "Invoice not found", 404);

            const changes = pick(req.body, INVOICE_KEYS);
            if (changes.clientId && changes.clientId !== current.clientId) {
                  const snapshot = await client_snapshot(changes.clientId);
                  if (!snapshot) return bad(res, "Client not found", 404);
                  changes.client = snapshot;
            }
            if (changes.currency && changes.currency !== (current.currency || BASE_CURRENCY) && current.payments?.length) {
                  return bad(res, "Currency cannot change after payments are recorded", 409);
            }
            const currencyError = currency_problem({ ...current, ...changes });
            if (currencyError) return bad(res, currencyError);
            if (changes.currency !== undefined || changes.exchangeRate !== undefined) {
                  changes.currency = changes.currency || current.currency || BASE_CURRENCY;
                  changes.exchangeRate = changes.exchangeRate ?? current.exchangeRate;
                  normalize_currency(changes);
            }
            const next_state = calc_invoice({ ...current, ...changes });
            if (next_state.total < next_state.paid) {
                  return bad(res, `Total cannot be below the amount already paid (${next_state.paid})`, 409);
            }
            await acc_invoices_collection.updateOne({ _id }, { $set: changes });
            ok(res, "Invoice updated", next_state);
      } catch (e) { next(e); }
};

const set_invoice_cancelled = (cancelled) => async (req, res, next) => {
      try {
            const _id = oid(req.params.id);
            if (!_id) return bad(res, "Invalid id");
            await acc_invoices_collection.updateOne({ _id }, { $set: { cancelled } });
            ok(res, cancelled ? "Invoice cancelled" : "Invoice restored", null);
      } catch (e) { next(e); }
};

const delete_invoice = async (req, res, next) => {
      try {
            const _id = oid(req.params.id);
            if (!_id) return bad(res, "Invalid id");
            const inv = await acc_invoices_collection.findOne({ _id });
            if (!inv) return bad(res, "Invoice not found", 404);
            if (inv.payments?.length) return bad(res, "Invoice has payments. Cancel it instead.", 409);
            await acc_invoices_collection.deleteOne({ _id });
            ok(res, "Invoice deleted", null);
      } catch (e) { next(e); }
};

// Shared by invoices and payslips: record a payment, rejecting overpayment.
const add_payment_to = (collection, calc, label) => async (req, res, next) => {
      try {
            const _id = oid(req.params.id);
            if (!_id) return bad(res, "Invalid id");
            const doc = await collection.findOne({ _id });
            if (!doc) return bad(res, `${label} not found`, 404);
            const current = calc(doc);
            if (current.status === "cancelled" || current.status === "draft") {
                  return bad(res, `Cannot take payment on a ${current.status} ${label.toLowerCase()}`, 409);
            }
            const problem = check_payment(req.body.amount, current.balance);
            if (problem) return bad(res, problem);
            const payment = make_payment(req.body, rate_of(doc));
            await collection.updateOne({ _id }, { $push: { payments: payment } });
            ok(res, "Payment recorded", calc({ ...doc, payments: [...(doc.payments || []), payment] }));
      } catch (e) { next(e); }
};

const delete_payment_from = (collection, calc, label) => async (req, res, next) => {
      try {
            const _id = oid(req.params.id);
            const paymentId = oid(req.params.paymentId);
            if (!_id || !paymentId) return bad(res, "Invalid id");
            const doc = await collection.findOne({ _id });
            if (!doc) return bad(res, `${label} not found`, 404);
            await collection.updateOne({ _id }, { $pull: { payments: { _id: paymentId } } });
            const payments = (doc.payments || []).filter((p) => String(p._id) !== String(paymentId));
            ok(res, "Payment removed", calc({ ...doc, payments }));
      } catch (e) { next(e); }
};

const add_invoice_payment = add_payment_to(acc_invoices_collection, calc_invoice, "Invoice");
const delete_invoice_payment = delete_payment_from(acc_invoices_collection, calc_invoice, "Invoice");

/* ================= SALARY ================= */

const PAYSLIP_KEYS = ["employeeId", "month", "earnings", "deductions", "workingDays", "absentDays", "extraHours", "notes", "pf"];

const clamp_percent = (v) => Math.min(100, Math.max(0, Number(v) || 0));

// Only the fields calc_pf reads, with percentages forced into 0-100.
const sanitize_pf = (pf) => ({
      enabled: Boolean(pf?.enabled),
      employeePercent: clamp_percent(pf?.employeePercent),
      companyPercent: clamp_percent(pf?.companyPercent),
      base: pf?.base === "gross" ? "gross" : "basic",
});

const list_employees = async (req, res, next) => {
      try {
            const users = await user_collection
                  .find({}, { projection: { name: 1, email: 1, designation: 1, image: 1, phone: 1 } })
                  .toArray();
            ok(res, "Employees found", users);
      } catch (e) { next(e); }
};

const list_profiles = async (req, res, next) => {
      try {
            ok(res, "Salary profiles found", await acc_salary_profiles_collection.find().toArray());
      } catch (e) { next(e); }
};

// A profile holds an employee's default pay (basic plus fixed allowances) to prefill each month.
const save_profile = async (req, res, next) => {
      try {
            const { employeeId } = req.params;
            if (!oid(employeeId)) return bad(res, "Invalid id");
            const changes = pick(req.body, ["basic", "allowances", "bankAccount", "joiningDate", "pf"]);
            if (changes.pf !== undefined) changes.pf = sanitize_pf(changes.pf);
            await acc_salary_profiles_collection.updateOne(
                  { employeeId },
                  { $set: { employeeId, ...changes } },
                  { upsert: true }
            );
            ok(res, "Salary profile saved", await acc_salary_profiles_collection.findOne({ employeeId }));
      } catch (e) { next(e); }
};

const employee_snapshot = async (employeeId) => {
      const u = oid(employeeId) && (await user_collection.findOne({ _id: oid(employeeId) }));
      return u ? { name: u.name, email: u.email, designation: u.designation } : null;
};

const list_payslips = async (req, res, next) => {
      try {
            const { month, employeeId, status } = req.query;
            const filter = {};
            if (month) filter.month = month;
            if (employeeId) filter.employeeId = employeeId;
            let rows = (await acc_payslips_collection.find(filter).sort({ month: -1, _id: -1 }).toArray())
                  .map((s) => calc_payslip(s));
            if (status) rows = rows.filter((s) => s.status === status);
            ok(res, "Payslips found", rows);
      } catch (e) { next(e); }
};

// One payslip per employee per month, enforced by the database so two simultaneous
// generate calls (double click, React StrictMode) cannot create duplicates.
let payslip_index;
const ensure_payslip_index = () =>
      (payslip_index ||= acc_payslips_collection
            .createIndex({ employeeId: 1, month: 1 }, { unique: true })
            .catch((e) => { payslip_index = undefined; throw e; }));

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const profile_earnings = (p) => [
      { kind: "basic", label: "Basic salary", amount: p.basic },
      ...(p.allowances || []).map((a) => ({ kind: a.kind || "allowance", label: a.label, amount: a.amount })),
];

// Creates the month's payslip for every employee that has a pay profile and none yet.
const generate_payslips = async (req, res, next) => {
      try {
            const { month } = req.body;
            if (!MONTH_RE.test(month || "")) return bad(res, "Month must be YYYY-MM");
            await ensure_payslip_index();

            const [users, profiles, existing] = await Promise.all([
                  user_collection.find({}, { projection: { name: 1, email: 1, designation: 1 } }).toArray(),
                  acc_salary_profiles_collection.find().toArray(),
                  acc_payslips_collection.find({ month }, { projection: { employeeId: 1 } }).toArray(),
            ]);
            const profileOf = new Map(profiles.map((p) => [p.employeeId, p]));
            const have = new Set(existing.map((s) => s.employeeId));

            let created = 0;
            let skipped = 0;
            const missingProfile = [];
            for (const u of users) {
                  const id = String(u._id);
                  if (have.has(id)) { skipped++; continue; }
                  const profile = profileOf.get(id);
                  if (!profile || !(Number(profile.basic) > 0)) {
                        missingProfile.push({ _id: id, name: u.name, designation: u.designation });
                        continue;
                  }
                  const doc = {
                        employeeId: id,
                        month,
                        employee: { name: u.name, email: u.email, designation: u.designation },
                        earnings: profile_earnings(profile),
                        deductions: [],
                        payments: [],
                        generated: true,
                        createdAt: new Date().toISOString(),
                  };
                  if (profile.pf) doc.pf = sanitize_pf(profile.pf);
                  try {
                        await acc_payslips_collection.insertOne(doc);
                        created++;
                  } catch (e) {
                        if (e.code !== 11000) throw e; // lost a race to a concurrent generate: already exists
                        skipped++;
                  }
            }
            ok(res, created ? `${created} payslip(s) generated` : "Nothing new to generate", { created, skipped, missingProfile });
      } catch (e) { next(e); }
};

const create_payslip = async (req, res, next) => {
      try {
            const { employeeId, month } = req.body;
            if (!MONTH_RE.test(month || "")) return bad(res, "Month must be YYYY-MM");
            await ensure_payslip_index();
            const employee = await employee_snapshot(employeeId);
            if (!employee) return bad(res, "Employee not found", 404);
            if (await acc_payslips_collection.findOne({ employeeId, month })) {
                  return bad(res, "A payslip for this employee and month already exists", 409);
            }
            const doc = { ...pick(req.body, PAYSLIP_KEYS), employee, payments: [], createdAt: new Date().toISOString() };
            // Without an explicit pf, follow the employee's pay profile (this is what bulk-generate relies on).
            const profile = await acc_salary_profiles_collection.findOne({ employeeId });
            const pf = req.body.pf !== undefined ? req.body.pf : profile?.pf;
            if (pf) doc.pf = sanitize_pf(pf);
            let r;
            try {
                  r = await acc_payslips_collection.insertOne(doc);
            } catch (e) {
                  if (e.code === 11000) return bad(res, "A payslip for this employee and month already exists", 409);
                  throw e;
            }
            ok(res, "Payslip created", calc_payslip({ ...doc, _id: r.insertedId }));
      } catch (e) { next(e); }
};

const update_payslip = async (req, res, next) => {
      try {
            const _id = oid(req.params.id);
            if (!_id) return bad(res, "Invalid id");
            const current = await acc_payslips_collection.findOne({ _id });
            if (!current) return bad(res, "Payslip not found", 404);
            const changes = pick(req.body, ["earnings", "deductions", "workingDays", "absentDays", "extraHours", "notes", "pf"]);
            if (changes.pf !== undefined) changes.pf = sanitize_pf(changes.pf);
            const next_state = calc_payslip({ ...current, ...changes });
            if (next_state.net < next_state.paid) {
                  return bad(res, `Net pay cannot be below the amount already paid (${next_state.paid})`, 409);
            }
            await acc_payslips_collection.updateOne({ _id }, { $set: changes });
            ok(res, "Payslip updated", next_state);
      } catch (e) { next(e); }
};

const delete_payslip = async (req, res, next) => {
      try {
            const _id = oid(req.params.id);
            if (!_id) return bad(res, "Invalid id");
            const slip = await acc_payslips_collection.findOne({ _id });
            if (!slip) return bad(res, "Payslip not found", 404);
            if (slip.payments?.length) return bad(res, "Payslip has payments. Remove them first.", 409);
            await acc_payslips_collection.deleteOne({ _id });
            ok(res, "Payslip deleted", null);
      } catch (e) { next(e); }
};

const add_payslip_payment = add_payment_to(acc_payslips_collection, calc_payslip, "Payslip");
const delete_payslip_payment = delete_payment_from(acc_payslips_collection, calc_payslip, "Payslip");

// Any signed-in employee: own payslips only, matched by the verified user id, never a client-supplied one.
const my_payslips = async (req, res, next) => {
      try {
            const rows = (await acc_payslips_collection
                  .find({ employeeId: String(req.user._id) }).sort({ month: -1 }).toArray())
                  .map((s) => calc_payslip(s));
            ok(res, "Your payslips", rows);
      } catch (e) { next(e); }
};

// Provident fund balance per employee: employee + company share from every payslip that has the fund on.
const provident_fund = async (req, res, next) => {
      try {
            const slips = (await acc_payslips_collection.find().sort({ month: 1 }).toArray()).map((s) => calc_payslip(s));
            const byEmployee = {};
            for (const s of slips) {
                  if (!s.pf.enabled) continue;
                  const row = (byEmployee[s.employeeId] ||= {
                        employeeId: s.employeeId, employee: s.employee, employeeTotal: 0, companyTotal: 0, balance: 0, entries: [],
                  });
                  row.employeeTotal = round2(row.employeeTotal + s.pf.employee);
                  row.companyTotal = round2(row.companyTotal + s.pf.company);
                  row.balance = round2(row.employeeTotal + row.companyTotal);
                  row.entries.push({ month: s.month, employee: s.pf.employee, company: s.pf.company });
            }
            const rows = Object.values(byEmployee).sort((a, b) => b.balance - a.balance);
            ok(res, "Provident fund", {
                  rows,
                  totals: {
                        employee: round2(rows.reduce((t, r) => t + r.employeeTotal, 0)),
                        company: round2(rows.reduce((t, r) => t + r.companyTotal, 0)),
                        balance: round2(rows.reduce((t, r) => t + r.balance, 0)),
                  },
            });
      } catch (e) { next(e); }
};

/* ================= EXPENSES ================= */

const EXPENSE_KEYS = ["title", "category", "amount", "date", "vendor", "method", "notes"];

const list_expenses = async (req, res, next) => {
      try {
            ok(res, "Expenses found", await acc_expenses_collection.find().sort({ date: -1, _id: -1 }).toArray());
      } catch (e) { next(e); }
};

const create_expense = async (req, res, next) => {
      try {
            const { title, amount } = req.body;
            if (!title || !(Number(amount) > 0)) return bad(res, "Title and a positive amount are required");
            const doc = {
                  ...pick(req.body, EXPENSE_KEYS),
                  amount: round2(amount),
                  date: req.body.date || new Date().toISOString().slice(0, 10),
                  createdAt: new Date().toISOString(),
            };
            const r = await acc_expenses_collection.insertOne(doc);
            ok(res, "Expense added", { ...doc, _id: r.insertedId });
      } catch (e) { next(e); }
};

const update_expense = async (req, res, next) => {
      try {
            const _id = oid(req.params.id);
            if (!_id) return bad(res, "Invalid id");
            const changes = pick(req.body, EXPENSE_KEYS);
            if (changes.amount !== undefined) changes.amount = round2(changes.amount);
            await acc_expenses_collection.updateOne({ _id }, { $set: changes });
            ok(res, "Expense updated", await acc_expenses_collection.findOne({ _id }));
      } catch (e) { next(e); }
};

const delete_expense = async (req, res, next) => {
      try {
            const _id = oid(req.params.id);
            if (!_id) return bad(res, "Invalid id");
            await acc_expenses_collection.deleteOne({ _id });
            ok(res, "Expense deleted", null);
      } catch (e) { next(e); }
};

/* ================= REPORTS ================= */

// Cash basis: money in by payment date, money out by payment/expense date.
const summary_report = async (req, res, next) => {
      try {
            const year = String(req.query.year || new Date().getFullYear());
            const [invoiceDocs, slipDocs, expenses] = await Promise.all([
                  acc_invoices_collection.find().toArray(),
                  acc_payslips_collection.find().toArray(),
                  acc_expenses_collection.find().toArray(),
            ]);
            const invoices = invoiceDocs.map((i) => calc_invoice(i));
            const slips = slipDocs.map((s) => calc_payslip(s));

            const months = Array.from({ length: 12 }, (_, i) => ({
                  month: `${year}-${String(i + 1).padStart(2, "0")}`,
                  invoiced: 0, collected: 0, expenses: 0, salaryPaid: 0,
            }));
            const slot = (date) => months.find((m) => m.month === String(date).slice(0, 7));

            for (const inv of invoices) {
                  if (inv.draft || inv.cancelled) continue;
                  const m = slot(inv.issueDate);
                  if (m) m.invoiced = round2(m.invoiced + inv.totalBase);
                  for (const p of inv.payments || []) {
                        const pm = slot(p.date);
                        if (pm) pm.collected = round2(pm.collected + p.amount * p.rate);
                  }
            }
            for (const e of expenses) {
                  const m = slot(e.date);
                  if (m) m.expenses = round2(m.expenses + e.amount);
            }
            for (const s of slips) {
                  for (const p of s.payments || []) {
                        const pm = slot(p.date);
                        if (pm) pm.salaryPaid = round2(pm.salaryPaid + p.amount);
                  }
            }

            const open = invoices.filter((i) => !["draft", "cancelled", "paid"].includes(i.status));
            const byClient = {};
            for (const i of open) {
                  const key = i.client?.name || "Unknown";
                  byClient[key] = round2((byClient[key] || 0) + i.balanceBase);
            }
            const byCategory = {};
            for (const e of expenses.filter((x) => String(x.date).startsWith(year))) {
                  const key = e.category || "Other";
                  byCategory[key] = round2((byCategory[key] || 0) + e.amount);
            }
            const totals = months.reduce(
                  (t, m) => ({
                        invoiced: round2(t.invoiced + m.invoiced),
                        collected: round2(t.collected + m.collected),
                        expenses: round2(t.expenses + m.expenses),
                        salaryPaid: round2(t.salaryPaid + m.salaryPaid),
                  }),
                  { invoiced: 0, collected: 0, expenses: 0, salaryPaid: 0 }
            );
            totals.fxGain = round2(invoices.filter((i) => !i.draft && !i.cancelled).reduce((t, i) => t + i.fxGain, 0));
            totals.netCash = round2(totals.collected - totals.expenses - totals.salaryPaid);

            ok(res, "Summary", {
                  year,
                  months,
                  totals,
                  receivable: round2(open.reduce((t, i) => t + i.balanceBase, 0)),
                  overdue: round2(open.filter((i) => i.status === "overdue").reduce((t, i) => t + i.balanceBase, 0)),
                  overdueCount: open.filter((i) => i.status === "overdue").length,
                  salaryPayable: round2(slips.reduce((t, s) => t + s.balance, 0)),
                  aging: aging(invoices),
                  topDebtors: Object.entries(byClient)
                        .map(([client, balance]) => ({ client, balance }))
                        .sort((a, b) => b.balance - a.balance)
                        .slice(0, 5),
                  expenseByCategory: byCategory,
            });
      } catch (e) { next(e); }
};

module.exports = {
      list_clients, create_client, update_client, delete_client,
      list_invoices, get_invoice, create_invoice, update_invoice, delete_invoice,
      cancel_invoice: set_invoice_cancelled(true), restore_invoice: set_invoice_cancelled(false),
      add_invoice_payment, delete_invoice_payment,
      list_employees, list_profiles, save_profile,
      list_payslips, create_payslip, generate_payslips, update_payslip, delete_payslip,
      add_payslip_payment, delete_payslip_payment, my_payslips,
      list_expenses, create_expense, update_expense, delete_expense,
      summary_report, provident_fund,
};

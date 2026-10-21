const express = require("express");
const router = express.Router();
const { authenticate, admin_only } = require("../Middleware/admin_only");
const m = require("../Modules/accounts_module");

// Any signed-in employee: their own payslips only.
router.get('/my-payslips', authenticate, m.my_payslips);

// Everything below is admin only.
router.use(admin_only);

router.get('/clients', m.list_clients);
router.post('/clients', m.create_client);
router.put('/clients/:id', m.update_client);
router.delete('/clients/:id', m.delete_client);

router.get('/invoices', m.list_invoices);
router.get('/invoices/:id', m.get_invoice);
router.post('/invoices', m.create_invoice);
router.put('/invoices/:id', m.update_invoice);
router.delete('/invoices/:id', m.delete_invoice);
router.post('/invoices/:id/cancel', m.cancel_invoice);
router.post('/invoices/:id/restore', m.restore_invoice);
router.post('/invoices/:id/payments', m.add_invoice_payment);
router.delete('/invoices/:id/payments/:paymentId', m.delete_invoice_payment);

router.get('/employees', m.list_employees);
router.get('/salary-profiles', m.list_profiles);
router.put('/salary-profiles/:employeeId', m.save_profile);

router.get('/payslips', m.list_payslips);
router.post('/payslips/generate', m.generate_payslips);
router.post('/payslips', m.create_payslip);
router.put('/payslips/:id', m.update_payslip);
router.delete('/payslips/:id', m.delete_payslip);
router.post('/payslips/:id/payments', m.add_payslip_payment);
router.delete('/payslips/:id/payments/:paymentId', m.delete_payslip_payment);

router.get('/provident-fund', m.provident_fund);

router.get('/expenses', m.list_expenses);
router.post('/expenses', m.create_expense);
router.put('/expenses/:id', m.update_expense);
router.delete('/expenses/:id', m.delete_expense);

router.get('/reports/summary', m.summary_report);

module.exports = router;

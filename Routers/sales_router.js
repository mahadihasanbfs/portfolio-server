const express = require("express");
const router = express.Router();
const { page_only } = require("../Middleware/admin_only");
const m = require("../Modules/sales_module");

// Needs the Software Sales page. Salespeople see their own leads and visits; admins (every page) see all.
const sales = page_only("/dashboard/sales");

router.get("/summary", sales, m.summary);
router.get("/leads", sales, m.list_leads);
router.post("/leads", sales, m.create_lead);
router.get("/leads/:id", sales, m.get_lead);
router.put("/leads/:id", sales, m.update_lead);
router.delete("/leads/:id", sales, m.delete_lead);
router.post("/leads/:id/visits", sales, m.add_visit);
router.get("/visits", sales, m.list_visits);
router.post("/visits", sales, m.quick_visit);
router.get("/monitor", sales, m.monitor);
router.delete("/visits/:id", sales, m.delete_visit);

module.exports = router;

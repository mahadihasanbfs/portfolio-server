const express = require("express");
const router = express.Router();
const { page_only } = require("../Middleware/admin_only");
const m = require("../Modules/employee_module");

// Needs the Employee Management page (CEO and manager always have it). The JWT is checked on every route.
const admin_only = page_only("/dashboard/employee-management");
router.get("/", admin_only, m.list);
router.put("/:id", admin_only, m.update);
router.put("/:id/password", admin_only, m.reset_password);
router.put("/:id/status", admin_only, m.set_status);
router.delete("/:id", admin_only, m.remove);

module.exports = router;

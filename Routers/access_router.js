const express = require("express");
const router = express.Router();
const { authenticate, page_only } = require("../Middleware/admin_only");
const m = require("../Modules/access_module");

const manage = page_only("/dashboard/employee-management");

// Any signed-in employee.
router.get("/me", authenticate, m.me);
router.post("/heartbeat", authenticate, m.heartbeat);

// Roles and page access: only those who can open Employee Management.
router.get("/roles", manage, m.list_roles);
router.post("/roles", manage, m.create_role);
router.put("/roles/:id", manage, m.update_role);
router.delete("/roles/:id", manage, m.delete_role);
router.put("/users/:id", manage, m.set_user_access);

module.exports = router;

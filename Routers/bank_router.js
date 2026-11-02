const express = require("express");
const router = express.Router();
const { authenticate, admin_only } = require("../Middleware/admin_only");
const m = require("../Modules/bank_module");

router.get("/me", authenticate, m.get_mine);
router.put("/me", authenticate, m.save_mine);
router.get("/user/:userId", admin_only, m.get_one);

module.exports = router;

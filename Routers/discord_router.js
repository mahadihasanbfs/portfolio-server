const express = require("express");
const router = express.Router();
const { page_only } = require("../Middleware/admin_only");
const m = require("../Modules/discord_module");

const admin = page_only("/dashboard/attendance-management");

router.get("/settings", admin, m.get_settings);
router.put("/settings", admin, m.put_settings);
router.post("/test", admin, m.test);
router.post("/send-now", admin, m.send_now);
router.get("/cron", m.cron); // secured by CRON_SECRET, called by the scheduler

module.exports = router;

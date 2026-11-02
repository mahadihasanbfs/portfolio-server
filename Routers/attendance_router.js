const express = require("express");
const router = express.Router();
const { authenticate, page_only } = require("../Middleware/admin_only");
const m = require("../Modules/attendance_module");

// Any signed-in employee: their own attendance and leave only.
router.get("/today", authenticate, m.today);
router.post("/check-in", authenticate, m.check_in);
router.post("/check-out", authenticate, m.check_out);
router.get("/my", authenticate, m.my_month);
router.get("/my-leaves", authenticate, m.my_leaves);
router.post("/leaves", authenticate, m.request_leave);
router.delete("/leaves/:id", authenticate, m.cancel_leave);

// Everything below needs the Attendance Management page (CEO and manager always have it).
const admin_only = page_only("/dashboard/attendance-management");
router.get("/daily", admin_only, m.daily);
router.get("/monthly", admin_only, m.monthly);
router.get("/employee/:userId", admin_only, m.employee);
router.put("/records", admin_only, m.correct_record);
router.delete("/records", admin_only, m.delete_record);
router.get("/leaves", admin_only, m.all_leaves);
router.put("/leaves/:id/decision", admin_only, m.decide_leave);

module.exports = router;

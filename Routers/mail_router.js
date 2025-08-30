const express = require("express");
const { getAllMail, sendMail, getEmailById, getSentMail, markAsRead, toggleStar, searchEmails, getEmailStats } = require("../Modules/mai_box");
const check_user = require("../Middleware/PostRequset");
const router = express.Router();

router.get("/get-all-mail", check_user, getAllMail)
router.get("/email/:id", check_user, getEmailById)
router.post("/send-mail", check_user, sendMail)
router.get("/sent-mail", check_user, getSentMail)
router.put("/email/:id/read", check_user, markAsRead)
router.put("/email/:id/star", check_user, toggleStar)
router.get("/search", check_user, searchEmails)
router.get("/stats", check_user, getEmailStats)

module.exports = router

const express = require("express");
const { getAllMail, sendMail, getEmailById, getSentMail, markAsRead, toggleStar, searchEmails, getEmailStats } = require("../Modules/mai_box");
const { authenticate } = require("../Middleware/admin_only");
const { send_mail_candidate } = require("../Modules/send_mail");
const router = express.Router();

router.get("/get-all-mail", authenticate, getAllMail)
router.get("/email/:id", authenticate, getEmailById)
router.post("/send-mail", authenticate, sendMail)
router.get("/sent-mail", authenticate, getSentMail)
router.put("/email/:id/read", authenticate, markAsRead)
router.put("/email/:id/star", authenticate, toggleStar)
router.get("/search", authenticate, searchEmails)
router.get("/stats", authenticate, getEmailStats)
router.post("/send-mail/candidate", authenticate, send_mail_candidate)

module.exports = router

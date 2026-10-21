const express = require("express");
const router = express.Router();
const { authenticate } = require("../Middleware/admin_only");
const g = require("../Modules/gmail_module");

// Google redirects the browser here, so it cannot carry our Authorization header (identity comes from `state`).
router.get("/callback", g.callback);

// Every signed-in employee links and reads only their own mailbox.
router.use(authenticate);
router.get("/status", g.status);
router.get("/auth-url", g.auth_url);
router.delete("/disconnect", g.disconnect);

router.get("/settings", g.mail_settings);
router.put("/settings", g.save_mail_settings);
router.delete("/settings", g.delete_mail_settings);

router.get("/unread", g.unread_count);
router.post("/batch", g.batch_messages);
router.post("/mark-all-read", g.mark_all_read);
router.get("/messages", g.list_messages);
router.get("/messages/:id", g.get_message);
router.get("/messages/:id/attachments/:attId", g.get_attachment);
router.post("/messages", g.send_message);
router.put("/messages/:id", g.modify_message);
router.delete("/messages/:id", g.trash_message);

module.exports = router;

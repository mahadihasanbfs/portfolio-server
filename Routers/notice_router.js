const express = require("express");
const router = express.Router();
const { authenticate } = require("../Middleware/admin_only");
const { get_signature, save_signature, add_new_notice, get_notice, get_notice_by_id, approve_notice, delete_notice } = require("../Modules/notice_module");

// Notices are internal: every route needs a signed-in user. Pending notices are visible only to the CEO and the writer.
router.use(authenticate);
router.get('/get-notice', get_notice)
router.get('/get-notice-by-id', get_notice_by_id)
router.post('/add-notice', add_new_notice)
router.put('/approve-notice', approve_notice)
router.get('/signature', get_signature)
router.put('/signature', save_signature)
router.delete('/delete-notice', delete_notice)

module.exports = router

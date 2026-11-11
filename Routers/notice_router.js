const express = require("express");
const router = express.Router();
const { authenticate } = require("../Middleware/admin_only");
const { add_new_notice, get_notice, get_notice_by_id, delete_notice } = require("../Modules/notice_module");


router.get('/get-notice', get_notice)
router.get('/get-notice-by-id', get_notice_by_id)
router.post('/add-notice', authenticate, add_new_notice)
router.delete('/delete-notice', authenticate, delete_notice)

// router.put('/update-issue', authenticate, update_issue)

module.exports = router
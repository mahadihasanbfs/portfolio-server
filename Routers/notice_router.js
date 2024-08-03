const express = require("express");
const router = express.Router();
const check_user = require("../Middleware/PostRequset");
const { add_new_notice, get_notice, get_notice_by_id, delete_notice } = require("../Modules/notice_module");


router.get('/get-notice', get_notice)
router.get('/get-notice-by-id', get_notice_by_id)
router.post('/add-notice', check_user, add_new_notice)
router.delete('/delete-notice', check_user, delete_notice)

// router.put('/update-issue', check_user, update_issue)

module.exports = router
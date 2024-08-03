const express = require("express");
const router = express.Router();
const check_user = require("../Middleware/PostRequset");
const { add_issue, get_issue_by_id, get_issues, delete_issue, update_issue, get_issue_by_user } = require("../Modules/issues_module");

// add_issue,
//     edit_issue,
//     delete_issue,
//     update_issue,
//     get_issues

router.get('/get-issue-by-id', get_issue_by_id)
router.get('/get-issue', check_user, get_issue_by_user)
router.post('/add-issue', check_user, add_issue)
router.delete('/delete-issue', check_user, delete_issue)
router.put('/update-issue', check_user, update_issue)

module.exports = router
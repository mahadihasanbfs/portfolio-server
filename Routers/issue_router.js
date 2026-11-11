const express = require("express");
const router = express.Router();
const { authenticate } = require("../Middleware/admin_only");
const { add_issue, get_issue_by_id, get_issues, delete_issue, update_issue, get_issue_by_user } = require("../Modules/issues_module");

// add_issue,
//     edit_issue,
//     delete_issue,
//     update_issue,
//     get_issues

router.get('/get-issue-by-id', get_issue_by_id)
router.get('/get-issue', authenticate, get_issue_by_user)
router.post('/add-issue', authenticate, add_issue)
router.delete('/delete-issue', authenticate, delete_issue)
router.put('/update-issue', authenticate, update_issue)

module.exports = router
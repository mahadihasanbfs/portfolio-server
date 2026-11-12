const express = require("express");
const router = express.Router();
const { authenticate } = require("../Middleware/admin_only");

const { load_admin, add_new_task, get_all_tasks, get_task_by_id, update_task, add_comment, delete_comment, delete_task } = require("../Modules/task_module");

// Every route needs a signed-in user; the module then limits each person to their own tasks.
router.use(authenticate, load_admin);
router.get('/get-task', get_all_tasks)
router.get('/get-task-by-id', get_task_by_id)
router.post('/add-task', add_new_task)
router.put('/update-task', update_task)
router.delete('/delete-task', delete_task)
router.post('/comment', add_comment)
router.delete('/comment', delete_comment)
module.exports = router

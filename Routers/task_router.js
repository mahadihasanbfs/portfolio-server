const express = require("express");
const router = express.Router();
const { authenticate } = require("../Middleware/admin_only");

const { add_new_task, get_all_tasks, get_task_by_id, get_task_by_assignedTo, update_task, delete_task } = require("../Modules/task_module");

router.get('/get-task-by-id', get_task_by_id)
router.get('/get-task', get_all_tasks)
router.post('/add-task', authenticate, add_new_task)
router.delete('/delete-task', authenticate, delete_task)
router.put('/update-task', authenticate, update_task)
router.get('/get-task-by-assignedTo', get_task_by_assignedTo)
module.exports = router

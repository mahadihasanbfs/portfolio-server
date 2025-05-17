const express = require("express");
const router = express.Router();
const check_user = require("../Middleware/PostRequset");

const { add_new_task, get_all_tasks, get_task_by_id, get_task_by_assignedTo, update_task, delete_task } = require("../Modules/task_module");

router.get('/get-task-by-id', get_task_by_id)
router.get('/get-task', get_all_tasks)
router.post('/add-task', check_user, add_new_task)
router.delete('/delete-task', check_user, delete_task)
router.put('/update-task', check_user, update_task)
router.get('/get-task-by-assignedTo', get_task_by_assignedTo)
module.exports = router

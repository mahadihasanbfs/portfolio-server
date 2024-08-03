const express = require("express");
const router = express.Router();
const check_user = require("../Middleware/PostRequset");


const { add_project, all_project, get_project_by_id, delete_project, update_project } = require("../Modules/project_module");

router.get('/get-project-by-id', get_project_by_id)
router.get('/get-project', all_project)
router.post('/add-project', check_user, add_project)
router.delete('/delete-blog', check_user, delete_project)
router.put('/update-blog', check_user, update_project)

module.exports = router
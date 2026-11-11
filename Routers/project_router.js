const express = require("express");
const router = express.Router();
const { authenticate } = require("../Middleware/admin_only");


const { add_project, all_project, get_project_by_id, delete_project, update_project } = require("../Modules/project_module");

router.get('/get-project-by-id', get_project_by_id)
router.get('/get-project', all_project)
router.post('/add-project', authenticate, add_project)
router.delete('/delete-project', authenticate, delete_project)
router.put('/update-project', authenticate, update_project)
// old names kept so existing callers keep working
router.delete('/delete-blog', authenticate, delete_project)
router.put('/update-blog', authenticate, update_project)

module.exports = router
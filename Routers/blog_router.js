const express = require("express");
const router = express.Router();
const check_user = require("../Middleware/PostRequset");

const { add_blog, all_blog, delete_blog, update_blog, get_blog_by_id } = require("../Modules/blog_module");

router.get('/get-blog-by-id', get_blog_by_id)
router.get('/get-blog', all_blog)
router.post('/add-blog', check_user, add_blog)
router.delete('/delete-blog', check_user, delete_blog)
router.put('/update-blog', check_user, update_blog)

module.exports = router
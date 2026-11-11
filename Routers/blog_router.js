const express = require("express");
const router = express.Router();
const { authenticate } = require("../Middleware/admin_only");

const { add_blog, all_blog, delete_blog, update_blog, get_blog_by_id } = require("../Modules/blog_module");

router.get('/get-blog-by-id', get_blog_by_id)
router.get('/get-blog', all_blog)
router.post('/add-blog', authenticate, add_blog)
router.delete('/delete-blog', authenticate, delete_blog)
router.put('/update-blog', authenticate, update_blog)

module.exports = router
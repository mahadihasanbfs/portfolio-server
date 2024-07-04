const express = require("express");
const { add_job_post, all_job_post } = require("../Modules/job_post");
const check_user = require("../Middleware/PostRequset");
const router = express.Router();


router.post('/add-job', check_user, add_job_post)
router.post('/all-job', all_job_post)


module.exports = router
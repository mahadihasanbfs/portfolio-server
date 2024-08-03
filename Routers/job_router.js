const express = require("express");
const { add_job_post, all_job_post, get_job_post_by_id, delete_job_post } = require("../Modules/job_post");
const check_user = require("../Middleware/PostRequset");
const { apply_job_post, get_job_apply_by_query } = require("../Modules/job_applly");
const router = express.Router();


router.post('/add-job', check_user, add_job_post)
router.get('/all-job', all_job_post)
router.get('/get-job-by-id', get_job_post_by_id)
router.delete('/delete-job', check_user, delete_job_post)

router.post('/apply-job', apply_job_post)
router.get('/get-job-apply', get_job_apply_by_query)

module.exports = router
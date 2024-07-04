const express = require("express");
const { sign_up, sign_in } = require("../Modules/user_module");
const check_user = require("../Middleware/PostRequset");
const router = express.Router();


router.post('/sign-up', sign_up)
router.post('/sign-in', check_user, sign_in)


module.exports = router
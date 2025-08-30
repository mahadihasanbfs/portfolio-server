const express = require("express");
const { sign_up, sign_in, forget_password, reset_password, get_all_users, update_user_password, update_user_data } = require("../Modules/user_module");
const check_user = require("../Middleware/PostRequset");
const router = express.Router();


router.post('/sign-up', sign_up)
router.post('/sign-in', check_user, sign_in)
router.post('/forget-password', forget_password)
router.post('/reset-password', reset_password)
router.get('/all', check_user, get_all_users)
router.put('/update-user-password', check_user, update_user_password)
router.put('/update-user-data', check_user, update_user_data)


module.exports = router

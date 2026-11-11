const express = require("express");
const { sign_up, sign_in, forget_password, reset_password, get_all_users, update_user_password, update_user_data, delete_user } = require("../Modules/user_module");
const check_user = require("../Middleware/PostRequset");
const { authenticate, optional_auth } = require("../Middleware/admin_only");
const router = express.Router();


router.post('/sign-up', sign_up)
router.post('/sign-in', check_user, sign_in)
router.post('/forget-password', forget_password)
router.post('/reset-password', reset_password)
router.get('/all', optional_auth, get_all_users)
router.put('/update-user-password', authenticate, update_user_password)
router.put('/update-user-data', authenticate, update_user_data)
router.delete('/delete/:id', authenticate, delete_user)


module.exports = router

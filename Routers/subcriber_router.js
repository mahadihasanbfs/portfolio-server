
const express = require("express");
const router = express.Router();
const check_user = require("../Middleware/PostRequset")
const { get_subscriber, add_subscriber, delete_subscriber, update_subscriber } = require("../Modules/subcriber_module")


router.get('/get-subscribers', check_user, get_subscriber)
router.post('/add-subscriber', add_subscriber)
router.delete('/delete-subscriber', check_user, delete_subscriber)
router.put('/update-subscriber', check_user, update_subscriber)


module.exports = router

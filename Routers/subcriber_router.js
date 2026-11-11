
const express = require("express");
const router = express.Router();
const { authenticate } = require("../Middleware/admin_only");
const { get_subscriber, add_subscriber, delete_subscriber, update_subscriber } = require("../Modules/subcriber_module")


router.get('/get-subscribers', authenticate, get_subscriber)
router.post('/add-subscriber', add_subscriber)
router.delete('/delete-subscriber', authenticate, delete_subscriber)
router.put('/update-subscriber', authenticate, update_subscriber)


module.exports = router

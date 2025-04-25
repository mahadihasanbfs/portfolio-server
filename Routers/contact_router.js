const express = require("express");
const router = express.Router();

const check_user = require("../Middleware/PostRequset")
const { get_contact, add_contact, delete_contact, update_contact } = require("../Modules/contact_module")

router.get('/get-contacts',  get_contact)
router.post('/add-contact', add_contact)
router.delete('/delete-contact', check_user, delete_contact)
router.put('/update-contact', check_user, update_contact)

module.exports = router

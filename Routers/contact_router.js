const express = require("express");
const router = express.Router();

const { authenticate } = require("../Middleware/admin_only");
const { get_contact, add_contact, delete_contact, update_contact } = require("../Modules/contact_module")

router.get('/get-contacts',  get_contact)
router.post('/add-contact', add_contact)
router.delete('/delete-contact', authenticate, delete_contact)
router.put('/update-contact', authenticate, update_contact)

module.exports = router

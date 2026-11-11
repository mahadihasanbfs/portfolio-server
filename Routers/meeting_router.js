const express = require("express");
const { get_meetings, add_meeting, delete_meeting, edit_meeting } = require("../Modules/meeting_module");
const { authenticate } = require("../Middleware/admin_only");
const { get_client_meeting, add_client_meeting, delete_client_meeting, update_client_meeting } = require("../Modules/clinet_meeting_module");
const router = express.Router();


router.get('/get-meetings', get_meetings)
router.post('/add-meeting', authenticate, add_meeting)
router.put('/edit-meeting', authenticate, edit_meeting)
router.delete('/delete-meeting', authenticate, delete_meeting)

router.get('/get-client-meeting', get_client_meeting)
router.post('/add-client-meeting', authenticate, add_client_meeting)
router.put('/edit-client-meeting', authenticate, update_client_meeting)
router.delete('/delete-client-meeting', authenticate, delete_client_meeting)



module.exports = router

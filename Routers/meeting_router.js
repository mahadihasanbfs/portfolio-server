const express = require("express");
const { get_meetings, add_meeting, delete_meeting, edit_meeting } = require("../Modules/meeting_module");
const check_user = require("../Middleware/PostRequset");
const { get_client_meeting, add_client_meeting, delete_client_meeting, update_client_meeting } = require("../Modules/clinet_meeting_module");
const router = express.Router();


router.get('/get-meetings', get_meetings)
router.post('/add-meeting', check_user, add_meeting)
router.put('/edit-meeting', check_user, edit_meeting)
router.delete('/delete-meeting', check_user, delete_meeting)

router.get('/get-client-meeting', get_client_meeting)
router.post('/add-client-meeting', check_user, add_client_meeting)
router.put('/edit-client-meeting', check_user, update_client_meeting)
router.delete('/delete-client-meeting', check_user, delete_client_meeting)



module.exports = router

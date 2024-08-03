const express = require("express");
const { get_meetings, add_meeting, delete_meeting, edit_meeting } = require("../Modules/meeting_module");
const check_user = require("../Middleware/PostRequset");
const router = express.Router();


router.get('/get-meetings', get_meetings)
router.post('/add-meeting', check_user, add_meeting)
router.put('/edit-meeting', check_user, edit_meeting)
router.delete('/delete-meeting', check_user, delete_meeting)


module.exports = router
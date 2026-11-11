const express = require("express");
const router = express.Router();

const google = require("../Modules/appointment_google");
const { authenticate, admin_only } = require("../Middleware/admin_only");
const { backfill_meets, check_map_link, get_office, run_reminders, reminders_cron, manage_get, reschedule_with_token, admin_reschedule, get_types, cancel_with_token, get_holidays, get_slots, book_appointment, list_appointments, update_appointment, delete_appointment } = require("../Modules/appointment_module");

router.get('/types', get_types)
router.get('/holidays', get_holidays)
router.get('/office', get_office)
router.get('/check-map', check_map_link)
router.post('/cancel', cancel_with_token)
router.get('/manage', manage_get)
router.post('/reschedule', reschedule_with_token)
router.get('/reminders/run', reminders_cron)
router.get('/google/callback', google.callback)
router.get('/google/status', admin_only, google.status)
router.post('/google/backfill', admin_only, backfill_meets)
router.get('/google/auth-url', admin_only, google.auth_url)
router.delete('/google/disconnect', admin_only, google.disconnect)
router.put('/admin-reschedule', authenticate, admin_reschedule)
router.get('/slots', get_slots)
router.post('/book', book_appointment)
router.get('/list', authenticate, list_appointments)
router.put('/update', authenticate, update_appointment)
router.delete('/delete', authenticate, delete_appointment)

module.exports = router

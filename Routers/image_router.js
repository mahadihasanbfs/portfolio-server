const express = require("express");
const multer = require("multer");
const { get_image_by_id, upload_image, get_blurred_image_by_id } = require("../Modules/image_module");
const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
});


router.get('/:id', get_image_by_id);
router.get('/blur/:id', get_blurred_image_by_id);

router.post('/upload-image', upload.single('image'), upload_image);

module.exports = router
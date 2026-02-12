const express = require("express");
const multer = require("multer");
const { get_image_by_id, get_image_by_id_v2, } = require("../Modules/image_module");
const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({
      storage: storage,
});


router.get('/:id', get_image_by_id_v2);


module.exports = router

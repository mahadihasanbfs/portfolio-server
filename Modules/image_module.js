const { ObjectId, GridFSBucket } = require("mongodb");
const sharp = require('sharp');
const { images_collection } = require("../Collection/all_collection");

const upload_image = async (req, res, next) => {
      try {
            const fileBuffer = req.file.buffer;
            const fileType = req.file.mimetype.startsWith('image') ? 'jpg' : 'pdf';
            const result = await images_collection.insertOne({ file: fileBuffer, fileType });

            const image_url = `https://sever.brightfuturesoft.com/api/v1/image/${result.insertedId}.${fileType}`;
            const blur_image_url = `https://sever.brightfuturesoft.com/api/v1/image/blur/${result.insertedId}.${fileType}`;

            res.send({ status: true, message: 'File uploaded successfully', id: result.insertedId, image_url: image_url, blur_image_url, request_time: new Date().getTime() });
      } catch (err) {
            next(err);
      }
};





const get_blurred_image_by_id = async (req, res, next) => {
      try {
            let fileId = req.params.id;
            fileId = fileId.replace(/\.[^/.]+$/, "");

            const pipeline = [
                  { $match: { _id: new ObjectId(fileId) } }
            ];

            const fileDoc = await images_collection.aggregate(pipeline).next();
            if (!fileDoc) {
                  res.status(404).json({ error: 'File not found' });
            } else {
                  const fileType = fileDoc.fileType;
                  const contentType = fileType === 'jpg' ? 'image/jpeg' : 'application/pdf';

                  // Implement compression and optimization
                  let imageBuffer = Buffer.from(fileDoc.file.buffer, 'base64');
                  if (fileType === 'jpg' || fileType === 'png') {
                        imageBuffer = await sharp(imageBuffer)
                              .resize(200) // Resize to a smaller dimension
                              .blur(10) // Apply blur effect
                              .toBuffer();
                  }

                  res.contentType(contentType);
                  res.status(200).send(imageBuffer);
            }
      } catch (err) {
            console.error('Error in GetBlurredImageByID:', err);
            res.status(500).json({ error: 'Internal Server Error' });
      }
};


const get_image_by_id = async (req, res, next) => {
      try {
            let fileId = req.params.id;
            fileId = fileId.replace(/\.[^/.]+$/, "");

            const pipeline = [
                  { $match: { _id: new ObjectId(fileId) } }
            ];

            const fileDoc = await images_collection.aggregate(pipeline).next();
            if (!fileDoc) {
                  res.status(404).json({ error: 'File not found' });
            } else {
                  const fileType = fileDoc.fileType;
                  const contentType = fileType === 'jpg' ? 'image/jpeg' : 'application/pdf';

                  // Implement compression and optimization
                  let imageBuffer = Buffer.from(fileDoc.file.buffer, 'base64');
                  if (fileType === 'jpg') {
                        imageBuffer = await sharp(imageBuffer).jpeg({ quality: 85 }).toBuffer();
                  } else if (fileType === 'png') {
                        imageBuffer = await sharp(imageBuffer).png({ quality: 85 }).toBuffer();
                  }

                  res.contentType(contentType);
                  res.status(200).send(imageBuffer);
            }
      } catch (err) {
            console.error('Error in GetClearImageByID:', err);
            res.status(500).json({ error: 'Internal Server Error' });
      }
};

module.exports = { upload_image, get_image_by_id, get_blurred_image_by_id };

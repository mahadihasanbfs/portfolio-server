const { ObjectId, GridFSBucket } = require("mongodb");
const sharp = require('sharp');
const { images_collection, image_collection } = require("../Collection/all_collection");
const { default: axios } = require("axios");
const cloudinary = require("cloudinary").v2;

// const upload_image = async (req, res, next) => {
//       try {
//             const fileBuffer = req.file.buffer;
//             const fileType = req.file.mimetype.startsWith('image') ? 'jpg' : 'pdf';
//             const result = await images_collection.insertOne({ file: fileBuffer, fileType });

//             const image_url = `https://sever.brightfuturesoft.com/api/v1/image/${result.insertedId}.${fileType}`;
//             const blur_image_url = `https://sever.brightfuturesoft.com/api/v1/image/blur/${result.insertedId}.${fileType}`;

//             res.send({ status: true, message: 'File uploaded successfully', id: result.insertedId, image_url: image_url, blur_image_url, request_time: new Date().getTime() });
//       } catch (err) {
//             next(err);
//       }
// };





cloudinary.config({
      cloud_name: "dvtk0c7dt",
      api_key: "869354155797583",
      api_secret: "o1I1W1vZrNDaC29TX-0awMMPnzk",
});



const upload_image = async (req, res, next) => {
      try {
            const imageBuffer = req.file.buffer;
            const mimeType = req.file.mimetype;
            const image_title = req.body?.title;

            let sharpInstance = sharp(imageBuffer).resize({ width: 800 });
            let compressedImageBuffer;

            if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
                  compressedImageBuffer = await sharpInstance.jpeg({ quality: 90 }).toBuffer();
            } else if (mimeType === "image/png") {
                  compressedImageBuffer = await sharpInstance.png({ compressionLevel: 8 }).toBuffer();
            } else {
                  return res.status(400).json({ error: "Unsupported image format" });
            }

            const base64Image = `data:${mimeType};base64,${compressedImageBuffer.toString("base64")}`;

            const cloudinaryResult = await cloudinary.uploader.upload(base64Image, {
                  folder: "bright_future_soft",
            });

            let data = {
                  imageUrl: cloudinaryResult.secure_url,
                  public_id: cloudinaryResult.public_id,
                  createdAt: new Date(),
            };

            if (image_title) data.title = image_title;

            const result = await image_collection.insertOne(data);

            res.send({ status: true, message: 'File uploaded successfully', id: result.insertedId, image_url: `https://sever.brightfuturesoft.com/api/v2/image/${result.insertedId}`, request_time: new Date().getTime() });
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


const get_image_by_id_v2 = async (req, res, next) => {
      try {
            const imageId = req.params.id;
            console.log(imageId);

            const imageDoc = await image_collection.findOne({
                  _id: new ObjectId(imageId),
            });

            if (!imageDoc) {
                  return res.status(404).json({ error: "Image not found" });
            }

            const response = await axios.get(imageDoc.imageUrl, {
                  responseType: "arraybuffer",
            });

            res.set("Content-Type", response.headers["content-type"]);
            res.send(Buffer.from(response.data, "binary"));
      } catch (err) {
            next(err);
      }
};
module.exports = { upload_image, get_image_by_id, get_blurred_image_by_id, get_image_by_id_v2 };

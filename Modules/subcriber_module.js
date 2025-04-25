const { ObjectId } = require("mongodb");
const { subscriber_collection } = require("../Collection/all_collection");

const add_subscriber = async (req, res, next) => {
      const body = req.body;
      try {
            const result = await subscriber_collection.insertOne(body);
            res.send({
                  success: true,
                  message: 'Subscriber added successfully',
                  data: result.ops, // Return inserted documents
                  request_time: new Date().getTime()
            });
      } catch (error) {
            next(error);
      }
}

const get_subscriber = async (req, res, next) => {
      try {
            const subscribers = await subscriber_collection.find().sort({ timestamp: -1 }).toArray();
            res.send({
                  success: true,
                  message: 'All subscribers',
                  data: subscribers,
                  request_time: new Date().getTime()
            });
      } catch (error) {
            next(error);
      }
}

const delete_subscriber = async (req, res, next) => {
      const id = req.query.subscriber_id;
      try {
            await subscriber_collection.deleteOne({ _id: new ObjectId(id) });
            res.send({
                  success: true,
                  message: 'Subscriber deleted successfully',
                  request_time: new Date().getTime()
            });
      } catch (error) {
            next(error);
      }
}

const update_subscriber = async (req, res, next) => {
      const id = req.query.subscriber_id;
      const body = req.body;
      try {
            const result = await subscriber_collection.updateOne({ _id: new ObjectId(id) }, { $set: { ...body } });
            if (result.modifiedCount === 1) {
                  res.send({
                        success: true,
                        message: 'Subscriber updated successfully',
                        request_time: new Date().getTime()
                  });
            } else {
                  res.status(404).send({
                        success: false,
                        message: 'Subscriber not found',
                        request_time: new Date().getTime()
                  });
            }
      } catch (error) {
            next(error);
      }
}

module.exports = { add_subscriber, get_subscriber, delete_subscriber, update_subscriber }

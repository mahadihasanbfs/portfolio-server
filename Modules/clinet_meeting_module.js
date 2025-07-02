const { ObjectId } = require("mongodb");
const { client_meeting_collection } = require("../Collection/all_collection");

const get_client_meeting = async (req, res, next) => {
      try {
            const meetings = await client_meeting_collection.find().toArray();
            res.send({
                  success: true,
                  message: 'All meetings',
                  data: meetings,
                  request_time: new Date().getTime()
            });
      } catch (error) {
            next(error);
      }
}

const add_client_meeting = async (req, res, next) => {
      const body = req.body;
      try {
            const result = await client_meeting_collection.insertOne(body);
            res.send({
                  success: true,
                  message: 'Meeting added successfully',
                  data: result.ops,
                  request_time: new Date().getTime()
            });
      } catch (error) {
            next(error);
      }
}

const delete_client_meeting = async (req, res, next) => {
      const id = req.query.client_meeting_id;
      try {
            await client_meeting_collection.deleteOne({ _id: new ObjectId(id) });
            res.send({
                  success: true,
                  message: 'Meeting deleted successfully',
                  request_time: new Date().getTime()
            });
      } catch (error) {
            next(error);
      }
}

const update_client_meeting = async (req, res, next) => {
      const id = req.query.client_meeting_id;
      const body = req.body;
      try {
            const result = await client_meeting_collection.updateOne({ _id: new ObjectId(id) }, { $set: { ...body } });
            if (result.modifiedCount === 1) {
                  res.send({
                        success: true,
                        message: 'Meeting updated successfully',
                        request_time: new Date().getTime()
                  });
            } else {
                  res.status(404).send({
                        success: false,
                        message: 'Meeting not found',
                        request_time: new Date().getTime()
                  });
            }
      } catch (error) {
            next(error);
      }
}

module.exports = { get_client_meeting, add_client_meeting, delete_client_meeting, update_client_meeting }

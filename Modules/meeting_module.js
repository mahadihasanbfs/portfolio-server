const { ObjectId } = require("mongodb");
const { meeting_collection } = require("../Collection/all_collection");

const add_meeting = async (req, res, next) => {
      const body = req.body
      console.log(body);
      try {
            const result = await meeting_collection.insertOne(body);

            res.send({
                  success: true,
                  message: 'Meeting added successfully',
                  data: result.ops, // Return inserted documents
                  request_time: new Date().getTime()
            });

      }
      catch (error) {
            next(error);
      }
}

const edit_meeting = async (req, res, next) => {
      const id = req.query.meeting_id;
      const body = req.body;
      try {
            const result = await meeting_collection.updateOne({ _id: new ObjectId(id) }, { $set: { ...body } });
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

const delete_meeting = async (req, res, next) => {
      const id = req.query.meeting_id;
      try {
            const result = await meeting_collection.deleteOne({ _id: new ObjectId(id) });

            res.send({
                  success: true,
                  message: 'Meeting deleted successfully',
                  request_time: new Date().getTime()
            });

      } catch (error) {
            next(error);
      }
}

const update_meeting = async (req, res, next) => {
      const id = req.query.meeting_id;
      const body = req.body;
      try {
            const result = await meeting_collection.updateOne({ _id: new ObjectId(id) }, { $set: { ...body } });
            if (result.modifiedCount === 1) {
                  res.send({
                        success: true,
                        message: 'meeting updated successfully',
                        request_time: new Date().getTime()
                  });
            } else {
                  res.status(404).send({
                        success: false,
                        message: 'meeting not found',
                        request_time: new Date().getTime()
                  });
            }
      } catch (error) {
            next(error);
      }
}

const get_meetings = async (req, res, next) => {
      try {
            const email = req.query.email;

            if (!email) {
                  return res.status(400).send({
                        success: false,
                        message: 'Email is required',
                        request_time: new Date().getTime(),
                        data: [],
                  });
            }

            // Query inside selectedUsers array
            const result = await meeting_collection
                  .find({ 'selectedUsers.email': email })
                  .toArray();

            const allMeetings = await meeting_collection.find({}).toArray();

            let meeting_data = [];

            if (email === 'ceo@brightfuturesoft.com') {
                  meeting_data = allMeetings;
            } else {
                  meeting_data = result;
            }

            res.send({
                  success: true,
                  message: result.length ? 'Meetings fetched successfully' : 'No meetings found',
                  request_time: new Date().getTime(),
                  data: meeting_data,
            });

      } catch (error) {
            next(error);
      }
};




module.exports = {
      add_meeting,
      edit_meeting,
      delete_meeting,
      update_meeting,
      get_meetings
}

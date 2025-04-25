const { ObjectId } = require("mongodb");
const { contact_collection } = require("../Collection/all_collection");

const add_contact = async (req, res, next) => {
      const body = req.body;
      //need to check full_name, email_or_phone, message, time_stamp
      const { full_name, email_or_phone, message, time_stamp } = body;
      if (!full_name || !email_or_phone || !message || !time_stamp) {
            return res.status(400).send({
                  success: false,
                  message: 'Missing required fields',
                  request_time: new Date().getTime()
            });
      }

      try {

            const result = await contact_collection.insertOne(body);

            res.send({
                  success: true,
                  message: 'Contact added successfully',
                  data: result.ops, // Return inserted documents
                  request_time: new Date().getTime()
            });

      } catch (error) {
            next(error);
      }
}

const get_contact = async (req, res, next) => {
      try {
            const contacts = await contact_collection.find().sort({ time_stamp: -1 }).toArray();
            res.send({
                  success: true,
                  message: 'All contacts',
                  data: contacts,
                  request_time: new Date().getTime()
            });
      } catch (error) {
            next(error);
      }
}

const delete_contact = async (req, res, next) => {
      const id = req.query.contact_id;
      try {
            await contact_collection.deleteOne({ _id: new ObjectId(id) });
            res.send({
                  success: true,
                  message: 'Contact deleted successfully',
                  request_time: new Date().getTime()
            });
      } catch (error) {
            next(error);
      }
}

const update_contact = async (req, res, next) => {
      const id = req.query.contact_id;
      const body = req.body;
      try {
            const result = await contact_collection.updateOne({ _id: new ObjectId(id) }, { $set: { ...body } });
            if (result.modifiedCount === 1) {
                  res.send({
                        success: true,
                        message: 'Contact updated successfully',
                        request_time: new Date().getTime()
                  });
            } else {
                  res.status(404).send({
                        success: false,
                        message: 'Contact not found',
                        request_time: new Date().getTime()
                  });
            }
      } catch (error) {
            next(error);
      }
}

module.exports = { add_contact, get_contact, delete_contact, update_contact }

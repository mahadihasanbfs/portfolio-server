const { job_collection } = require("../Collection/all_collection");
const { ObjectId } = require("mongodb");

const apply_job_post = async (req, res, next) => {
      const body = req.body
      try {

            const result = await job_collection.insertOne(body);
            res.send({
                  success: true,
                  message: 'Your application submitted successfully',
                  data: result.ops,
                  request_time: new Date().getTime()
            });

      } catch (error) {
            next(error);
      }
}

const get_job_apply_by_query = async (req, res, next) => {
      const query = req.query;
      try {
            const results = await job_collection.find(query).toArray();
            res.send({
                  success: true,
                  message: 'Applications fetched successfully',
                  data: results,
                  request_time: new Date().getTime(),
            });
      } catch (error) {
            next(error);
      }
};

const delete_job_apply = async (req, res, next) => {
      const id = req.query.job_apply_id;
      try {
            await job_collection.deleteOne({ _id: new ObjectId(id) });
            res.send({
                  success: true,
                  message: 'Application deleted successfully',
                  request_time: new Date().getTime()
            });
      } catch (error) {
            next(error);
      }
}


const update_job_apply = async (req, res, next) => {
      const id = req.query.job_apply_id;
      const body = req.body;
      try {
            const result = await job_collection.updateOne({ _id: new ObjectId(id) }, { $set: { ...body } });
            if (result.modifiedCount === 1) {
                  res.send({
                        success: true,
                        message: 'Application updated successfully',
                        request_time: new Date().getTime()
                  });
            } else {
                  res.status(404).send({
                        success: false,
                        message: 'Application not found',
                        request_time: new Date().getTime()
                  });
            }
      } catch (error) {
            next(error);
      }
}








module.exports = { apply_job_post, get_job_apply_by_query, delete_job_apply, update_job_apply }

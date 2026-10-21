const { job_collection, job_application_collection } = require("../Collection/all_collection");
const { ObjectId } = require("mongodb");

const APPLY_FIELDS = [
      "full_name", "email_address", "phone_number", "resume", "salary_expectation",
      "experience_in_years", "job_post_id", "why",
];

// A job closes at the end of its deadline day, Bangladesh time (UTC+6).
const deadline_passed = (dateline) =>
      Boolean(dateline) && Date.now() > new Date(`${dateline}T23:59:59+06:00`).getTime();

const fail = (res, status, message) =>
      res.status(status).send({ success: false, message, request_time: new Date().getTime() });

const apply_job_post = async (req, res, next) => {
      try {
            const body = req.body || {};
            const jobId = String(body.job_post_id || "");
            if (!ObjectId.isValid(jobId)) return fail(res, 404, 'This job does not exist.');

            const job = await job_application_collection.findOne({ _id: new ObjectId(jobId) });
            if (!job) return fail(res, 404, 'This job does not exist.');

            // Enforced here, not only in the form: the API can be called directly.
            if (deadline_passed(job.dateline)) {
                  return fail(res, 410, 'The deadline for this position has passed. Applications are closed.');
            }
            if (!body.full_name || !body.email_address || !body.resume) {
                  return fail(res, 400, 'Name, email and resume are required.');
            }

            // Only the known application fields are stored.
            const application = Object.fromEntries(APPLY_FIELDS.filter((k) => body[k] !== undefined).map((k) => [k, body[k]]));
            application.timestamp = new Date().getTime();

            const result = await job_collection.insertOne(application);
            res.send({
                  success: true,
                  message: 'Your application submitted successfully',
                  data: result.insertedId,
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

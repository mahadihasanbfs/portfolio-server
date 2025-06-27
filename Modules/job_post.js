const { ObjectId } = require("mongodb");

const { job_application_collection, job_collection } = require("../Collection/all_collection");

const add_job_post = async (req, res, next) => {
    const body = req.body;

    try {


        const result = await job_application_collection.insertOne(body);

        res.send({
            success: true,
            message: 'Words added successfully',
            data: result.ops, // Return inserted documents
            request_time: new Date().getTime()
        });

    } catch (error) {
        next(error);
    }
}

const all_job_post = async (req, res, next) => {
    try {
        const job_posts = await job_application_collection.find().sort({ timestamp: -1 }).toArray();


        const job_posts_with_counts = await Promise.all(job_posts.map(async (job) => {

            const application_count = await job_collection.countDocuments({
                job_post_id: `${job._id}`
            });
            return {
                ...job,
                application_count
            };
        }));

        res.send({
            success: true,
            message: 'All job posts with application counts',
            data: job_posts_with_counts,
            request_time: new Date().getTime()
        });
    } catch (error) {
        next(error);
    }
};

const delete_job_post = async (req, res, next) => {
    const id = req.query.job_post_id;

    try {
        await job_application_collection.deleteOne({ _id: new ObjectId(id) });
        res.send({
            success: true,
            message: 'job_post deleted successfully',
            request_time: new Date().getTime()
        });

    } catch (error) {
        next(error);
    }
}

const update_job_post = async (req, res, next) => {
    const id = req.query.job_post_id;
    const body = req.body;
    try {
        const result = await job_application_collection.updateOne({ _id: new ObjectId(id) }, { $set: { ...body } });
        if (result.modifiedCount === 1) {
            res.send({
                success: true,
                message: 'job_post updated successfully.',
                request_time: new Date().getTime()
            });
        } else {
            res.status(404).send({
                success: false,
                message: 'job_post not found',
                request_time: new Date().getTime()
            });
        }
    } catch (error) {
        next(error);
    }
}



const get_job_post_by_id = async (req, res, next) => {
    const id = req.query.job_post_id;
    try {
        const job_post = await job_application_collection.findOne({ _id: new ObjectId(id) });
        if (job_post) {
            res.send({
                success: true,
                message: 'job_post found successfully',
                data: job_post,
                request_time: new Date().getTime()
            });
        } else {
            res.status(404).send({
                success: false,
                message: 'job_post not found',
                request_time: new Date().getTime()
            });
        }
    } catch (error) {
        next(error);
    }
}



module.exports = { add_job_post, all_job_post, delete_job_post, update_job_post, get_job_post_by_id };

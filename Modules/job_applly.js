const { job_collection } = require("../Collection/all_collection");

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





module.exports = { apply_job_post, get_job_apply_by_query }
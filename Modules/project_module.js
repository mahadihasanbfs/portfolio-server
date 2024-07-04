const { ObjectId } = require("mongodb");

const { project_collection } = require("../Collection/all_collection");

const add_blog = async (req, res, next) => {
    const body = req.body;

    console.log(body);

    try {
        if (body && body.content && body.content.length > 0) {

            const result = await project_collection.insertOne(body);

            res.send({
                success: true,
                message: 'Project added successfully',
                data: result.ops, // Return inserted documents
                request_time: new Date().getTime()
            });
        } else {

            res.send({
                success: false,
                message: 'Words not provided or empty.',
                request_time: new Date().getTime()
            });
        }
    } catch (error) {
        next(error);
    }
}

const all_blog = async (req, res, next) => {
    try {
        const blogs = await project_collection.find().sort({ timestamp: -1 }).toArray();
        res.send({
            success: true,
            message: 'All Projects',
            data: blogs,
            request_time: new Date().getTime()
        });
    } catch (error) {
        next(error);
    }
}

const delete_blog = async (req, res, next) => {
    const id = req.query.blog_id;
    try {
        const result = await project_collection.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 1) {
            res.send({
                success: true,
                message: 'Project deleted successfully',
                request_time: new Date().getTime()
            });
        } else {
            res.status(404).send({
                success: false,
                message: 'Blog not found',
                request_time: new Date().getTime()
            });
        }
    } catch (error) {
        next(error);
    }
}

const update_blog = async (req, res, next) => {
    const id = req.query.blog_id;
    const body = req.body;
    try {
        const result = await project_collection.updateOne({ _id: new ObjectId(id) }, { $set: { ...body } });
        if (result.modifiedCount === 1) {
            res.send({
                success: true,
                message: 'Blog updated successfully',
                request_time: new Date().getTime()
            });
        } else {
            res.status(404).send({
                success: false,
                message: 'Blog not found',
                request_time: new Date().getTime()
            });
        }
    } catch (error) {
        next(error);
    }
}



const get_blog_by_id = async (req, res, next) => {
    const id = req.query.blog_id;
    try {
        const blog = await project_collection.findOne({ _id: new ObjectId(id) });
        if (blog) {
            res.send({
                success: true,
                message: 'Blog found successfully',
                data: blog,
                request_time: new Date().getTime()
            });
        } else {
            res.status(404).send({
                success: false,
                message: 'Blog not found',
                request_time: new Date().getTime()
            });
        }
    } catch (error) {
        next(error);
    }
}

module.exports = { add_blog, all_blog, delete_blog, update_blog, get_blog_by_id };

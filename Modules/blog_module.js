const { ObjectId } = require("mongodb");

const { blogs_collection } = require("../Collection/all_collection");

const add_blog = async (req, res, next) => {
    const body = req.body;

    if (!body || !body.title || !body.message) {
        return res.status(400).send({
            success: false,
            message: 'Title and message are required',
            request_time: new Date().getTime()
        });
    }

    try {

        const result = await blogs_collection.insertOne(body);

        res.send({
            success: true,
            message: 'Words added successfully',
            data: { _id: result.insertedId },
            request_time: new Date().getTime()
        });

    } catch (error) {
        next(error);
    }
}

const all_blog = async (req, res, next) => {
    try {
        const blogs = await blogs_collection.find({}).toArray();
        res.send({
            success: true,
            message: 'All blogs',
            data: blogs,
            request_time: new Date().getTime()
        });
    } catch (error) {
        next(error);
    }
}

const delete_blog = async (req, res, next) => {
    const id = req.query.blog_id;
    if (!ObjectId.isValid(id)) {
        return res.status(400).send({
            success: false,
            message: 'Invalid blog id',
            request_time: new Date().getTime()
        });
    }
    try {
        const result = await blogs_collection.deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount !== 1) {
            return res.status(404).send({
                success: false,
                message: 'Blog not found',
                request_time: new Date().getTime()
            });
        }

        res.send({
            success: true,
            message: 'Blog deleted successfully',
            request_time: new Date().getTime()
        });

    } catch (error) {
        next(error);
    }
}

const update_blog = async (req, res, next) => {
    const id = req.query.blog_id;
    const { _id, ...body } = req.body || {};
    if (!ObjectId.isValid(id)) {
        return res.status(400).send({
            success: false,
            message: 'Invalid blog id',
            request_time: new Date().getTime()
        });
    }
    try {
        const result = await blogs_collection.updateOne({ _id: new ObjectId(id) }, { $set: { ...body } });
        if (result.matchedCount === 1) {
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
        const blog = await blogs_collection.findOne({ url: id });
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

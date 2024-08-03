const { ObjectId } = require("mongodb");

const { blogs_collection } = require("../Collection/all_collection");

const add_blog = async (req, res, next) => {
    const body = req.body;

    try {

        const result = await blogs_collection.insertOne(body);

        res.send({
            success: true,
            message: 'Words added successfully',
            data: result.ops,
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
    try {
        const result = await blogs_collection.deleteOne({ _id: new ObjectId(id) });

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
    const body = req.body;
    try {
        const result = await blogs_collection.updateOne({ _id: new ObjectId(id) }, { $set: { ...body } });
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

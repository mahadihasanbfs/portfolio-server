const { testimonial_collection } = require("../Collection/all_collection");

const add_testimonial = async (req, res, next) => {
    const body = req.body

    try {
        if (body && body.content && body.content.length > 0) {

            const result = await testimonial_collection.insertOne(body);

            res.send({
                success: true,
                message: 'testimonial added successfully',
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

const edit_testimonial = async (req, res, next) => {
    const id = req.query.testimonial_id;
    const body = req.body;
    try {
        const result = await testimonial_collection.updateOne({ _id: new ObjectId(id) }, { $set: { ...body } });
        if (result.modifiedCount === 1) {
            res.send({
                success: true,
                message: 'testimonial updated successfully',
                request_time: new Date().getTime()
            });
        } else {
            res.status(404).send({
                success: false,
                message: 'testimonial not found',
                request_time: new Date().getTime()
            });
        }
    } catch (error) {
        next(error);
    }
}

const delete_testimonial = async (req, res, next) => {
    const id = req.query.testimonial_id;
    try {
        const result = await testimonial_collection.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 1) {
            res.send({
                success: true,
                message: 'testimonial deleted successfully',
                request_time: new Date().getTime()
            });
        } else {
            res.status(404).send({
                success: false,
                message: 'testimonial not found',
                request_time: new Date().getTime()
            });
        }
    } catch (error) {
        next(error);
    }
}

const update_testimonial = async (req, res, next) => {
    const id = req.query.testimonial_id;
    const body = req.body;
    try {
        const result = await testimonial_collection.updateOne({ _id: new ObjectId(id) }, { $set: { ...body } });
        if (result.modifiedCount === 1) {
            res.send({
                success: true,
                message: 'testimonial updated successfully',
                request_time: new Date().getTime()
            });
        } else {
            res.status(404).send({
                success: false,
                message: 'testimonial not found',
                request_time: new Date().getTime()
            });
        }
    } catch (error) {
        next(error);
    }
}

const get_testimonials = async (req, res, next) => {
    try {
        const result = await testimonial_collection.find({}).toArray()
        res.send(
            {
                success: true,
                message: 'testimonial not found',
                request_time: new Date().getTime(),
                data: result
            }
        )
    } catch (error) {
        next(error)
    }
}



module.exports = {
    add_testimonial,
    edit_testimonial,
    delete_testimonial,
    update_testimonial,
    get_testimonials
}
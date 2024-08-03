const Joi = require("joi");
const { notice_collection } = require("../Collection/all_collection");
const { ObjectId } = require("mongodb");

const add_new_notice = async (req, res, next) => {
    const body = req.body;

    const addNoticeSchema = Joi.object({
        subject: Joi.string().required(),
        body: Joi.string().required(),
        notice_date: Joi.number()
    }).unknown(false);

    const { error } = addNoticeSchema.validate(body);
    const capitalizeFirstLetter = (string) => string.charAt(0).toUpperCase() + string.slice(1);

    if (error) {
        const missingFields = error.details.map(detail => capitalizeFirstLetter(detail.path.join('.')));
        return res.status(400).send({
            success: false,
            message: `Please provide ${missingFields.join(', ')}`,
            details: error.details,
            request_time: new Date().getTime()
        });
    }
    try {
        const result = await notice_collection.insertOne(body);
        res.send({
            success: true,
            message: 'Notice added successfully',
            data: result.ops,
            request_time: new Date().getTime()
        });
    } catch (error) {
        next(error);
    }
}


const get_notice = async (req, res, next) => {
    try {
        const notices = await notice_collection.find().sort({ notice_date: -1 }).toArray();
        res.send({
            success: true,
            message: 'All Notices',
            data: notices,
            request_time: new Date().getTime()
        });
    } catch (error) {
        next(error);
    }
}

const get_notice_by_id = async (req, res, next) => {
    const id = req.query.notice_id;
    try {
        const notice = await notice_collection.findOne({ _id: new ObjectId(id) });
        if (notice) {
            res.send({
                success: true,
                message: 'Notice found',
                data: notice,
                request_time: new Date().getTime()
            });
        } else {
            res.status(404).send({
                success: false,
                message: 'Notice not found',
                request_time: new Date().getTime()
            });
        }
    } catch (error) {
        next(error);
    }
}

const delete_notice = async (req, res, next) => {
    const id = req.query.notice_id;
    try {
        await notice_collection.deleteOne({ _id: new ObjectId(id) });

        res.send({
            success: true,
            message: 'Notice deleted successfully',
            request_time: new Date().getTime()
        });

    } catch (error) {
        next(error);
    }
}


module.exports = { add_new_notice, get_notice, get_notice_by_id, delete_notice };

const { ObjectId } = require("mongodb");
const { issue_collection, user_collection } = require("../Collection/all_collection");
const Joi = require('joi');

const add_issue = async (req, res, next) => {
    const body = req.body;


    const schema = Joi.object({
        author_name: Joi.string().required(),
        subject: Joi.string().required(),
        status: Joi.string().required(),
        body: Joi.string().required(),
        issue_date: Joi.number()
    }).unknown(false);

    const { error, value } = schema.validate(body);


    const capitalizeFirstLetter = (string) => string.charAt(0).toUpperCase() + string.slice(1);

    try {
        if (!body) {
            res.send({
                success: false,
                message: 'Please provide all required fields',
                request_time: new Date().getTime()
            });
            return;
        }

        if (!error) {
            // Find the current highest issue_number
            const highestIssue = await issue_collection.findOne({}, { sort: { issue_number: -1 } });
            const nextIssueNumber = highestIssue ? highestIssue.issue_number + 1 : 1;

            // Add issue_number to the value object
            value.issue_number = nextIssueNumber;

            const result = await issue_collection.insertOne(value);
            res.send({
                success: true,
                message: 'Issue Upload Successful',
                data: result.ops, // Return inserted documents
                request_time: new Date().getTime()
            });
        } else {
            const missingFields = error.details.map(detail => capitalizeFirstLetter(detail.path.join('.')));
            res.send({
                success: false,
                message: `Please provide ${missingFields.join(', ')}`,
                request_time: new Date().getTime()
            });
        }
    } catch (error) {
        next(error);
    }
}

const edit_issue = async (req, res, next) => {
    const id = req.query.issue_id;
    const body = req.body;
    try {
        const result = await issue_collection.updateOne({ _id: new ObjectId(id) }, { $set: { ...body } });
        if (result.modifiedCount === 1) {
            res.send({
                success: true,
                message: 'Issue updated successfully',
                request_time: new Date().getTime()
            });
        } else {
            res.status(404).send({
                success: false,
                message: 'issue not found',
                request_time: new Date().getTime()
            });
        }
    } catch (error) {
        next(error);
    }
}

const delete_issue = async (req, res, next) => {
    const id = req.query.issue_id;
    try {
        const result = await issue_collection.deleteOne({ _id: new ObjectId(id) });

        res.send({
            success: true,
            message: 'Issue Deleted Duccessfully',
            request_time: new Date().getTime()
        });

    } catch (error) {
        next(error);
    }
}

const update_issue = async (req, res, next) => {
    const id = req.query.issue_id;
    const body = req.body;
    try {
        const result = await issue_collection.updateOne({ _id: new ObjectId(id) }, { $set: { ...body } });
        if (result.modifiedCount === 1) {
            res.send({
                success: true,
                message: 'Issue updated successfully',
                request_time: new Date().getTime()
            });
        } else {
            res.status(404).send({
                success: false,
                message: 'Issue not found',
                request_time: new Date().getTime()
            });
        }
    } catch (error) {
        next(error);
    }
}

const get_issues = async (req, res, next) => {
    try {
        const result = await issue_collection.find({}).toArray()
        res.send(
            {
                success: true,
                message: 'issue not found',
                request_time: new Date().getTime(),
                data: result
            }
        )
    } catch (error) {
        next(error)
    }
}


const get_issue_by_id = async (req, res, next) => {
    const id = req.query.issue_id;
    try {
        const result = await issue_collection.findOne({ _id: new ObjectId(id) })
        res.send(
            {
                success: true,
                message: 'issue not found',
                request_time: new Date().getTime(),
                data: result
            }
        )
    } catch (error) {
        next(error)
    }
}

const get_issue_by_user = async (req, res, next) => {
    const author_name = req.query.author_name;
    try {

        const find_user = await user_collection.findOne({
            name: author_name
        })

        let result = []

        if (!find_user) {
            res.send({
                success: false,
                message: 'User not found',
                request_time: new Date().getTime()
            })
            return
        }
        else {
            if (find_user.designation === 'Chief Executive Officer' || find_user.designation === 'manager') {
                result = await issue_collection.find({}).sort({ issue_number: -1 }).toArray()
            }
            else {
                result = await issue_collection.find({ author_name: author_name }).sort({ issue_number: -1 }).toArray()
            }


            res.send(
                {
                    success: true,
                    message: 'Here is all issues of ' + author_name,
                    request_time: new Date().getTime(),
                    data: result
                }
            )
        }


    } catch (error) {
        next(error)
    }
}

module.exports = {
    add_issue,
    edit_issue,
    delete_issue,
    update_issue,
    get_issues,
    get_issue_by_id,
    get_issue_by_user
}
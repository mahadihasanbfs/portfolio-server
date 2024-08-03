const { ObjectId } = require("mongodb");

const { project_collection } = require("../Collection/all_collection");

const add_project = async (req, res, next) => {
    const body = req.body;
    try {
        const result = await project_collection.insertOne(body);

        res.send({
            success: true,
            message: 'Project added successfully',
            data: result.ops, // Return inserted documents
            request_time: new Date().getTime()
        });

    } catch (error) {
        next(error);
    }
}

const all_project = async (req, res, next) => {
    try {
        const projects = await project_collection.find().sort({ timestamp: -1 }).toArray();
        res.send({
            success: true,
            message: 'All Projects',
            data: projects,
            request_time: new Date().getTime()
        });
    } catch (error) {
        next(error);
    }
}

const delete_project = async (req, res, next) => {
    const id = req.query.project_id;
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
                message: 'project not found',
                request_time: new Date().getTime()
            });
        }
    } catch (error) {
        next(error);
    }
}

const update_project = async (req, res, next) => {
    const id = req.query.project_id;
    const body = req.body;
    try {
        const result = await project_collection.updateOne({ _id: new ObjectId(id) }, { $set: { ...body } });
        if (result.modifiedCount === 1) {
            res.send({
                success: true,
                message: 'project updated successfully',
                request_time: new Date().getTime()
            });
        } else {
            res.status(404).send({
                success: false,
                message: 'project not found',
                request_time: new Date().getTime()
            });
        }
    } catch (error) {
        next(error);
    }
}



const get_project_by_id = async (req, res, next) => {
    const id = req.query.project_id;
    try {
        const project = await project_collection.findOne({ url: id });
        if (project) {
            res.send({
                success: true,
                message: 'project found successfully',
                data: project,
                request_time: new Date().getTime()
            });
        } else {
            res.status(404).send({
                success: false,
                message: 'project not found',
                request_time: new Date().getTime()
            });
        }
    } catch (error) {
        next(error);
    }
}

module.exports = { add_project, all_project, delete_project, update_project, get_project_by_id };

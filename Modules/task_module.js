const { task_collection } = require("../Collection/all_collection");

const add_new_task = async (req, res, next) => {
      try {
            const data = req.body;
            console.log(data);
            const result = await task_collection.insertOne(data);
            res.send({
                  success: true,
                  message: 'Task added successfully',
                  request_time: new Date().getTime(),
                  data: result.ops
            });

      } catch (error) {
            next(error);
      }
};

const get_all_tasks = async (req, res, next) => {
      try {
            const tasks = await task_collection.find().toArray();
            res.send({
                  success: true,
                  message: 'All tasks found successfully',
                  request_time: new Date().getTime(),
                  data: tasks
            });
      } catch (error) {
            next(error);
      }
}

const get_task_by_id = async (req, res, next) => {
      try {
            const id = req.params.id;
            const task = await task_collection.findOne({ _id: new ObjectId(id) });
            res.send({
                  success: true,
                  message: 'Task found successfully',
                  request_time: new Date().getTime(),
                  data: task
            });
      } catch (error) {
            next(error);
      }
}


const get_task_by_assignedTo = async (req, res, next) => {
      try {
            const assignedTo = req.params.assignedTo;
            const tasks = await task_collection.find({ assignedTo }).toArray();
            res.send({
                  success: true,
                  message: 'Tasks found successfully',
                  request_time: new Date().getTime(),
                  data: tasks
            });
      } catch (error) {
            next(error);
      }
}

const update_task = async (req, res, next) => {
      try {
            const id = req.params.id;
            const data = req.body;
            const result = await task_collection.updateOne({ _id: new ObjectId(id) }, { $set: data });
            res.send({
                  success: true,
                  message: 'Task updated successfully',
                  request_time: new Date().getTime(),
                  data: result
            });
      } catch (error) {
            next(error);
      }
}

const delete_task = async (req, res, next) => {
      try {
            const id = req.params.id;
            const result = await task_collection.deleteOne({ _id: new ObjectId(id) });
            res.send({
                  success: true,
                  message: 'Task deleted successfully',
                  request_time: new Date().getTime(),
                  data: result
            });
      } catch (error) {
            next(error);
      }
}

module.exports = {
      add_new_task,
      get_all_tasks,
      get_task_by_id,
      get_task_by_assignedTo,
      update_task,
      delete_task
}

const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();

const uri = `mongodb+srv://brightfuturesoft:brightfuturesoft@brightfuturesoft.b1ugidh.mongodb.net/?retryWrites=true&w=majority&appName=brightfuturesoft`;



// MongoDB Connection
const client = new MongoClient(uri, {
    serverApi: ServerApiVersion.v1,
});


const images_collection = client.db("bright_future_soft").collection("images");
const user_collection = client.db("bright_future_soft").collection("user");
const blogs_collection = client.db("bright_future_soft").collection("blogs");
const job_collection = client.db("bright_future_soft").collection("job");
const project_collection = client.db("bright_future_soft").collection("project");
const job_application_collection = client.db("bright_future_soft").collection("job_application");
const task_collection = client.db("bright_future_soft").collection("task");
const member_collection = client.db("bright_future_soft").collection("member");


module.exports = {
    images_collection, user_collection, blogs_collection, job_collection, project_collection, job_application_collection, task_collection, member_collection
}
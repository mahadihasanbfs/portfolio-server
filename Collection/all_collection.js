const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();

const uri = `mongodb+srv://brightfuturesoft:brightfuturesoft@brightfuturesoft.b1ugidh.mongodb.net/?retryWrites=true&w=majority&appName=brightfuturesoft`;





// MongoDB Connection
const client = new MongoClient(uri, {
      serverApi: ServerApiVersion.v1,
});


const images_collection = client.db("images").collection("images");
const image_collection = client.db("images").collection("image");
const user_collection = client.db("users").collection("user");
const blogs_collection = client.db("content").collection("blogs");
const project_collection = client.db("content").collection("project");
const testimonial_collection = client.db("content").collection("project");
const job_collection = client.db("job").collection("job");
const job_application_collection = client.db("job").collection("job_application");
const meeting_collection = client.db("administrator").collection("meeting");
const task_collection = client.db("administrator").collection("task");
const member_collection = client.db("administrator").collection("member");
const issue_collection = client.db("notice").collection("issue");
const notice_collection = client.db("notice").collection("notice");
const contact_collection = client.db("contact").collection("contact");
const subscriber_collection = client.db("contact").collection("subscriber");
const client_meeting_collection = client.db("administrator").collection("client_meeting");
const acc_clients_collection = client.db("accounts").collection("clients");
const acc_invoices_collection = client.db("accounts").collection("invoices");
const acc_payslips_collection = client.db("accounts").collection("payslips");
const acc_salary_profiles_collection = client.db("accounts").collection("salary_profiles");
const acc_expenses_collection = client.db("accounts").collection("expenses");
const mail_settings_collection = client.db("accounts").collection("mail_settings");
const mail_sent_collection = client.db("accounts").collection("sent_mails");
const gmail_accounts_collection = client.db("accounts").collection("gmail_accounts");
const acc_counters_collection = client.db("accounts").collection("counters");

module.exports = {
      mail_settings_collection,
      mail_sent_collection,
      gmail_accounts_collection,
      acc_clients_collection,
      acc_invoices_collection,
      acc_payslips_collection,
      acc_salary_profiles_collection,
      acc_expenses_collection,
      acc_counters_collection,
      meeting_collection,
      images_collection,
      user_collection,
      blogs_collection,
      job_collection,
      project_collection,
      job_application_collection,
      task_collection,
      member_collection,
      testimonial_collection,
      issue_collection,
      notice_collection,
      contact_collection,
      subscriber_collection,
      client_meeting_collection,
      image_collection

}

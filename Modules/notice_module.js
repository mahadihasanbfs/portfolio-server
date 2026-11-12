const Joi = require("joi");
const { notice_collection, user_collection } = require("../Collection/all_collection");
const { ObjectId } = require("mongodb");
const { ADMIN_DESIGNATIONS } = require("../Middleware/access");

// A notice is written (by the CEO or a manager), then APPROVED BY THE CEO before anyone else can see it.
// The approver's name and the approval time are saved with the notice and printed on the company pad.
// Older notices (no status field) count as approved, with no approver recorded.
const CEO = "Chief Executive Officer";
const is_ceo = (user) => user?.designation === CEO;
const is_admin = (user) => ADMIN_DESIGNATIONS.includes(user?.designation);
const person = (user) => ({ id: String(user._id), name: user.name || user.email || "Unknown", designation: user.designation || "" });

const fail = (res, status, message) => res.status(status).send({ success: false, message, request_time: Date.now() });
const pending = (n) => n.status === "pending";

// The CEO sees everything. Everyone else sees approved notices, plus their own drafts waiting for approval.
const can_view = (n, user) => is_ceo(user) || !pending(n) || String(n.created_by?.id) === String(user._id);

const add_new_notice = async (req, res, next) => {
    if (!is_admin(req.user)) return fail(res, 403, "Only the CEO or a manager can create notices");
    const addNoticeSchema = Joi.object({
        subject: Joi.string().trim().max(200).required(),
        body: Joi.string().max(100000).required(),
        notice_date: Joi.number()
    }).unknown(false);

    const { error } = addNoticeSchema.validate(req.body);
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
        const now = Date.now();
        const doc = { subject: req.body.subject, body: req.body.body, notice_date: req.body.notice_date || now, created_by: person(req.user), created_at: now };
        if (is_ceo(req.user)) {
            // The CEO writing a notice is also approving it.
            Object.assign(doc, { status: "approved", approved_by: person(req.user), approved_at: now });
        } else {
            doc.status = "pending";
        }
        const result = await notice_collection.insertOne(doc);
        res.send({
            success: true,
            message: doc.status === "pending" ? "Notice sent to the CEO for approval" : "Notice published",
            data: { ...doc, _id: result.insertedId },
            request_time: now
        });
    } catch (error) {
        next(error);
    }
}

const get_notice = async (req, res, next) => {
    try {
        const notices = (await notice_collection.find().sort({ notice_date: -1 }).toArray()).filter((n) => can_view(n, req.user));
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
    try {
        const id = req.query.notice_id;
        const notice = ObjectId.isValid(id) ? await notice_collection.findOne({ _id: new ObjectId(id) }) : null;
        if (notice && can_view(notice, req.user)) {
            res.send({ success: true, message: 'Notice found', data: notice, request_time: new Date().getTime() });
        } else {
            res.status(404).send({ success: false, message: 'Notice not found', request_time: new Date().getTime() });
        }
    } catch (error) {
        next(error);
    }
}

// CEO only. Records who approved and when; the notice then becomes visible to everyone.
const approve_notice = async (req, res, next) => {
    try {
        if (!is_ceo(req.user)) return fail(res, 403, "Only the CEO can approve notices");
        const id = req.query.notice_id;
        const notice = ObjectId.isValid(id) ? await notice_collection.findOne({ _id: new ObjectId(id) }) : null;
        if (!notice) return fail(res, 404, "Notice not found");
        if (!pending(notice)) return res.send({ success: true, message: "Notice is already approved", data: notice, request_time: Date.now() });
        const patch = { status: "approved", approved_by: { ...person(req.user), signature: req.user.signature || "" }, approved_at: Date.now() };
        await notice_collection.updateOne({ _id: notice._id }, { $set: patch });
        res.send({ success: true, message: "Notice approved", data: { ...notice, ...patch }, request_time: Date.now() });
    } catch (error) {
        next(error);
    }
}

// CEO only: the signature image printed on notices he approves (saved on his profile, copied onto each notice at approval).
const get_signature = (req, res) => {
    if (!is_ceo(req.user)) return fail(res, 403, "Only the CEO has a notice signature");
    res.send({ success: true, data: { signature: req.user.signature || "" }, request_time: Date.now() });
}

const save_signature = async (req, res, next) => {
    try {
        if (!is_ceo(req.user)) return fail(res, 403, "Only the CEO can set the notice signature");
        const url = String((req.body || {}).signature || "").trim();
        if (url && !/^https:\/\/\S+$/i.test(url)) return fail(res, 400, "Signature must be an uploaded image link");
        await user_collection.updateOne({ _id: req.user._id }, { $set: { signature: url } });
        res.send({ success: true, message: url ? "Signature saved" : "Signature removed", data: { signature: url }, request_time: Date.now() });
    } catch (error) {
        next(error);
    }
}

const delete_notice = async (req, res, next) => {
    try {
        if (!is_admin(req.user)) return fail(res, 403, "Only the CEO or a manager can delete notices");
        const id = req.query.notice_id;
        if (!ObjectId.isValid(id)) return fail(res, 400, "Invalid notice id");
        await notice_collection.deleteOne({ _id: new ObjectId(id) });
        res.send({ success: true, message: 'Notice deleted successfully', request_time: new Date().getTime() });
    } catch (error) {
        next(error);
    }
}


module.exports = { get_signature, save_signature, add_new_notice, get_notice, get_notice_by_id, approve_notice, delete_notice };

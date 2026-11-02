const { hr_bank_collection } = require("../Collection/all_collection");

const ok = (res, message, data) => res.send({ success: true, message, request_time: new Date().getTime(), data });
const bad = (res, message, status = 400) =>
      res.status(status).send({ success: false, message, request_time: new Date().getTime() });

const FIELDS = ["accountHolder", "bankName", "branch", "accountNumber", "routingNumber", "mobileBanking", "mobileNumber"];
const clean = (v) => String(v ?? "").trim().slice(0, 100);

let indexed = false;
const ensure_index = async () => {
      if (indexed) return;
      await hr_bank_collection.createIndex({ userId: 1 }, { unique: true });
      indexed = true;
};

// Own bank details only. Kept out of the user document so /auth/all and sign-in never return them.
const get_mine = async (req, res, next) => {
      try {
            await ensure_index();
            const doc = await hr_bank_collection.findOne({ userId: String(req.user._id) });
            ok(res, "Bank info", FIELDS.reduce((o, k) => ({ ...o, [k]: doc?.[k] || "" }), {}));
      } catch (e) { next(e); }
};

const save_mine = async (req, res, next) => {
      try {
            await ensure_index();
            const data = FIELDS.reduce((o, k) => ({ ...o, [k]: clean(req.body?.[k]) }), {});
            if (data.accountNumber && !/^[0-9A-Za-z\- ]{5,34}$/.test(data.accountNumber)) return bad(res, "Account number looks invalid");
            if (data.mobileNumber && !/^\+?[0-9\- ]{6,16}$/.test(data.mobileNumber)) return bad(res, "Mobile number looks invalid");
            await hr_bank_collection.updateOne(
                  { userId: String(req.user._id) },
                  { $set: { ...data, updatedAt: new Date() }, $setOnInsert: { userId: String(req.user._id) } },
                  { upsert: true }
            );
            ok(res, "Bank info saved", data);
      } catch (e) { next(e); }
};

// Admin: one employee's details, for payroll.
const get_one = async (req, res, next) => {
      try {
            await ensure_index();
            const doc = await hr_bank_collection.findOne({ userId: String(req.params.userId) });
            ok(res, "Bank info", FIELDS.reduce((o, k) => ({ ...o, [k]: doc?.[k] || "" }), {}));
      } catch (e) { next(e); }
};

module.exports = { get_mine, save_mine, get_one };

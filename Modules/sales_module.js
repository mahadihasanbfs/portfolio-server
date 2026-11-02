const { ObjectId } = require("mongodb");
const { sales_leads_collection, sales_visits_collection, user_collection } = require("../Collection/all_collection");
const c = require("./attendance_calc");

const ok = (res, message, data) => res.send({ success: true, message, request_time: new Date().getTime(), data });
const bad = (res, message, status = 400) =>
      res.status(status).send({ success: false, message, request_time: new Date().getTime() });

const STAGES = ["new", "contacted", "meeting", "proposal", "negotiation", "won", "lost"];
const OPEN = STAGES.filter((s) => s !== "won" && s !== "lost");
const SOURCES = ["walk-in", "referral", "website", "phone", "event", "social", "other"];

const uid = (req) => String(req.user._id);
// Salespeople see their own leads; anyone with every page (CEO, manager, Admin role) sees all.
const sees_all = (req) => Boolean(req.access?.permissions?.includes("*"));
const scope = (req) => (sees_all(req) ? {} : { ownerId: uid(req) });
const text = (v, max = 200) => String(v ?? "").trim().slice(0, max);
const url = (v) => (/^https?:\/\/\S{3,1000}$/.test(String(v || "").trim()) ? String(v).trim() : "");

let indexed = false;
const ensure_index = async () => {
      if (indexed) return;
      await sales_leads_collection.createIndex({ ownerId: 1, stage: 1 });
      await sales_visits_collection.createIndex({ leadId: 1, at: -1 });
      await sales_visits_collection.createIndex({ userId: 1, at: -1 });
      indexed = true;
};

const find_lead = async (req, res) => {
      if (!ObjectId.isValid(req.params.id)) { bad(res, "Invalid id"); return null; }
      const lead = await sales_leads_collection.findOne({ _id: new ObjectId(req.params.id), ...scope(req) });
      if (!lead) { bad(res, "Lead not found", 404); return null; }
      return lead;
};

const lead_fields = (b) => {
      const set = {};
      const t = (k, max) => { if (b[k] !== undefined) set[k] = text(b[k], max); };
      ["company", "contactName", "designation", "phone", "email", "address", "interest"].forEach((k) => t(k, 150));
      t("notes", 2000);
      if (b.source !== undefined) set.source = SOURCES.includes(b.source) ? b.source : "other";
      if (b.value !== undefined) set.value = Math.max(0, Number(b.value) || 0);
      if (b.nextFollowUp !== undefined) set.nextFollowUp = c.is_date(b.nextFollowUp) ? b.nextFollowUp : "";
      if (b.cardImage !== undefined) set.cardImage = url(b.cardImage);
      if (b.lostReason !== undefined) set.lostReason = text(b.lostReason, 300);
      return set;
};

/* ============ leads ============ */

const list_leads = async (req, res, next) => {
      try {
            await ensure_index();
            const filter = { ...scope(req) };
            if (sees_all(req) && ObjectId.isValid(req.query.owner)) filter.ownerId = String(req.query.owner);
            if (STAGES.includes(req.query.stage)) filter.stage = req.query.stage;
            const q = text(req.query.q, 60);
            if (q) { const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"); filter.$or = [{ company: re }, { contactName: re }, { phone: re }, { email: re }]; }
            const leads = await sales_leads_collection.find(filter).sort({ updatedAt: -1 }).limit(500).toArray();
            const owners = sees_all(req) ? await user_collection.find({}, { projection: { name: 1, image: 1 } }).toArray() : [req.user];
            const who = new Map(owners.map((u) => [String(u._id), u]));
            ok(res, "Leads", leads.map((l) => ({ ...l, ownerName: who.get(l.ownerId)?.name || "Unknown", ownerImage: who.get(l.ownerId)?.image || "" })));
      } catch (e) { next(e); }
};

const create_lead = async (req, res, next) => {
      try {
            await ensure_index();
            const set = lead_fields(req.body || {});
            if (!set.company && !set.contactName) return bad(res, "Give a company or a contact name");
            const now = new Date().toISOString();
            const doc = {
                  company: "", contactName: "", designation: "", phone: "", email: "", address: "", interest: "", notes: "", source: "other", value: 0, nextFollowUp: "", cardImage: "", lostReason: "",
                  ...set,
                  ownerId: sees_all(req) && ObjectId.isValid(req.body?.ownerId) ? String(req.body.ownerId) : uid(req),
                  stage: "new",
                  history: [{ at: now, by: req.user.name || "", to: "new" }],
                  createdAt: now, updatedAt: now,
            };
            const r = await sales_leads_collection.insertOne(doc);
            ok(res, "Lead added", { ...doc, _id: r.insertedId });
      } catch (e) { next(e); }
};

const get_lead = async (req, res, next) => {
      try {
            const lead = await find_lead(req, res); if (!lead) return;
            const [visits, owner] = await Promise.all([
                  sales_visits_collection.find({ leadId: String(lead._id) }).sort({ at: -1 }).toArray(),
                  user_collection.findOne({ _id: new ObjectId(lead.ownerId) }, { projection: { name: 1 } }),
            ]);
            const names = new Map((await user_collection.find({ _id: { $in: [...new Set(visits.map((v) => v.userId))].filter(ObjectId.isValid).map((i) => new ObjectId(i)) } }, { projection: { name: 1 } }).toArray()).map((u) => [String(u._id), u.name]));
            ok(res, "Lead", { ...lead, ownerName: owner?.name || "Unknown", visits: visits.map((v) => ({ ...v, userName: names.get(v.userId) || "Unknown" })) });
      } catch (e) { next(e); }
};

const update_lead = async (req, res, next) => {
      try {
            const lead = await find_lead(req, res); if (!lead) return;
            const set = lead_fields(req.body || {});
            const push = {};
            const now = new Date().toISOString();
            if (req.body?.stage !== undefined && req.body.stage !== lead.stage) {
                  if (!STAGES.includes(req.body.stage)) return bad(res, `stage must be one of: ${STAGES.join(", ")}`);
                  if (req.body.stage === "lost" && !(set.lostReason ?? lead.lostReason)) return bad(res, "Say why the deal was lost");
                  set.stage = req.body.stage;
                  if (set.stage === "won") set.wonAt = now;
                  push.history = { at: now, by: req.user.name || "", from: lead.stage, to: set.stage };
            }
            if (sees_all(req) && req.body?.ownerId !== undefined) {
                  if (!ObjectId.isValid(req.body.ownerId) || !(await user_collection.findOne({ _id: new ObjectId(req.body.ownerId) }))) return bad(res, "Unknown owner");
                  set.ownerId = String(req.body.ownerId);
            }
            if (!Object.keys(set).length) return bad(res, "Nothing to update");
            set.updatedAt = now;
            const update = { $set: set };
            if (push.history) update.$push = push;
            await sales_leads_collection.updateOne({ _id: lead._id }, update);
            ok(res, "Lead updated", await sales_leads_collection.findOne({ _id: lead._id }));
      } catch (e) { next(e); }
};

const delete_lead = async (req, res, next) => {
      try {
            const lead = await find_lead(req, res); if (!lead) return;
            await sales_visits_collection.deleteMany({ leadId: String(lead._id) });
            await sales_leads_collection.deleteOne({ _id: lead._id });
            ok(res, "Lead deleted");
      } catch (e) { next(e); }
};

/* ============ visits ============ */

const clean_gps = (g) => {
      if (!g || typeof g !== "object") return null;
      const lat = Number(g.lat), lng = Number(g.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
      return { lat, lng, accuracy: Number.isFinite(Number(g.accuracy)) ? Math.round(Number(g.accuracy)) : null, capturedAt: new Date().toISOString() };
};

// Saves one visit on a lead and, in the same step, moves the deal and sets the next follow-up if asked.
const record_visit = async (req, lead, b) => {
      const photos = (Array.isArray(b.photos) ? b.photos : []).map(url).filter(Boolean).slice(0, 6);
      const purpose = text(b.purpose, 150), notes = text(b.notes, 2000);
      if (!purpose && !notes && !photos.length) return { error: "Add a purpose, a note or a photo" };
      const now = new Date().toISOString();
      const doc = { leadId: String(lead._id), userId: uid(req), at: now, purpose, notes, photos, gps: clean_gps(b.gps), outcome: text(b.outcome, 60) };
      const r = await sales_visits_collection.insertOne(doc);

      const set = { updatedAt: now, lastVisitAt: now };
      const update = { $set: set };
      if (c.is_date(b.nextFollowUp)) set.nextFollowUp = b.nextFollowUp;
      if (STAGES.includes(b.stage) && b.stage !== lead.stage && b.stage !== "lost") {
            set.stage = b.stage;
            if (b.stage === "won") set.wonAt = now;
            update.$push = { history: { at: now, by: req.user.name || "", from: lead.stage, to: b.stage } };
      }
      await sales_leads_collection.updateOne({ _id: lead._id }, update);
      return { visit: { ...doc, _id: r.insertedId, userName: req.user.name } };
};

const add_visit = async (req, res, next) => {
      try {
            const lead = await find_lead(req, res); if (!lead) return;
            const out = await record_visit(req, lead, req.body || {});
            if (out.error) return bad(res, out.error);
            ok(res, "Visit saved", out.visit);
      } catch (e) { next(e); }
};

// One-step field entry: visit an existing lead, or a brand-new prospect (created here with its visiting card).
const quick_visit = async (req, res, next) => {
      try {
            await ensure_index();
            const b = req.body || {};
            let lead;
            if (b.leadId) {
                  if (!ObjectId.isValid(b.leadId)) return bad(res, "Invalid lead");
                  lead = await sales_leads_collection.findOne({ _id: new ObjectId(b.leadId), ...scope(req) });
                  if (!lead) return bad(res, "Lead not found", 404);
            } else {
                  const set = lead_fields(b.newLead || {});
                  if (!set.company && !set.contactName) return bad(res, "Give the prospect's company or contact name");
                  const now = new Date().toISOString();
                  const doc = {
                        company: "", contactName: "", designation: "", phone: "", email: "", address: "", interest: "", notes: "", source: "walk-in", value: 0, nextFollowUp: "", cardImage: "", lostReason: "",
                        ...set, ownerId: uid(req), stage: "new",
                        history: [{ at: now, by: req.user.name || "", to: "new" }], createdAt: now, updatedAt: now,
                  };
                  const r = await sales_leads_collection.insertOne(doc);
                  lead = { ...doc, _id: r.insertedId };
            }
            const out = await record_visit(req, lead, b);
            if (out.error) return bad(res, out.error);
            ok(res, "Visit saved", { ...out.visit, leadId: String(lead._id), company: lead.company || lead.contactName });
      } catch (e) { next(e); }
};

const delete_visit = async (req, res, next) => {
      try {
            if (!ObjectId.isValid(req.params.id)) return bad(res, "Invalid id");
            const visit = await sales_visits_collection.findOne({ _id: new ObjectId(req.params.id) });
            if (!visit) return bad(res, "Visit not found", 404);
            if (!sees_all(req) && visit.userId !== uid(req)) return bad(res, "You can only delete your own visits", 403);
            await sales_visits_collection.deleteOne({ _id: visit._id });
            ok(res, "Visit deleted");
      } catch (e) { next(e); }
};

// Recent visits across all leads, newest first.
const list_visits = async (req, res, next) => {
      try {
            const from = c.is_date(req.query.from) ? req.query.from : new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
            const filter = { at: { $gte: new Date(`${from}T00:00:00+06:00`).toISOString() } };
            if (!sees_all(req)) filter.userId = uid(req);
            else if (ObjectId.isValid(req.query.user)) filter.userId = String(req.query.user);
            const visits = await sales_visits_collection.find(filter).sort({ at: -1 }).limit(200).toArray();
            const leads = new Map((await sales_leads_collection.find({ _id: { $in: [...new Set(visits.map((v) => v.leadId))].map((i) => new ObjectId(i)) } }, { projection: { company: 1, contactName: 1 } }).toArray()).map((l) => [String(l._id), l]));
            const users = new Map((await user_collection.find({ _id: { $in: [...new Set(visits.map((v) => v.userId))].filter(ObjectId.isValid).map((i) => new ObjectId(i)) } }, { projection: { name: 1 } }).toArray()).map((u) => [String(u._id), u.name]));
            ok(res, "Visits", visits.map((v) => ({ ...v, company: leads.get(v.leadId)?.company || leads.get(v.leadId)?.contactName || "Deleted lead", userName: users.get(v.userId) || "Unknown" })));
      } catch (e) { next(e); }
};

/* ============ summary ============ */

const summary = async (req, res, next) => {
      try {
            const today = c.local_parts().date;
            const month = today.slice(0, 7);
            const monthStart = new Date(`${month}-01T00:00:00+06:00`).toISOString();
            const leads = await sales_leads_collection.find(scope(req)).toArray();
            const visits = await sales_visits_collection.find({ ...(sees_all(req) ? {} : { userId: uid(req) }), at: { $gte: monthStart } }).toArray();

            const stages = STAGES.map((stage) => {
                  const rows = leads.filter((l) => l.stage === stage);
                  return { stage, count: rows.length, value: rows.reduce((n, l) => n + (l.value || 0), 0) };
            });
            const open = leads.filter((l) => OPEN.includes(l.stage));
            const wonThisMonth = leads.filter((l) => l.stage === "won" && (l.wonAt || "") >= monthStart);
            const due = open.filter((l) => l.nextFollowUp && l.nextFollowUp <= today).sort((a, b) => (a.nextFollowUp < b.nextFollowUp ? -1 : 1));
            const closed = leads.filter((l) => l.stage === "won" || l.stage === "lost");

            const out = {
                  stages,
                  openValue: open.reduce((n, l) => n + (l.value || 0), 0),
                  openCount: open.length,
                  wonMonth: { count: wonThisMonth.length, value: wonThisMonth.reduce((n, l) => n + (l.value || 0), 0) },
                  winRate: closed.length ? Math.round((leads.filter((l) => l.stage === "won").length / closed.length) * 100) : null,
                  visitsMonth: visits.length,
                  visitsToday: visits.filter((v) => c.local_parts(v.at).date === today).length,
                  followUps: due.slice(0, 20).map((l) => ({ _id: l._id, company: l.company || l.contactName, nextFollowUp: l.nextFollowUp, stage: l.stage, overdue: l.nextFollowUp < today })),
                  dueCount: due.length,
            };
            if (sees_all(req)) {
                  const users = await user_collection.find({}, { projection: { name: 1, image: 1 } }).toArray();
                  out.team = users.map((u) => {
                        const id = String(u._id);
                        const mine = leads.filter((l) => l.ownerId === id);
                        const won = mine.filter((l) => l.stage === "won" && (l.wonAt || "") >= monthStart);
                        return {
                              userId: id, name: u.name, image: u.image || "",
                              leads: mine.length, open: mine.filter((l) => OPEN.includes(l.stage)).length,
                              wonCount: won.length, wonValue: won.reduce((n, l) => n + (l.value || 0), 0),
                              visits: visits.filter((v) => v.userId === id).length,
                        };
                  }).filter((t) => t.leads || t.visits).sort((a, b) => b.wonValue - a.wonValue || b.visits - a.visits);
            }
            ok(res, "Sales summary", out);
      } catch (e) { next(e); }
};

/* ============ monitoring ============ */

const day_gap = (iso, now) => Math.floor((now - new Date(iso).getTime()) / 86400000);

// What needs attention: leads going cold, missed follow-ups, and where the field team has been.
const monitor = async (req, res, next) => {
      try {
            const now = Date.now();
            const todayDate = c.local_parts().date;
            const weekAgo = new Date(now - 7 * 86400000).toISOString();
            const monthStart = new Date(`${todayDate.slice(0, 7)}-01T00:00:00+06:00`).toISOString();
            const mine = sees_all(req) ? {} : { userId: uid(req) };

            const [leads, week, monthVisits, users] = await Promise.all([
                  sales_leads_collection.find({ ...scope(req), stage: { $in: OPEN } }).toArray(),
                  sales_visits_collection.find({ ...mine, at: { $gte: weekAgo } }).sort({ at: -1 }).toArray(),
                  sales_visits_collection.find({ ...mine, at: { $gte: monthStart } }, { projection: { gps: 1 } }).toArray(),
                  user_collection.find({}, { projection: { name: 1, image: 1 } }).toArray(),
            ]);
            const who = new Map(users.map((u) => [String(u._id), u]));
            const companyOf = new Map();

            const rows = leads.map((l) => {
                  const touched = l.lastVisitAt || l.updatedAt || l.createdAt;
                  const idle = day_gap(touched, now);
                  const reasons = [];
                  if (l.nextFollowUp && l.nextFollowUp < todayDate) reasons.push("overdue");
                  if (idle >= 7) reasons.push("stale");
                  if (l.stage === "new" && !l.lastVisitAt && day_gap(l.createdAt, now) >= 2) reasons.push("untouched");
                  if (["proposal", "negotiation"].includes(l.stage) && idle >= 5) reasons.push("stuck");
                  if (l.stage !== "new" && !l.nextFollowUp) reasons.push("no_followup");
                  companyOf.set(String(l._id), l.company || l.contactName);
                  return { _id: l._id, company: l.company || l.contactName, contactName: l.contactName, phone: l.phone, stage: l.stage, value: l.value || 0, nextFollowUp: l.nextFollowUp, idleDays: idle, reasons, ownerName: who.get(l.ownerId)?.name || "Unknown" };
            });
            const counts = ["overdue", "stale", "untouched", "stuck", "no_followup"].reduce((o, k) => ({ ...o, [k]: rows.filter((r) => r.reasons.includes(k)).length }), {});
            const attention = rows.filter((r) => r.reasons.length)
                  .sort((a, b) => Number(b.reasons.includes("overdue")) - Number(a.reasons.includes("overdue")) || b.reasons.length - a.reasons.length || b.value - a.value)
                  .slice(0, 100);

            const lead_names = new Map((await sales_leads_collection.find({ _id: { $in: [...new Set(week.map((v) => v.leadId))].filter(ObjectId.isValid).map((i) => new ObjectId(i)) } }, { projection: { company: 1, contactName: 1 } }).toArray()).map((l) => [String(l._id), l.company || l.contactName]));
            const byUser = new Map();
            week.forEach((v) => {
                  const e = byUser.get(v.userId) || { userId: v.userId, name: who.get(v.userId)?.name || "Unknown", image: who.get(v.userId)?.image || "", visitsToday: 0, visitsWeek: 0, lastVisit: null };
                  e.visitsWeek += 1;
                  if (c.local_parts(v.at).date === todayDate) e.visitsToday += 1;
                  if (!e.lastVisit) e.lastVisit = { at: v.at, company: lead_names.get(v.leadId) || "Deleted lead", gps: v.gps };
                  byUser.set(v.userId, e);
            });
            ok(res, "Lead monitor", {
                  counts, attentionTotal: rows.filter((r) => r.reasons.length).length, openLeads: rows.length, attention,
                  field: [...byUser.values()].sort((a, b) => (a.lastVisit.at < b.lastVisit.at ? 1 : -1)),
                  points: week.filter((v) => v.gps).slice(0, 300).map((v) => ({ lat: v.gps.lat, lng: v.gps.lng, accuracy: v.gps.accuracy, at: v.at, userName: who.get(v.userId)?.name || "Unknown", company: lead_names.get(v.leadId) || "Deleted lead", leadId: v.leadId })),
                  noGpsMonth: monthVisits.filter((v) => !v.gps).length, visitsMonth: monthVisits.length,
            });
      } catch (e) { next(e); }
};

module.exports = { list_leads, create_lead, get_lead, update_lead, delete_lead, add_visit, quick_visit, delete_visit, list_visits, summary, monitor, STAGES, SOURCES };

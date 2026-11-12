// Why someone is contacting us. The contact form makes visitors pick one; the dashboard shows and filters by it.
const REASONS = [
      { id: "sales", label: "Sales & Product Inquiry" },
      { id: "proposal", label: "Project Proposal" },
      { id: "partnership", label: "Business Partnership" },
      { id: "career", label: "Career & Internship" },
      { id: "support", label: "Customer Support" },
      { id: "general", label: "General Inquiry" },
      { id: "media", label: "Media & Press" },
      { id: "feedback", label: "Complaints & Feedback" },
];

const reason_label = (id) => REASONS.find((r) => r.id === id)?.label || null;

module.exports = { REASONS, reason_label };

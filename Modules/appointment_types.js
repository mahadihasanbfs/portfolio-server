// Bookable appointment types. Add a type here and it shows up on /book automatically.
const APPOINTMENT_TYPES = [
      {
            id: "consultation",
            name: "Free Consultation",
            duration: 30,
            icon: "chat",
            prepare: ["Think about the problem you want to solve and who will use the product", "Share a rough budget range and timeline if you have one", "Bring existing documents, links or examples you like"],
            description: "Talk through your idea, goals and budget. We suggest the best way to build it.",
            tag: "Popular",
      },
      {
            id: "demo",
            name: "Application Demo",
            duration: 45,
            icon: "screen",
            prepare: ["Tell us which product or past project you want to see", "List the features that matter most to you", "Invite colleagues who will help decide"],
            description: "A live walkthrough of our ready-made products and past work, with your questions answered.",
      },
      {
            id: "discovery",
            name: "Project Discovery Workshop",
            duration: 60,
            icon: "map",
            prepare: ["Gather requirements, user roles and any existing documents", "Know your deadline and a rough budget", "Bring the people who can make scope decisions"],
            description: "A deeper session to define scope, features, timeline and a clear estimate for your project.",
      },
      {
            id: "estimation",
            name: "Project Estimation",
            duration: 45,
            icon: "calculator",
            prepare: ["Write down the main features you need", "Share your ideal launch date and budget range", "Send reference apps or designs you like"],
            description: "Get a clear cost and timeline estimate for your project, with scope, team size and delivery phases explained.",
      },
      {
            id: "technical",
            name: "Technical Review",
            duration: 45,
            icon: "code",
            prepare: ["Share architecture notes or repository access ahead if possible", "List the problems, errors or slow areas you see", "Have someone from your technical team join"],
            description: "Architecture, code or infrastructure review of an existing system with our senior engineers.",
      },
      {
            id: "support",
            name: "Support Session",
            duration: 30,
            icon: "lifebuoy",
            prepare: ["Note the issue and when it started", "Have screenshots, error messages or links ready", "Tell us how urgent it is"],
            description: "Existing client? Get help with an issue, a change request or a handover.",
      },
      {
            id: "partnership",
            name: "Partnership Meeting",
            duration: 30,
            icon: "handshake",
            prepare: ["Prepare a short intro of your company and services", "Think about how you would like to work together", "Bring examples of past collaborations"],
            description: "Agencies, vendors and business partners: explore working together.",
      },
];

// online: Google Meet · phone: we call · client_site: we visit them (map link required)
// (Older bookings may still carry mode "office"; it is no longer offered.)
const MEETING_MODES = ["online", "phone", "client_site"];

// Shown for online and phone bookings: what the meeting is and how to get ready.
const MODE_INFO = {
      online: {
            title: "Online meeting on Google Meet",
            summary: "We meet on Google Meet. Your personal link is emailed to you and added to the calendar invite.",
            tips: ["Join a few minutes early from a laptop or phone with a stable connection", "Check your camera and microphone before the call", "Have your notes or documents open so you can share your screen"],
      },
      phone: {
            title: "Phone call",
            summary: "We call you at the booked time on the phone number you give us.",
            tips: ["Keep your phone with you and charged at the booked time", "Choose a quiet place with good signal", "Have your notes ready so we can use the time well"],
      },
};

// What a visitor should know/prepare for this booking.
const prep_for = (a) => {
      const type = APPOINTMENT_TYPES.find(t => t.id === a.type);
      return { mode: MODE_INFO[a.mode] || null, prepare: type ? type.prepare : [] };
};

module.exports = { APPOINTMENT_TYPES, MEETING_MODES, MODE_INFO, prep_for };

// Company holidays: no appointments can be booked on these dates. Shared with the dashboard calendar via GET /appointment/holidays.
const HOLIDAYS = [
      { date: "2026-02-04", name: "Shab e-Barat (Night of Records)" },
      { date: "2026-02-21", name: "Shahid Dibosh (International Mother Language Day)" },
      { date: "2026-03-17", name: "Shab-e-Qadar (Night of Destiny)" },
      { date: "2026-03-19", name: "Eid-ul-Fitr Holiday" },
      { date: "2026-03-20", name: "Jumatul Bidah" },
      { date: "2026-03-20", name: "Eid-ul-Fitr Holiday" },
      { date: "2026-03-21", name: "Eid-ul-Fitr (End of Ramadan)" },
      { date: "2026-03-22", name: "Eid-ul-Fitr Holiday" },
      { date: "2026-03-23", name: "Eid-ul-Fitr Holiday" },
      { date: "2026-03-26", name: "Independence Day (National Day)" },
      { date: "2026-04-14", name: "Pahela Baishakh (Bangla New Year)" },
      { date: "2026-05-01", name: "May Day" },
      { date: "2026-05-01", name: "Buddha Purnima (Buddha Day)" },
      { date: "2026-05-26", name: "Eid-ul-Azha Holiday" },
      { date: "2026-05-27", name: "Eid-ul-Azha Holiday" },
      { date: "2026-05-28", name: "Eid-ul-Azha (Feast of Sacrifice)" },
      { date: "2026-05-29", name: "Eid-ul-Azha Holiday" },
      { date: "2026-05-30", name: "Eid-ul-Azha Holiday" },
      { date: "2026-05-31", name: "Eid-ul-Azha Holiday" },
      { date: "2026-06-26", name: "Ashura (Muharram)" },
      { date: "2026-07-01", name: "July Bank Holiday" },
      { date: "2026-08-05", name: "July Mass Uprising Day" },
      { date: "2026-08-26", name: "Eid-e-Milad-un-Nabi (Prophet’s Birthday)" },
      { date: "2026-09-04", name: "Sri Krishna Janmashtami" },
      { date: "2026-10-20", name: "Durga Puja Holiday" },
      { date: "2026-10-21", name: "Durga Puja (Bijoya Dashami)" },
      { date: "2026-12-16", name: "Bijoy Dibosh (Victory Day)" },
      { date: "2026-12-25", name: "Christmas Day" },
      { date: "2025-12-16", name: "Victory Day" },
      { date: "2025-12-25", name: "Christmas Day" },
];

// Recurring yearly company events: closed for bookings too.
const SPECIAL_DAYS = [
      { month: 1, day: 1, name: "New Year Celebrations" },
      { month: 1, day: 3, name: "Company Anniversary" },
];

// Weekend days (0 = Sunday ... 6 = Saturday). Matches the dashboard calendar.
const WEEKEND_DAYS = [6];

// Recurring weekly no-meeting windows, Dhaka time (day 0 = Sunday ... 6 = Saturday).
const BLOCKED_WINDOWS = [
      { day: 5, from: "12:00", to: "15:00" }, // Friday prayer / break
];

const ALL_CLOSED = () => {
      const year = new Date().getFullYear();
      const special = [];
      for (let y = year; y <= year + 2; y++) {
            SPECIAL_DAYS.forEach(s => special.push({
                  date: `${y}-${String(s.month).padStart(2, "0")}-${String(s.day).padStart(2, "0")}`,
                  name: s.name,
                  type: "special",
            }));
      }
      return [...HOLIDAYS.map(h => ({ ...h, type: "holiday" })), ...special];
};

module.exports = { HOLIDAYS, SPECIAL_DAYS, WEEKEND_DAYS, BLOCKED_WINDOWS, ALL_CLOSED };

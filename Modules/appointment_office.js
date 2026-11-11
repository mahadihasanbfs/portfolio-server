// Office location for "Visit our office" appointments.
// Set OFFICE_MAP_URL in .env to the exact Google Maps share link of the office pin
// (Google Maps > Share > Copy link). Without it, a Maps search for the address is used.
const fetch = require("node-fetch");

const OFFICE = {
      name: "Bright Future Soft Office",
      address: "Shewrapara, Mirpur, Dhaka, Bangladesh", // same address as the site's structured data
};

// Only real map providers over https. Anything else is rejected so the emails never carry an arbitrary link.
const MAP_HOSTS = [
      /^(www\.)?google\.com$/, /^maps\.google\.com$/, /^maps\.app\.goo\.gl$/, /^goo\.gl$/,
      /^(www\.)?openstreetmap\.org$/, /^maps\.apple\.com$/,
];

const valid_map_url = (raw) => {
      try {
            const u = new URL(String(raw || "").trim());
            if (u.protocol !== "https:") return null;
            if (!MAP_HOSTS.some(rx => rx.test(u.hostname))) return null;
            const google = /(^|\.)google\.com$/.test(u.hostname);
            if (google && !u.pathname.startsWith("/maps")) return null; // google.com/maps only
            if (u.hostname === "goo.gl" && !u.pathname.startsWith("/maps")) return null;
            return u.toString();
      } catch {
            return null;
      }
};

const search_url = (address) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

const default_url = () => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(OFFICE.address)}`;

let cache = null; // { at, data }
const TTL = 60 * 60 * 1000;

// Is the link well-formed AND does it actually open? Cached for an hour.
const office = async () => {
      if (cache && Date.now() - cache.at < TTL) return cache.data;
      const configured = process.env.OFFICE_MAP_URL;
      let map_url = valid_map_url(configured);
      if (configured && !map_url) console.error("OFFICE_MAP_URL is not a valid https map link; using an address search instead.");
      if (!map_url) map_url = default_url();

      let reachable = false;
      try {
            const ctl = new AbortController();
            const timer = setTimeout(() => ctl.abort(), 4000);
            const r = await fetch(map_url, { method: "GET", redirect: "follow", signal: ctl.signal, headers: { "user-agent": "Mozilla/5.0" } });
            clearTimeout(timer);
            reachable = r.status < 400;
      } catch { /* offline or blocked: link format is still valid */ }

      const data = { ...OFFICE, map_url, link_valid: true, link_reachable: reachable, exact_pin: Boolean(valid_map_url(configured)) };
      cache = { at: Date.now(), data };
      return data;
};

// Sync version for emails: never waits on the network.
const office_sync = () => ({ ...OFFICE, map_url: valid_map_url(process.env.OFFICE_MAP_URL) || default_url() });

// Pulls coordinates and a place name out of a final Google Maps URL.
const parse_coords = (final_url) => {
      let u = final_url;
      try {
            // Consent pages wrap the real URL in ?continue=
            const parsed = new URL(u);
            if (/consent\./.test(parsed.hostname) && parsed.searchParams.get("continue")) u = parsed.searchParams.get("continue");
      } catch { /* keep as is */ }
      const num = (v) => Number(v);
      const precise = u.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
      const at = u.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      const q = u.match(/[?&](?:q|ll|query|destination)=(-?\d+\.\d+)(?:,|%2C)(-?\d+\.\d+)/);
      const osm = u.match(/openstreetmap\.org\/.*#map=\d+\/(-?\d+\.\d+)\/(-?\d+\.\d+)/);
      const hit = precise || at || q || osm;
      if (!hit) return null;
      const lat = num(hit[1]), lng = num(hit[2]);
      if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)) return null;
      const place = (u.match(/\/maps\/place\/([^/@?]+)/) || [])[1];
      let name = null;
      try { name = place ? decodeURIComponent(place.replace(/\+/g, " ")) : null; } catch { name = null; }
      return { lat, lng, place: name };
};

// Is this a proper map link, does it open, and where does it point? Used by the booking form and on booking.
const check_map = async (raw) => {
      const url = valid_map_url(raw);
      if (!url) return { valid: false, reachable: false, url: null, lat: null, lng: null, place: null };
      let reachable = false, geo = null;
      try {
            const ctl = new AbortController();
            const timer = setTimeout(() => ctl.abort(), 5000);
            const r = await fetch(url, { method: "GET", redirect: "follow", follow: 5, signal: ctl.signal, headers: { "user-agent": "Mozilla/5.0" } });
            clearTimeout(timer);
            reachable = r.status < 400;
            geo = parse_coords(r.url || url) || parse_coords(url);
      } catch {
            geo = parse_coords(url); // link itself may already carry coordinates
      }
      return { valid: true, reachable, url, lat: geo?.lat ?? null, lng: geo?.lng ?? null, place: geo?.place ?? null };
};

module.exports = { office, office_sync, valid_map_url, search_url, check_map };

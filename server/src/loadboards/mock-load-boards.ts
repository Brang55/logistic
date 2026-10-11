import { distanceM as distanceMeters } from "../telematics/geo";
import { ExternalLoad, LoadBoardProvider, LoadContact, LoadStop } from "./loadboard.types";

// City centres, or the freight area where a 40 t truck can't reach the centre legally.
const CITIES: Record<string, LoadStop["point"]> = {
  "Dallas, TX": [-96.797, 32.7767],
  "Houston, TX": [-95.3698, 29.7604],
  "Laredo, TX": [-99.5075, 27.5306],
  "Oklahoma City, OK": [-97.5164, 35.4676],
  "Chicago, IL": [-87.6298, 41.8781],
  "Indianapolis, IN": [-86.1581, 39.7684],
  "Louisville, KY": [-85.7585, 38.2527],
  "St. Louis, MO": [-90.1994, 38.627],
  "Atlanta, GA": [-84.388, 33.749],
  "Savannah, GA": [-81.0912, 32.0809],
  "Charlotte, NC": [-80.8431, 35.2271],
  "Columbus, OH": [-82.9988, 39.9612],
  "Detroit, MI": [-83.0458, 42.3314],
  "Memphis, TN": [-90.049, 35.1495],
  "Nashville, TN": [-86.7816, 36.1627],
  "Los Angeles, CA": [-118.2437, 34.0522],
  "Phoenix, AZ": [-112.074, 33.4484],
  "Salt Lake City, UT": [-111.891, 40.7608],
  "Denver, CO": [-104.9903, 39.7392],
  "Kansas City, MO": [-94.5786, 39.0997],
  "Omaha, NE": [-95.9345, 41.2565],
  "Minneapolis, MN": [-93.265, 44.9778],
  "Jacksonville, FL": [-81.6557, 30.3322],
};

// [origin, destination, pickup in N days, equipment, lb, USD per mile, commodity, shipper, receiver, hazmat, booked]
type Row = [string, string, number, ExternalLoad["equipment"], number, number, string, string, string, boolean?, boolean?];

const US_LOADS: Row[] = [
  ["Dallas, TX", "Chicago, IL", 1, "Dry van", 40000, 2.35, "Consumer electronics", "Lone Star Distribution", "Lakeshore Retail"],
  ["Houston, TX", "Atlanta, GA", 2, "Tanker", 44000, 2.95, "Lubricants", "Gulf Coast Lubes", "Peachtree Industrial", true],
  ["Chicago, IL", "Columbus, OH", 1, "Reefer", 37500, 2.6, "Frozen poultry", "Windy City Foods", "Buckeye Grocers"],
  ["Indianapolis, IN", "Charlotte, NC", 2, "Dry van", 31000, 2.25, "Packaged goods", "Hoosier Packaging", "Queen City Supply", false, true],
  ["Atlanta, GA", "Jacksonville, FL", 1, "Reefer", 42000, 2.75, "Fresh produce", "Georgia Growers", "First Coast Markets"],
  ["Memphis, TN", "Dallas, TX", 2, "Dry van", 35000, 2.15, "Retail freight", "Bluff City Logistics", "Metroplex Stores"],
  ["Nashville, TN", "Detroit, MI", 3, "Flatbed", 46000, 2.8, "Steel beams", "Music City Steel", "Motor City Fabrication"],
  ["Los Angeles, CA", "Phoenix, AZ", 1, "Dry van", 26500, 2.6, "Furniture", "Pacific Furnishings", "Valley Home Center"],
  ["Phoenix, AZ", "Denver, CO", 2, "Reefer", 39500, 2.65, "Dairy", "Sonoran Dairy", "Mile High Foods", false, true],
  ["Denver, CO", "Kansas City, MO", 2, "Flatbed", 48000, 2.5, "Lumber", "Rocky Mountain Lumber", "Heartland Builders"],
  ["Kansas City, MO", "Chicago, IL", 1, "Dry van", 33000, 2.25, "Pet food", "Prairie Pet Co.", "Midwest Pet Supply"],
  ["Columbus, OH", "Atlanta, GA", 3, "Dry van", 28500, 2.35, "Auto parts", "Ohio Auto Supply", "Southern Assembly"],
  ["Charlotte, NC", "Memphis, TN", 2, "Dry van", 38500, 2.4, "Textiles", "Carolina Mills", "Delta Apparel"],
  ["Detroit, MI", "Indianapolis, IN", 1, "Flatbed", 43000, 2.6, "Machinery", "Great Lakes Machining", "Crossroads Manufacturing"],
  ["Laredo, TX", "St. Louis, MO", 2, "Dry van", 41000, 2.3, "Household appliances", "Border Gateway Logistics", "Gateway Arch Distribution"],
  ["Savannah, GA", "Charlotte, NC", 1, "Dry van", 37000, 2.7, "Imported home goods", "Coastal Empire Transload", "Piedmont Retail DC", false, true],
  ["Omaha, NE", "Minneapolis, MN", 2, "Reefer", 40500, 2.55, "Frozen beef", "Platte Valley Meats", "North Star Grocers", false, true],
  ["Louisville, KY", "Nashville, TN", 1, "Dry van", 30500, 2.9, "Appliance parts", "Derby City Supply", "Cumberland Assembly"],
  ["Oklahoma City, OK", "Houston, TX", 2, "Tanker", 45000, 3.1, "Industrial chemicals", "Red Dirt Chemicals", "Ship Channel Refining", true],
  ["Salt Lake City, UT", "Phoenix, AZ", 3, "Flatbed", 47000, 2.7, "Lumber", "Wasatch Timber", "Valley Home Center"],
];

const CONTACTS = ["Mike Turner", "Sara Ortiz", "Dan Brooks", "Kim Lee"];
const AREA_CODES = ["214", "312", "404", "602", "713", "615"];

const contact = (company: string, index: number, role: "s" | "r"): LoadContact => {
  const domain = company.toLowerCase().replace(/[^a-z0-9]+/g, "") + ".demo";
  return {
    name: company,
    contact: CONTACTS[(index + (role === "r" ? 1 : 0)) % CONTACTS.length],
    phone: `+1 ${AREA_CODES[index % AREA_CODES.length]} 555 ${1000 + index * 7 + (role === "r" ? 3 : 0)}`,
    email: `${role === "s" ? "dispatch" : "receiving"}@${domain}`,
  };
};

const isoDay = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

const MILE_M = 1609.344;
const POUND_KG = 0.45359237;

function buildLoads(board: string, rows: Row[]): ExternalLoad[] {
  return rows.map(([from, to, inDays, equipment, pounds, ratePerMile, commodity, shipper, receiver, hazmat, booked], i) => {
    // Road distance is roughly 1.25x the straight line.
    const distanceM = distanceMeters(CITIES[from], CITIES[to]) * 1.25;
    const distanceKm = Math.round(distanceM / 1000);
    return {
      id: `${board}-${String(i + 1).padStart(4, "0")}`,
      board,
      region: "US",
      origin: { city: from, point: CITIES[from] },
      destination: { city: to, point: CITIES[to] },
      pickupDate: isoDay(inDays),
      // About 500 miles of driving a day.
      deliveryDate: isoDay(inDays + Math.max(1, Math.ceil(distanceM / MILE_M / 500))),
      equipment,
      weightKg: Math.round(pounds * POUND_KG),
      distanceKm,
      rate: { amount: Math.round(((distanceM / MILE_M) * ratePerMile) / 10) * 10, currency: "USD" },
      commodity,
      hazmat: !!hazmat,
      shipper: contact(shipper, i, "s"),
      receiver: contact(receiver, i, "r"),
      bookedByUs: !!booked,
    };
  });
}

/** In-memory US freight exchange with realistic sample loads, for demos and tests. */
export class MockLoadBoard extends LoadBoardProvider {
  private readonly loads: ExternalLoad[];

  readonly region = "US" as const;

  constructor(readonly name: string) {
    super();
    this.loads = buildLoads(name, US_LOADS);
  }

  async search() {
    return this.loads;
  }

  async get(id: string) {
    return this.loads.find((load) => load.id === id);
  }

  async bookedLoads() {
    return this.loads.filter((load) => load.bookedByUs);
  }
}

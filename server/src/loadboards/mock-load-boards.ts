import { distanceM as distanceMeters } from "../telematics/geo";
import { ExternalLoad, LoadBoardProvider, LoadContact, LoadStop } from "./loadboard.types";

// Each company's dock, as a real street address with its coordinates. Checked with TomTom truck
// routing (US-201's size): every load's route is permitted for a 53' rig, except Mile High Foods,
// which is on purpose: a downtown Denver store whose last half mile is closed to trucks.
const SITES: Record<string, Omit<LoadStop, "city">> = {
  "Lone Star Distribution": { address: "10501 Harry Hines Blvd, Dallas, TX 75220", point: [-96.88232, 32.86764] },
  "Lakeshore Retail": { address: "12600 S Torrence Ave, Chicago, IL 60633", point: [-87.55895, 41.66612] },
  "Gulf Coast Lubes": { address: "8800 Market Street Rd, Houston, TX 77029", point: [-95.26741, 29.76984] },
  "Peachtree Industrial": { address: "1400 Marietta Blvd NW, Atlanta, GA 30318", point: [-84.43614, 33.80182] },
  "Windy City Foods": { address: "13000 S Torrence Ave, Chicago, IL 60633", point: [-87.55936, 41.65913] },
  "Buckeye Grocers": { address: "4300 Alum Creek Dr, Columbus, OH 43207", point: [-82.93084, 39.88051] },
  "Hoosier Packaging": { address: "5600 W Raymond St, Indianapolis, IN 46241", point: [-86.25494, 39.7358] },
  "Queen City Supply": { address: "3700 Westinghouse Blvd, Charlotte, NC 28273", point: [-80.96814, 35.13296] },
  "Georgia Growers": { address: "5000 Kennedy Rd, Forest Park, GA 30297", point: [-84.39128, 33.61841] },
  "First Coast Markets": { address: "1700 Talleyrand Ave, Jacksonville, FL 32206", point: [-81.62819, 30.34385] },
  "Bluff City Logistics": { address: "3600 E Shelby Dr, Memphis, TN 38118", point: [-89.94609, 35.02082] },
  "Metroplex Stores": { address: "4001 Irving Blvd, Dallas, TX 75247", point: [-96.88395, 32.80824] },
  "Music City Steel": { address: "1500 Elm Hill Pike, Nashville, TN 37210", point: [-86.71971, 36.14405] },
  "Motor City Fabrication": { address: "9600 Dearborn St, Detroit, MI 48209", point: [-83.13266, 42.29344] },
  "Pacific Furnishings": { address: "1800 E 15th St, Los Angeles, CA 90021", point: [-118.23926, 34.02348] },
  "Valley Home Center": { address: "5300 W Lower Buckeye Rd, Phoenix, AZ 85043", point: [-112.17461, 33.42242] },
  "Sonoran Dairy": { address: "2400 S 43rd Ave, Phoenix, AZ 85043", point: [-112.15195, 33.4265] },
  "Mile High Foods": { address: "1600 Champa St, Denver, CO 80202", point: [-104.99384, 39.74653] },
  "Rocky Mountain Lumber": { address: "5400 Washington St, Denver, CO 80216", point: [-104.97817, 39.7957] },
  "Heartland Builders": { address: "2100 Manchester Trafficway, Kansas City, MO 64126", point: [-94.4927, 39.08453] },
  "Prairie Pet Co.": { address: "3100 Guinotte Ave, Kansas City, MO 64120", point: [-94.54228, 39.12036] },
  "Midwest Pet Supply": { address: "3900 S Ashland Ave, Chicago, IL 60609", point: [-87.66554, 41.82309] },
  "Ohio Auto Supply": { address: "3600 Lockbourne Rd, Columbus, OH 43207", point: [-82.96805, 39.88791] },
  "Southern Assembly": { address: "3500 Southside Industrial Pkwy SE, Atlanta, GA 30354", point: [-84.37138, 33.65928] },
  "Carolina Mills": { address: "4900 N Graham St, Charlotte, NC 28269", point: [-80.80548, 35.28086] },
  "Delta Apparel": { address: "3000 Directors Row, Memphis, TN 38131", point: [-89.99327, 35.0653] },
  "Great Lakes Machining": { address: "6500 E McNichols Rd, Detroit, MI 48212", point: [-83.03551, 42.41918] },
  "Crossroads Manufacturing": { address: "2900 N Shadeland Ave, Indianapolis, IN 46219", point: [-86.04574, 39.80672] },
  "Border Gateway Logistics": { address: "10500 Mines Rd, Laredo, TX 78045", point: [-99.51264, 27.5929] },
  "Gateway Arch Distribution": { address: "6700 Hall St, St. Louis, MO 63147", point: [-90.21898, 38.69955] },
  "Coastal Empire Transload": { address: "100 Crossroads Pkwy, Savannah, GA 31407", point: [-81.21436, 32.1564] },
  "Piedmont Retail DC": { address: "7200 Statesville Rd, Charlotte, NC 28269", point: [-80.84167, 35.31976] },
  "Platte Valley Meats": { address: "5000 S 33rd St, Omaha, NE 68107", point: [-95.96317, 41.20845] },
  "North Star Grocers": { address: "3000 Broadway St NE, Minneapolis, MN 55413", point: [-93.22164, 44.99869] },
  "Derby City Supply": { address: "4300 Produce Rd, Louisville, KY 40218", point: [-85.67945, 38.18611] },
  "Cumberland Assembly": { address: "1100 Antioch Pike, Nashville, TN 37211", point: [-86.70674, 36.09719] },
  "Red Dirt Chemicals": { address: "1700 SE 25th St, Oklahoma City, OK 73129", point: [-97.4813, 35.43905] },
  "Ship Channel Refining": { address: "1300 Federal Rd, Houston, TX 77015", point: [-95.21337, 29.76719] },
  "Wasatch Timber": { address: "4900 W 2100 S, Salt Lake City, UT 84120", point: [-112.00693, 40.72617] },
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
    const origin = { city: from, ...SITES[shipper] };
    const destination = { city: to, ...SITES[receiver] };
    // Road distance is roughly 1.25x the straight line.
    const distanceM = distanceMeters(origin.point, destination.point) * 1.25;
    const distanceKm = Math.round(distanceM / 1000);
    return {
      id: `${board}-${String(i + 1).padStart(4, "0")}`,
      board,
      region: "US",
      origin,
      destination,
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

import { distanceM } from "../telematics/geo";
import { ExternalLoad, LoadBoardProvider, LoadContact, LoadStop } from "./loadboard.types";

const CITIES: Record<string, LoadStop["point"]> = {
  // EU
  "Hamburg, Germany": [9.9937, 53.5511],
  "Munich, Germany": [11.582, 48.1351],
  "Berlin, Germany": [13.405, 52.52],
  "Cologne, Germany": [6.9603, 50.9375],
  "Rotterdam, Netherlands": [4.4777, 51.9244],
  "Antwerp, Belgium": [4.4025, 51.2194],
  "Lyon, France": [4.8357, 45.764],
  "Paris, France": [2.3522, 48.8566],
  "Milan, Italy": [9.19, 45.4642],
  "Verona, Italy": [10.9916, 45.4384],
  "Vienna, Austria": [16.3738, 48.2082],
  "Prague, Czechia": [14.4378, 50.0755],
  "Warsaw, Poland": [21.0122, 52.2297],
  "Poznań, Poland": [16.9252, 52.4064],
  "Budapest, Hungary": [19.0402, 47.4979],
  "Sofia, Bulgaria": [23.3219, 42.6977],
  "Plovdiv, Bulgaria": [24.7453, 42.1354],
  "Bucharest, Romania": [26.1025, 44.4268],
  "Barcelona, Spain": [2.1734, 41.3851],
  // US
  "Dallas, TX": [-96.797, 32.7767],
  "Houston, TX": [-95.3698, 29.7604],
  "Chicago, IL": [-87.6298, 41.8781],
  "Indianapolis, IN": [-86.1581, 39.7684],
  "Atlanta, GA": [-84.388, 33.749],
  "Charlotte, NC": [-80.8431, 35.2271],
  "Columbus, OH": [-82.9988, 39.9612],
  "Detroit, MI": [-83.0458, 42.3314],
  "Memphis, TN": [-90.049, 35.1495],
  "Nashville, TN": [-86.7816, 36.1627],
  "Los Angeles, CA": [-118.2437, 34.0522],
  "Phoenix, AZ": [-112.074, 33.4484],
  "Denver, CO": [-104.9903, 39.7392],
  "Kansas City, MO": [-94.5786, 39.0997],
  "Jacksonville, FL": [-81.6557, 30.3322],
};

// [origin, destination, pickup in N days, equipment, kg, rate per km, commodity, shipper, receiver, hazmat, booked]
type Row = [string, string, number, ExternalLoad["equipment"], number, number, string, string, string, boolean?, boolean?];

const EU_LOADS: Row[] = [
  ["Hamburg, Germany", "Munich, Germany", 1, "Curtainsider", 22000, 1.65, "Paper rolls", "Nordpapier GmbH", "Süd Druckhaus"],
  ["Rotterdam, Netherlands", "Prague, Czechia", 1, "Reefer", 18500, 1.95, "Fresh fruit", "Port Fresh BV", "Fresh Market CZ"],
  ["Antwerp, Belgium", "Vienna, Austria", 2, "Tanker", 24000, 2.1, "Food-grade oil", "Antwerp Oils NV", "Wiener Mühle", true],
  ["Milan, Italy", "Lyon, France", 1, "Dry van", 12000, 1.8, "Furniture", "Casa Milano", "Maison Rhône"],
  ["Verona, Italy", "Berlin, Germany", 2, "Reefer", 20000, 1.9, "Cheese and dairy", "Latteria Veronese", "Berliner Frische"],
  ["Warsaw, Poland", "Cologne, Germany", 1, "Curtainsider", 23000, 1.55, "Building materials", "BudMat Sp. z o.o.", "Rhein Bau AG", false, true],
  ["Poznań, Poland", "Paris, France", 3, "Dry van", 15000, 1.6, "Household appliances", "AGD Poznań", "Électro Paris"],
  ["Budapest, Hungary", "Munich, Germany", 2, "Curtainsider", 19000, 1.7, "Auto parts", "Pannon Autóalkatrész", "Bayern Motors Supply"],
  ["Sofia, Bulgaria", "Bucharest, Romania", 1, "Dry van", 9000, 1.75, "Textiles", "Sofia Textile", "Moda București"],
  ["Plovdiv, Bulgaria", "Vienna, Austria", 2, "Reefer", 17000, 1.85, "Frozen vegetables", "Thrace Frozen Foods", "Alpen Tiefkühl", false, true],
  ["Barcelona, Spain", "Milan, Italy", 3, "Flatbed", 21000, 1.7, "Steel coils", "Acero Catalunya", "Siderurgica Lombarda"],
  ["Lyon, France", "Antwerp, Belgium", 2, "Tanker", 25000, 2.2, "Industrial solvents", "Rhône Chimie", "Antwerp Chemicals", true],
  ["Prague, Czechia", "Hamburg, Germany", 1, "Curtainsider", 16000, 1.6, "Glassware", "Bohemia Glass", "Hanse Import"],
  ["Berlin, Germany", "Warsaw, Poland", 2, "Dry van", 11000, 1.5, "E-commerce parcels", "Spree Fulfilment", "Wisła Logistics"],
];

const US_LOADS: Row[] = [
  ["Dallas, TX", "Chicago, IL", 1, "Dry van", 18000, 1.45, "Consumer electronics", "Lone Star Distribution", "Lakeshore Retail"],
  ["Houston, TX", "Atlanta, GA", 2, "Tanker", 20000, 1.85, "Lubricants", "Gulf Coast Lubes", "Peachtree Industrial", true],
  ["Chicago, IL", "Columbus, OH", 1, "Reefer", 17000, 1.6, "Frozen poultry", "Windy City Foods", "Buckeye Grocers"],
  ["Indianapolis, IN", "Charlotte, NC", 2, "Dry van", 14000, 1.4, "Packaged goods", "Hoosier Packaging", "Queen City Supply", false, true],
  ["Atlanta, GA", "Jacksonville, FL", 1, "Reefer", 19000, 1.7, "Fresh produce", "Georgia Growers", "First Coast Markets"],
  ["Memphis, TN", "Dallas, TX", 2, "Dry van", 16000, 1.35, "Retail freight", "Bluff City Logistics", "Metroplex Stores"],
  ["Nashville, TN", "Detroit, MI", 3, "Flatbed", 21000, 1.75, "Steel beams", "Music City Steel", "Motor City Fabrication"],
  ["Los Angeles, CA", "Phoenix, AZ", 1, "Dry van", 12000, 1.6, "Furniture", "Pacific Furnishings", "Valley Home Center"],
  ["Phoenix, AZ", "Denver, CO", 2, "Reefer", 18000, 1.65, "Dairy", "Sonoran Dairy", "Mile High Foods", false, true],
  ["Denver, CO", "Kansas City, MO", 2, "Flatbed", 22000, 1.55, "Lumber", "Rocky Mountain Lumber", "Heartland Builders"],
  ["Kansas City, MO", "Chicago, IL", 1, "Dry van", 15000, 1.4, "Pet food", "Prairie Pet Co.", "Midwest Pet Supply"],
  ["Columbus, OH", "Atlanta, GA", 3, "Dry van", 13000, 1.45, "Auto parts", "Ohio Auto Supply", "Southern Assembly"],
  ["Charlotte, NC", "Memphis, TN", 2, "Curtainsider", 17500, 1.5, "Textiles", "Carolina Mills", "Delta Apparel"],
  ["Detroit, MI", "Indianapolis, IN", 1, "Flatbed", 19500, 1.6, "Machinery", "Great Lakes Machining", "Crossroads Manufacturing"],
];

const contact = (company: string, region: "EU" | "US", index: number, role: "s" | "r"): LoadContact => {
  const domain = company.toLowerCase().replace(/[^a-z0-9]+/g, "") + ".demo";
  return {
    name: company,
    contact: region === "EU" ? ["Anna Weber", "Marek Nowak", "Lucia Rossi", "Jan Novák"][index % 4] : ["Mike Turner", "Sara Ortiz", "Dan Brooks", "Kim Lee"][index % 4],
    phone: region === "EU" ? `+49 30 555 ${1000 + index * 7 + (role === "r" ? 3 : 0)}` : `+1 312 555 ${1000 + index * 7 + (role === "r" ? 3 : 0)}`,
    email: `${role === "s" ? "dispatch" : "receiving"}@${domain}`,
  };
};

const isoDay = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

function buildLoads(board: string, region: "EU" | "US", rows: Row[]): ExternalLoad[] {
  return rows.map(([from, to, inDays, equipment, weightKg, ratePerKm, commodity, shipper, receiver, hazmat, booked], i) => {
    // Road distance is roughly 1.25x the straight line.
    const distanceKm = Math.round((distanceM(CITIES[from], CITIES[to]) / 1000) * 1.25);
    return {
      id: `${board}-${String(i + 1).padStart(4, "0")}`,
      board,
      region,
      origin: { city: from, point: CITIES[from] },
      destination: { city: to, point: CITIES[to] },
      pickupDate: isoDay(inDays),
      deliveryDate: isoDay(inDays + Math.max(1, Math.ceil(distanceKm / 700))),
      equipment,
      weightKg,
      distanceKm,
      rate: { amount: Math.round(distanceKm * ratePerKm / 10) * 10, currency: region === "EU" ? "EUR" : "USD" },
      commodity,
      hazmat: !!hazmat,
      shipper: contact(shipper, region, i, "s"),
      receiver: contact(receiver, region, i, "r"),
      bookedByUs: !!booked,
    };
  });
}

/** In-memory freight exchange with realistic sample loads, for demos and tests. */
export class MockLoadBoard extends LoadBoardProvider {
  private readonly loads: ExternalLoad[];

  constructor(
    readonly name: string,
    readonly region: "EU" | "US",
  ) {
    super();
    this.loads = buildLoads(name, region, region === "EU" ? EU_LOADS : US_LOADS);
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

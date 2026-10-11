import "dotenv/config";
import * as argon2 from "argon2";
import { and, eq, gt, isNull } from "drizzle-orm";
import { createDb, Database } from "./client";
import { ensureOwner } from "./create-admin";
import { CHECKLISTS } from "../vehicles/checklists";
import { REPORT_TYPES, ReportType } from "../community/report-types";
import {
  cargos,
  chatMessages,
  drivers,
  maintenanceItems,
  positions,
  roadReports,
  trailers,
  trucks,
  users,
  vehicleDocuments,
  vehicleLog,
} from "./schema";

// Idempotent demo data: re-running skips rows whose unique keys already exist.
const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? "demo12345";
const DEMO_DRIVER_EMAIL = "j.carter@demo.logistic";

// Weights and sizes are stored metric; the demo values are round US figures.
const lb = (pounds: number) => String(Math.round(pounds * 0.45359237 * 10) / 10);

const demoTrucks = [
  { truckNumber: "US-201", truckModel: "Freightliner Cascadia", engineVariation: "Diesel", plate: "TX 8KD-221", heightM: 4.11, widthM: 2.6, lengthM: 21.9, weightT: 36.3, axles: 5 },
  { truckNumber: "US-202", truckModel: "Peterbilt 579", engineVariation: "Diesel", plate: "IL P79-332", heightM: 4.11, widthM: 2.6, lengthM: 21.9, weightT: 36.3, axles: 5 },
  { truckNumber: "US-203", truckModel: "Kenworth T680", engineVariation: "Diesel", plate: "CA 7TK-680", heightM: 4.0, widthM: 2.6, lengthM: 21.9, weightT: 36.3, axles: 5 },
  { truckNumber: "US-204", truckModel: "International LT", engineVariation: "Diesel", plate: "OH LT-4410", heightM: 3.5, widthM: 2.6, lengthM: 10.5, weightT: 15, axles: 2 },
  { truckNumber: "US-205", truckModel: "Volvo VNL 860", engineVariation: "Diesel", plate: "GA VNL-860", heightM: 4.11, widthM: 2.6, lengthM: 21.9, weightT: 36.3, axles: 5 },
  { truckNumber: "US-206", truckModel: "Mack Anthem", engineVariation: "Diesel", plate: "TX AN-2066", heightM: 4.11, widthM: 2.6, lengthM: 21.9, weightT: 36.3, axles: 5 },
  { truckNumber: "US-207", truckModel: "Freightliner Cascadia", engineVariation: "Diesel", plate: "TN 4CF-207", heightM: 4.11, widthM: 2.6, lengthM: 21.9, weightT: 36.3, axles: 5 },
  { truckNumber: "US-208", truckModel: "Kenworth W990", engineVariation: "Diesel", plate: "AZ W99-208", heightM: 4.11, widthM: 2.6, lengthM: 22.5, weightT: 36.3, axles: 5 },
  { truckNumber: "US-209", truckModel: "Peterbilt 389", engineVariation: "Diesel", plate: "MO P38-209", heightM: 4.11, widthM: 2.6, lengthM: 22.5, weightT: 36.3, axles: 5 },
  // Box truck: routes through city centres without the weight warnings the 80,000 lb rigs get.
  { truckNumber: "US-210", truckModel: "Isuzu NPR-HD box truck", engineVariation: "Diesel", plate: "TX NPR-210", heightM: 3.4, widthM: 2.4, lengthM: 7.6, weightT: 6.6, axles: 2 },
];

const demoTrailers = [
  { trailerNumber: "UT-01", trailer: "Utility 4000D-X 53' dry van" },
  { trailerNumber: "UT-02", trailer: "Great Dane Champion 53' reefer" },
  { trailerNumber: "UT-03", trailer: "Fontaine Infinity flatbed" },
  { trailerNumber: "UT-04", trailer: "Wabash DuraPlate 53' dry van" },
  { trailerNumber: "UT-05", trailer: "Hyundai Translead 53' reefer" },
  { trailerNumber: "UT-06", trailer: "Fontaine Velocity step deck" },
];

const demoDrivers = [
  { firstName: "James", lastName: "Carter", truckDriverEmail: "j.carter@demo.logistic", phoneNumber: "+1 214 555 0101", truckNumber: "US-201" },
  { firstName: "Maria", lastName: "Gonzalez", truckDriverEmail: "m.gonzalez@demo.logistic", phoneNumber: "+1 312 555 0144", truckNumber: "US-202" },
  { firstName: "Darnell", lastName: "Washington", truckDriverEmail: "d.washington@demo.logistic", phoneNumber: "+1 323 555 0123", truckNumber: "US-203" },
  { firstName: "Emily", lastName: "Novak", truckDriverEmail: "e.novak@demo.logistic", phoneNumber: "+1 614 555 0156", truckNumber: "US-204" },
  { firstName: "Tyler", lastName: "Brooks", truckDriverEmail: "t.brooks@demo.logistic", phoneNumber: "+1 404 555 0188", truckNumber: "US-205" },
  { firstName: "Ray", lastName: "Hernandez", truckDriverEmail: "r.hernandez@demo.logistic", phoneNumber: "+1 713 555 0199", truckNumber: "US-206" },
  { firstName: "Sean", lastName: "Murphy", truckDriverEmail: "s.murphy@demo.logistic", phoneNumber: "+1 615 555 0147", truckNumber: "US-207" },
  { firstName: "Linda", lastName: "Park", truckDriverEmail: "l.park@demo.logistic", phoneNumber: "+1 602 555 0110", truckNumber: "US-208" },
];

// Where each demo truck is parked before the simulator moves it.
const DEPOTS: Record<string, { x: number; y: number }> = {
  "US-201": { x: -96.797, y: 32.7767 }, // Dallas
  "US-202": { x: -87.6298, y: 41.8781 }, // Chicago
  "US-203": { x: -118.2437, y: 34.0522 }, // Los Angeles
  "US-204": { x: -82.9988, y: 39.9612 }, // Columbus
  "US-205": { x: -84.388, y: 33.749 }, // Atlanta
  "US-206": { x: -95.3698, y: 29.7604 }, // Houston
  "US-207": { x: -86.7816, y: 36.1627 }, // Nashville
  "US-208": { x: -112.074, y: 33.4484 }, // Phoenix
  "US-209": { x: -94.5786, y: 39.0997 }, // Kansas City
  "US-210": { x: -96.82, y: 32.79 }, // Dallas
};

// Trips already under way when the demo starts. The demo driver (US-201) is left free, so the
// dispatcher can assign Dallas → Chicago live.
const DEMO_TRIPS = [
  { shipperName: "Peach State Foods", truckNumber: "US-205", driverEmail: "t.brooks@demo.logistic" },
  { shipperName: "Pacific Furniture", truckNumber: "US-203", driverEmail: "d.washington@demo.logistic" },
];

// Fixed coordinates so the demo needs no geocoding calls.
const CITY_POINTS: Record<string, { x: number; y: number }> = {
  "Dallas, TX, USA": { x: -96.797, y: 32.7767 },
  "Chicago, IL, USA": { x: -87.6298, y: 41.8781 },
  "Atlanta, GA, USA": { x: -84.388, y: 33.749 },
  "Orlando, FL, USA": { x: -81.3792, y: 28.5383 },
  "Los Angeles, CA, USA": { x: -118.2437, y: 34.0522 },
  "Phoenix, AZ, USA": { x: -112.074, y: 33.4484 },
  "Columbus, OH, USA": { x: -82.9988, y: 39.9612 },
  "Detroit, MI, USA": { x: -83.0458, y: 42.3314 },
  "Houston, TX, USA": { x: -95.3698, y: 29.7604 },
  "Memphis, TN, USA": { x: -90.049, y: 35.1495 },
  "Denver, CO, USA": { x: -104.9903, y: 39.7392 },
  "Kansas City, MO, USA": { x: -94.5786, y: 39.0997 },
  "Nashville, TN, USA": { x: -86.7816, y: 36.1627 },
  "Charlotte, NC, USA": { x: -80.8431, y: 35.2271 },
};

// Every field the cargo form marks as required is filled, so seeded loads can be edited in the demo.
const demoCargo = [
  { shipperName: "Lone Star Plastics", pickupLocation: "Dallas, TX, USA", contactPerson: "Mike Turner", phoneNumber: "+1 214 555 0170", emailAddress: "dispatch@lonestarplastics.demo", receiverName: "Midwest Packaging", deliveryLocation: "Chicago, IL, USA", receiverContact: "Sarah Kowalski", receiverPhone: "+1 312 555 0190", receiverEmail: "receiving@midwestpack.demo", descriptionOfGoods: "Plastic resin, 20 totes", quantity: "20", weight: lb(40000), dimensions: "48x40x48 in", truckType: "Box", freightCost: "2650" },
  { shipperName: "Peach State Foods", pickupLocation: "Atlanta, GA, USA", contactPerson: "Denise Howard", phoneNumber: "+1 404 555 0133", emailAddress: "shipping@peachstatefoods.demo", receiverName: "Publix DC", deliveryLocation: "Orlando, FL, USA", receiverContact: "Carlos Rivera", receiverPhone: "+1 407 555 0122", receiverEmail: "dc-inbound@publix.demo", descriptionOfGoods: "Frozen goods, 26 pallets", quantity: "26", weight: lb(43000), dimensions: "48x40x64 in", truckType: "Refrigerated", freightCost: "1350", temperatureControl: "0 °F" },
  { shipperName: "Pacific Furniture", pickupLocation: "Los Angeles, CA, USA", contactPerson: "Kevin Nguyen", phoneNumber: "+1 213 555 0111", emailAddress: "orders@pacificfurniture.demo", receiverName: "Desert Home", deliveryLocation: "Phoenix, AZ, USA", receiverContact: "Laura Mitchell", receiverPhone: "+1 602 555 0155", receiverEmail: "warehouse@deserthome.demo", descriptionOfGoods: "Flat-pack furniture", quantity: "40", weight: lb(25000), dimensions: "80x40x24 in", truckType: "Box", freightCost: "1240" },
  { shipperName: "Ohio Auto Parts", pickupLocation: "Columbus, OH, USA", contactPerson: "Brian Foster", phoneNumber: "+1 614 555 0166", emailAddress: "logistics@ohioautoparts.demo", receiverName: "Detroit Assembly", deliveryLocation: "Detroit, MI, USA", receiverContact: "Angela Price", receiverPhone: "+1 313 555 0177", receiverEmail: "jit-receiving@detroitassembly.demo", descriptionOfGoods: "Brake assemblies", quantity: "30", weight: lb(31000), dimensions: "48x40x40 in", truckType: "Box", freightCost: "980", hazardousMaterial: "No" },
  { shipperName: "Gulf Coast Pipe & Steel", pickupLocation: "Houston, TX, USA", contactPerson: "Luis Ramirez", phoneNumber: "+1 713 555 0181", emailAddress: "shipping@gulfcoastpipe.demo", receiverName: "Delta Builders Supply", deliveryLocation: "Memphis, TN, USA", receiverContact: "Grace Thompson", receiverPhone: "+1 901 555 0164", receiverEmail: "yard@deltabuilders.demo", descriptionOfGoods: "Steel pipe", quantity: "16 bundles", weight: lb(44000), dimensions: "480x12x12 in", truckType: "Flatbed", freightCost: "1890", specialHandlingInstructions: "Strap every bundle, tarp required" },
  { shipperName: "Front Range Brewing", pickupLocation: "Denver, CO, USA", contactPerson: "Jake Sullivan", phoneNumber: "+1 303 555 0129", emailAddress: "logistics@frontrangebrewing.demo", receiverName: "Heartland Beverage", deliveryLocation: "Kansas City, MO, USA", receiverContact: "Olivia Grant", receiverPhone: "+1 816 555 0142", receiverEmail: "receiving@heartlandbev.demo", descriptionOfGoods: "Canned beverages, 22 pallets", quantity: "22", weight: lb(42000), dimensions: "48x40x52 in", truckType: "Box", freightCost: "1560" },
  { shipperName: "Music City Paper", pickupLocation: "Nashville, TN, USA", contactPerson: "Holly Bennett", phoneNumber: "+1 615 555 0175", emailAddress: "orders@musiccitypaper.demo", receiverName: "Queen City Office Supply", deliveryLocation: "Charlotte, NC, USA", receiverContact: "Marcus Hill", receiverPhone: "+1 704 555 0138", receiverEmail: "dock@queencityoffice.demo", descriptionOfGoods: "Paper products, 24 pallets", quantity: "24", weight: lb(30000), dimensions: "48x40x60 in", truckType: "Box", freightCost: "1180" },
  { shipperName: "Sonoran Produce", pickupLocation: "Phoenix, AZ, USA", contactPerson: "Rosa Delgado", phoneNumber: "+1 602 555 0168", emailAddress: "dispatch@sonoranproduce.demo", receiverName: "Metroplex Grocers DC", deliveryLocation: "Dallas, TX, USA", receiverContact: "Brandon Lee", receiverPhone: "+1 214 555 0119", receiverEmail: "dc@metroplexgrocers.demo", descriptionOfGoods: "Fresh produce, 24 pallets", quantity: "24", weight: lb(38000), dimensions: "48x40x60 in", truckType: "Refrigerated", freightCost: "2980", temperatureControl: "34 to 38 °F" },
];

const isoDay = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

// Demo records with a few deliberate problems, so the warnings have something to show.
const EXPIRED_INSURANCE = "US-203";
const INSPECTION_DUE_SOON = "US-204";
const OIL_CHANGE_OVERDUE = "US-206";
const BRAKES_OVERDUE = "US-202";

/** Documents, maintenance checks and a few logbook entries for vehicles that have none. */
async function seedVehicleRecords(db: Database) {
  const withRecords = new Set(
    (await db.select({ truckId: maintenanceItems.truckId, trailerId: maintenanceItems.trailerId }).from(maintenanceItems)).flatMap(
      (row) => [row.truckId, row.trailerId],
    ),
  );

  const truckRows = await db.select().from(trucks).orderBy(trucks.truckNumber);
  for (const [i, truck] of truckRows.entries()) {
    if (withRecords.has(truck.id)) continue;
    const odometerKm = truck.odometerKm ?? 180_000 + i * 37_000;
    await db.update(trucks).set({ odometerKm }).where(eq(trucks.id, truck.id));

    await db.insert(vehicleDocuments).values([
      { truckId: truck.id, type: "registration", title: "Registration certificate", number: truck.plate ?? "", issuedOn: isoDay(-900 - i * 30) },
      {
        truckId: truck.id,
        type: "insurance",
        title: "Commercial auto liability",
        number: `POL-${2026_00 + i}`,
        expiresOn: truck.truckNumber === EXPIRED_INSURANCE ? isoDay(-5) : isoDay(120 + i * 20),
      },
      {
        truckId: truck.id,
        type: "technical_inspection",
        title: "DOT annual inspection",
        expiresOn: truck.truckNumber === INSPECTION_DUE_SOON ? isoDay(10) : isoDay(200 - i * 9),
      },
      { truckId: truck.id, type: "permit", title: "IRP cab card", expiresOn: isoDay(240 - i * 11) },
    ]);

    const checklist = CHECKLISTS["us-truck"].items;
    await db.insert(maintenanceItems).values(
      checklist.map((item) => {
        let lastDoneOn = isoDay(-Math.round((item.intervalDays ?? 365) * 0.4) - i * 7);
        let lastDoneKm = item.intervalKm ? odometerKm - Math.round(item.intervalKm * 0.5) : null;
        if (truck.truckNumber === OIL_CHANGE_OVERDUE && item.type === "oil_change") lastDoneKm = odometerKm - item.intervalKm! - 1500;
        if (truck.truckNumber === BRAKES_OVERDUE && item.type === "brakes") lastDoneOn = isoDay(-(item.intervalDays! + 12));
        return { truckId: truck.id, ...item, lastDoneOn, lastDoneKm };
      }),
    );

    await db.insert(vehicleLog).values([
      { truckId: truck.id, entryDate: isoDay(-60 - i * 3), kind: "service", title: "Full service", odometerKm: odometerKm - 12_000, cost: 1450, currency: "USD", authorEmail: "dispatcher@demo.logistic" },
      { truckId: truck.id, entryDate: isoDay(-8), kind: "note", title: "Driver reports cabin heater is slow to warm up", odometerKm: odometerKm - 900, authorEmail: "dispatcher@demo.logistic" },
    ]);
  }

  const trailerRows = await db.select().from(trailers).orderBy(trailers.trailerNumber);
  for (const [i, trailer] of trailerRows.entries()) {
    if (withRecords.has(trailer.id)) continue;
    await db.insert(vehicleDocuments).values([
      { trailerId: trailer.id, type: "registration", title: "Registration certificate", issuedOn: isoDay(-700 - i * 40) },
      { trailerId: trailer.id, type: "technical_inspection", title: "Annual DOT inspection", expiresOn: isoDay(90 + i * 35) },
    ]);
    await db.insert(maintenanceItems).values(
      CHECKLISTS.trailer.items.map((item) => ({ trailerId: trailer.id, ...item, lastDoneOn: isoDay(-Math.round((item.intervalDays ?? 365) * 0.5)) })),
    );
  }
}

/** Idempotent demo data; also used by the demo reset. */
// Road reports along the demo routes, from drivers in the area. Reports expire, so they're
// added again whenever none are active (e.g. after a demo reset the next day).
const DEMO_REPORTS: { type: ReportType; driverEmail: string; point: { x: number; y: number }; note: string; minutesAgo: number }[] = [
  { type: "police", driverEmail: "j.carter@demo.logistic", point: { x: -96.806, y: 32.812 }, note: "Weigh station open on I-35E", minutesAgo: 35 },
  { type: "roadworks", driverEmail: "t.brooks@demo.logistic", point: { x: -83.65, y: 32.85 }, note: "I-75 south near Macon, right lane closed for about 2 miles", minutesAgo: 140 },
  { type: "traffic", driverEmail: "d.washington@demo.logistic", point: { x: -117.6, y: 34.07 }, note: "Stop-and-go on I-10 east past Ontario", minutesAgo: 12 },
  { type: "accident", driverEmail: "m.gonzalez@demo.logistic", point: { x: -88.1, y: 41.53 }, note: "I-55 northbound near Joliet, right lane blocked", minutesAgo: 18 },
  { type: "police", driverEmail: "l.park@demo.logistic", point: { x: -114.53, y: 33.6 }, note: "Ehrenberg port of entry scales open on I-10", minutesAgo: 40 },
  { type: "traffic", driverEmail: "e.novak@demo.logistic", point: { x: -82.99, y: 39.97 }, note: "Slow on I-71 through downtown Columbus", minutesAgo: 30 },
];

const DEMO_CHAT: { driverEmail: string; body: string; minutesAgo: number }[] = [
  { driverEmail: "m.gonzalez@demo.logistic", body: "Morning all. I-55 north is slow past Joliet, there's an accident in the right lane.", minutesAgo: 300 },
  { driverEmail: "d.washington@demo.logistic", body: "Thanks Maria. Does anyone know if the Pier T gate at Long Beach is open on Saturday?", minutesAgo: 270 },
  { driverEmail: "l.park@demo.logistic", body: "Pier T was open last Saturday until 2 pm.", minutesAgo: 262 },
  { driverEmail: "j.carter@demo.logistic", body: "Heads-up: the I-35E weigh station south of Dallas is open and checking logs.", minutesAgo: 95 },
  { driverEmail: "m.gonzalez@demo.logistic", body: "Anyone know a good truck parking spot near Chicago O'Hare?", minutesAgo: 60 },
  { driverEmail: "t.brooks@demo.logistic", body: "Try the Pilot on I-90 in Hampshire. It usually has space after 8 pm.", minutesAgo: 48 },
  { driverEmail: "r.hernandez@demo.logistic", body: "I-10 east of Houston is backed up about 3 miles at the San Jacinto bridge. Plan an extra hour.", minutesAgo: 38 },
];

// Past loads for the demo driver, so the driver app's history has something to show.
const DEMO_HISTORY = [
  { from: "Dallas, TX, USA", to: "Houston, TX, USA", goods: "Bottled water", weight: lb(44000), quantity: "22 pallets", shipper: "Lone Star Springs", receiver: "Bayou Grocers DC", daysAgo: 2, hours: 4, delay: 0 },
  { from: "Fort Worth, TX, USA", to: "Oklahoma City, OK, USA", goods: "Packaged dairy products", weight: lb(32000), quantity: "26 pallets", shipper: "Trinity Dairy", receiver: "Sooner Foods", daysAgo: 5, hours: 4, delay: 25 },
  { from: "Dallas, TX, USA", to: "San Antonio, TX, USA", goods: "Auto parts", weight: lb(21500), quantity: "18 pallets", shipper: "Metroplex Auto Supply", receiver: "Alamo Assembly", daysAgo: 8, hours: 5, delay: 0 },
  { from: "Houston, TX, USA", to: "Dallas, TX, USA", goods: "Steel profiles", weight: lb(45000), quantity: "12 bundles", shipper: "Ship Channel Metals", receiver: "North Texas Builders", daysAgo: 12, hours: 4, delay: 0 },
  { from: "Dallas, TX, USA", to: "Little Rock, AR, USA", goods: "Pharmaceutical products", weight: lb(13500), quantity: "14 pallets", shipper: "Southwest Pharma Distribution", receiver: "Natural State Health", daysAgo: 16, hours: 5, delay: 45 },
  { from: "Austin, TX, USA", to: "Dallas, TX, USA", goods: "Frozen foods", weight: lb(40000), quantity: "30 pallets", shipper: "Hill Country Foods", receiver: "Metroplex Grocers DC", daysAgo: 21, hours: 3, delay: 0 },
  { from: "Dallas, TX, USA", to: "Memphis, TN, USA", goods: "Household appliances", weight: lb(26000), quantity: "40 pallets", shipper: "Texas Home Distribution", receiver: "Bluff City Appliances", daysAgo: 27, hours: 7, delay: 900 },
  { from: "El Paso, TX, USA", to: "Dallas, TX, USA", goods: "Building materials", weight: lb(46000), quantity: "22 pallets", shipper: "Sun City Materials", receiver: "North Texas Builders", daysAgo: 34, hours: 10, delay: 0 },
];

async function seedDriverCommunity(db: Database) {
  const all = await db.select().from(drivers);
  const byEmail = new Map(all.map((driver) => [driver.truckDriverEmail, driver]));
  const truckIds = new Map((await db.select({ id: trucks.id, number: trucks.truckNumber }).from(trucks)).map((t) => [t.number, t.id]));
  const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000);

  const active = await db.$count(roadReports, gt(roadReports.expiresAt, new Date()));
  if (active === 0) {
    await db.insert(roadReports).values(
      DEMO_REPORTS.filter((report) => byEmail.has(report.driverEmail)).map((report) => {
        const driver = byEmail.get(report.driverEmail)!;
        return {
          type: report.type,
          point: report.point,
          note: report.note,
          driverId: driver.id,
          truckId: truckIds.get(driver.truckNumber) ?? null,
          createdAt: ago(report.minutesAgo),
          expiresAt: new Date(ago(report.minutesAgo).getTime() + REPORT_TYPES[report.type].ttlHours * 3_600_000 + 3_600_000),
        };
      }),
    );
  }

  if ((await db.$count(chatMessages)) === 0) {
    await db.insert(chatMessages).values(
      DEMO_CHAT.filter((message) => byEmail.has(message.driverEmail)).map((message) => ({
        driverId: byEmail.get(message.driverEmail)!.id,
        body: message.body,
        createdAt: ago(message.minutesAgo),
      })),
    );
  }

  const demoDriver = byEmail.get(DEMO_DRIVER_EMAIL);
  if (demoDriver && (await db.$count(cargos, and(eq(cargos.driverId, demoDriver.id), eq(cargos.status, "delivered")))) < 3) {
    const day = (date: Date) => date.toISOString().slice(0, 10);
    await db.insert(cargos).values(
      DEMO_HISTORY.map((load) => {
        const pickedUpAt = new Date(Date.now() - load.daysAgo * 86_400_000 - load.hours * 3_600_000);
        const deliveredAt = new Date(pickedUpAt.getTime() + load.hours * 3_600_000 + load.delay * 60_000);
        return {
          pickupLocation: load.from,
          deliveryLocation: load.to,
          shipperName: load.shipper,
          shipperAddress: load.from,
          receiverName: load.receiver,
          receiverAddress: load.to,
          descriptionOfGoods: load.goods,
          weight: load.weight,
          quantity: load.quantity,
          pickupDate: day(pickedUpAt),
          deliveryDate: day(new Date(pickedUpAt.getTime() + load.hours * 3_600_000)),
          pickedUpAt,
          deliveredAt,
          delayMinutes: load.delay || null,
          delayReason: load.delay ? (load.delay > 120 ? "Receiver closed, redelivered next morning" : "Heavy traffic") : null,
          driverId: demoDriver.id,
          truckId: truckIds.get(demoDriver.truckNumber) ?? null,
          status: "delivered" as const,
        };
      }),
    );
  }
}

export async function seed(db: Database) {
  const passwordHash = await argon2.hash(DEMO_PASSWORD);

  await db
    .insert(users)
    .values([
      { email: "admin@demo.logistic", passwordHash, role: "admin" },
      { email: "dispatcher@demo.logistic", passwordHash, role: "dispatcher" },
    ])
    .onConflictDoNothing();
  await ensureOwner(db);

  await db.insert(trucks).values(demoTrucks).onConflictDoNothing();
  await db.insert(trailers).values(demoTrailers).onConflictDoNothing();
  await db.insert(drivers).values(demoDrivers).onConflictDoNothing();

  // Driver-app login for one demo driver, linked every run so a demo reset keeps it working.
  await db.insert(users).values({ email: DEMO_DRIVER_EMAIL, passwordHash, role: "driver" }).onConflictDoNothing();
  const driverUser = await db.query.users.findFirst({ where: eq(users.email, DEMO_DRIVER_EMAIL) });
  await db.update(drivers).set({ userId: driverUser!.id }).where(eq(drivers.truckDriverEmail, DEMO_DRIVER_EMAIL));

  // Only manual cargo counts: load-board imports may already exist on a fresh install.
  const existingCargo = await db.$count(cargos, eq(cargos.source, "manual"));
  if (existingCargo === 0) {
    const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
    await db.insert(cargos).values(
      demoCargo.map((cargo, i) => ({
        ...cargo,
        shipperAddress: cargo.pickupLocation,
        pickupPoint: CITY_POINTS[cargo.pickupLocation],
        deliveryPoint: CITY_POINTS[cargo.deliveryLocation],
        receiverAddress: cargo.deliveryLocation,
        serviceType: "Door-to-Door",
        paymentTerms: i % 3 ? "Prepaid" : "Collect",
        pickupDate: day(1 + (i % 3)),
        deliveryDate: day(2 + (i % 3)),
        status: i % 2 ? ("confirmed" as const) : ("new" as const),
      })),
    );

    // Two trips already under way, so the live map moves as soon as the demo starts.
    for (const trip of DEMO_TRIPS) {
      const truck = await db.query.trucks.findFirst({ where: eq(trucks.truckNumber, trip.truckNumber) });
      const driver = await db.query.drivers.findFirst({ where: eq(drivers.truckDriverEmail, trip.driverEmail) });
      await db
        .update(cargos)
        .set({ truckId: truck!.id, driverId: driver!.id, status: "confirmed" })
        .where(eq(cargos.shipperName, trip.shipperName));
      await db.update(trucks).set({ status: "taken" }).where(eq(trucks.id, truck!.id));
      await db.update(drivers).set({ status: "taken" }).where(eq(drivers.id, driver!.id));
    }
  }

  // A first position for trucks that have never reported one.
  const located = new Set((await db.selectDistinct({ truckId: positions.truckId }).from(positions)).map((r) => r.truckId));
  const parked = (await db.select({ id: trucks.id, truckNumber: trucks.truckNumber }).from(trucks)).filter(
    (truck) => DEPOTS[truck.truckNumber] && !located.has(truck.id),
  );
  if (parked.length) {
    await db.insert(positions).values(
      parked.map((truck) => ({
        truckId: truck.id,
        point: DEPOTS[truck.truckNumber],
        speedKmh: 0,
        recordedAt: new Date(),
        source: "seed",
      })),
    );
  }

  await seedVehicleRecords(db);
  await seedDriverCommunity(db);

  // Backfill points for demo cargo seeded before coordinates were added.
  for (const [location, point] of Object.entries(CITY_POINTS)) {
    await db.update(cargos).set({ pickupPoint: point }).where(and(eq(cargos.pickupLocation, location), isNull(cargos.pickupPoint)));
    await db.update(cargos).set({ deliveryPoint: point }).where(and(eq(cargos.deliveryLocation, location), isNull(cargos.deliveryPoint)));
  }

  console.log(
    `Seeded demo data. Log in as admin@demo.logistic, dispatcher@demo.logistic or (driver app) ${DEMO_DRIVER_EMAIL} / ${DEMO_PASSWORD}`,
  );
}

// Run directly (npm run db:seed), not when imported by the demo reset.
if (require.main === module) {
  const { db, pool } = createDb(process.env.DATABASE_URL!);
  seed(db)
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

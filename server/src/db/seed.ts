import "dotenv/config";
import * as argon2 from "argon2";
import { and, eq, isNull } from "drizzle-orm";
import { createDb } from "./client";
import { cargos, drivers, positions, trailers, trucks, users } from "./schema";

// Idempotent demo data: re-running skips rows whose unique keys already exist.
const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? "demo12345";

const demoTrucks = [
  { truckNumber: "TR-101", truckModel: "Volvo FH16", engineVariation: "Diesel", plate: "CA 1234 AB", heightM: 4.0, widthM: 2.55, lengthM: 16.5, weightT: 40, axles: 5 },
  { truckNumber: "TR-102", truckModel: "Scania R500", engineVariation: "Diesel", plate: "CA 5678 AB", heightM: 4.0, widthM: 2.55, lengthM: 16.5, weightT: 40, axles: 5 },
  { truckNumber: "TR-103", truckModel: "Mercedes Actros", engineVariation: "Diesel", plate: "B-LG 2031", heightM: 3.9, widthM: 2.55, lengthM: 16.5, weightT: 38, axles: 5 },
  { truckNumber: "TR-104", truckModel: "DAF XG+", engineVariation: "Diesel", plate: "NL-12-XG", heightM: 4.0, widthM: 2.55, lengthM: 16.5, weightT: 40, axles: 5 },
  { truckNumber: "TR-105", truckModel: "MAN TGX", engineVariation: "Diesel", plate: "M-LG 774", heightM: 3.8, widthM: 2.5, lengthM: 12, weightT: 26, axles: 3 },
  { truckNumber: "US-201", truckModel: "Freightliner Cascadia", engineVariation: "Diesel", plate: "TX 8KD-221", heightM: 4.11, widthM: 2.6, lengthM: 21.9, weightT: 36.3, axles: 5 },
  { truckNumber: "US-202", truckModel: "Peterbilt 579", engineVariation: "Diesel", plate: "IL P79-332", heightM: 4.11, widthM: 2.6, lengthM: 21.9, weightT: 36.3, axles: 5 },
  { truckNumber: "US-203", truckModel: "Kenworth T680", engineVariation: "Diesel", plate: "CA 7TK-680", heightM: 4.0, widthM: 2.6, lengthM: 21.9, weightT: 36.3, axles: 5 },
  { truckNumber: "US-204", truckModel: "International LT", engineVariation: "Diesel", plate: "OH LT-4410", heightM: 3.5, widthM: 2.6, lengthM: 10.5, weightT: 15, axles: 2 },
  { truckNumber: "US-205", truckModel: "Volvo VNL 860", engineVariation: "Diesel", plate: "GA VNL-860", heightM: 4.11, widthM: 2.6, lengthM: 21.9, weightT: 36.3, axles: 5 },
];

const demoTrailers = [
  { trailerNumber: "TL-01", trailer: "Krone Mega Liner (curtain)" },
  { trailerNumber: "TL-02", trailer: "Schmitz Cargobull S.KO (reefer)" },
  { trailerNumber: "TL-03", trailer: "Kögel Port 45 (container)" },
  { trailerNumber: "UT-01", trailer: "Utility 4000D-X 53' dry van" },
  { trailerNumber: "UT-02", trailer: "Great Dane Champion 53' reefer" },
  { trailerNumber: "UT-03", trailer: "Fontaine Infinity flatbed" },
];

const demoDrivers = [
  { firstName: "Georgi", lastName: "Petrov", truckDriverEmail: "g.petrov@demo.logistic", phoneNumber: "+359 888 123 456", truckNumber: "TR-101" },
  { firstName: "Anna", lastName: "Müller", truckDriverEmail: "a.mueller@demo.logistic", phoneNumber: "+49 151 2345 6789", truckNumber: "TR-103" },
  { firstName: "Jan", lastName: "de Vries", truckDriverEmail: "j.devries@demo.logistic", phoneNumber: "+31 6 1234 5678", truckNumber: "TR-104" },
  { firstName: "Marco", lastName: "Rossi", truckDriverEmail: "m.rossi@demo.logistic", phoneNumber: "+39 347 123 4567", truckNumber: "TR-105" },
  { firstName: "James", lastName: "Carter", truckDriverEmail: "j.carter@demo.logistic", phoneNumber: "+1 214 555 0101", truckNumber: "US-201" },
  { firstName: "Maria", lastName: "Gonzalez", truckDriverEmail: "m.gonzalez@demo.logistic", phoneNumber: "+1 312 555 0144", truckNumber: "US-202" },
  { firstName: "Tyler", lastName: "Brooks", truckDriverEmail: "t.brooks@demo.logistic", phoneNumber: "+1 404 555 0188", truckNumber: "US-205" },
];

// Where each demo truck is parked before the simulator moves it.
const DEPOTS: Record<string, { x: number; y: number }> = {
  "TR-101": { x: 23.3219, y: 42.6977 }, // Sofia
  "TR-102": { x: 24.7453, y: 42.1354 }, // Plovdiv
  "TR-103": { x: 11.582, y: 48.1351 }, // Munich
  "TR-104": { x: 4.4777, y: 51.9244 }, // Rotterdam
  "TR-105": { x: 9.19, y: 45.4642 }, // Milan
  "US-201": { x: -96.797, y: 32.7767 }, // Dallas
  "US-202": { x: -87.6298, y: 41.8781 }, // Chicago
  "US-203": { x: -118.2437, y: 34.0522 }, // Los Angeles
  "US-204": { x: -82.9988, y: 39.9612 }, // Columbus
  "US-205": { x: -84.388, y: 33.749 }, // Atlanta
};

// Fixed coordinates so the demo needs no geocoding calls.
const CITY_POINTS: Record<string, { x: number; y: number }> = {
  "Sofia, Bulgaria": { x: 23.3219, y: 42.6977 },
  "Munich, Germany": { x: 11.582, y: 48.1351 },
  "Rotterdam, Netherlands": { x: 4.4777, y: 51.9244 },
  "Lyon, France": { x: 4.8357, y: 45.764 },
  "Milan, Italy": { x: 9.19, y: 45.4642 },
  "Erfurt, Germany": { x: 11.0299, y: 50.9848 },
  "Gdańsk, Poland": { x: 18.6466, y: 54.352 },
  "Vienna, Austria": { x: 16.3738, y: 48.2082 },
  "Dallas, TX, USA": { x: -96.797, y: 32.7767 },
  "Chicago, IL, USA": { x: -87.6298, y: 41.8781 },
  "Atlanta, GA, USA": { x: -84.388, y: 33.749 },
  "Orlando, FL, USA": { x: -81.3792, y: 28.5383 },
  "Los Angeles, CA, USA": { x: -118.2437, y: 34.0522 },
  "Phoenix, AZ, USA": { x: -112.074, y: 33.4484 },
  "Columbus, OH, USA": { x: -82.9988, y: 39.9612 },
  "Detroit, MI, USA": { x: -83.0458, y: 42.3314 },
};

// Every field the cargo form marks as required is filled, so seeded loads can be edited in the demo.
const demoCargo = [
  { shipperName: "Sofia Tech Park", pickupLocation: "Sofia, Bulgaria", contactPerson: "Ivan Dimitrov", phoneNumber: "+359 2 400 1000", emailAddress: "shipping@sofiatech.demo", receiverName: "Rhenus Logistics", deliveryLocation: "Munich, Germany", receiverContact: "Lena Bauer", receiverPhone: "+49 89 1234 500", receiverEmail: "inbound@rhenus.demo", descriptionOfGoods: "Electronics, 24 pallets", quantity: "24", weight: "9800", dimensions: "120x80x150", truckType: "Box", freightCost: "2450" },
  { shipperName: "Rotterdam Fresh BV", pickupLocation: "Rotterdam, Netherlands", contactPerson: "Pieter Jansen", phoneNumber: "+31 10 200 3000", emailAddress: "export@rotterdamfresh.demo", receiverName: "Carrefour DC", deliveryLocation: "Lyon, France", receiverContact: "Claire Martin", receiverPhone: "+33 4 72 00 00 00", receiverEmail: "reception@carrefour-dc.demo", descriptionOfGoods: "Chilled produce, 33 pallets", quantity: "33", weight: "21000", dimensions: "120x80x180", truckType: "Refrigerated", freightCost: "1980", temperatureControl: "+2 to +6 °C" },
  { shipperName: "Milano Moda", pickupLocation: "Milan, Italy", contactPerson: "Giulia Bianchi", phoneNumber: "+39 02 555 0100", emailAddress: "logistica@milanomoda.demo", receiverName: "Zalando Hub", deliveryLocation: "Erfurt, Germany", receiverContact: "Tobias Weber", receiverPhone: "+49 361 555 0200", receiverEmail: "hub-erfurt@zalando.demo", descriptionOfGoods: "Garments on hangers", quantity: "18", weight: "6400", dimensions: "120x100x220", truckType: "Box", freightCost: "1720" },
  { shipperName: "Gdańsk Steel", pickupLocation: "Gdańsk, Poland", contactPerson: "Piotr Nowak", phoneNumber: "+48 58 300 4000", emailAddress: "wysylka@gdanskstal.demo", receiverName: "Bau Center", deliveryLocation: "Vienna, Austria", receiverContact: "Stefan Huber", receiverPhone: "+43 1 400 5000", receiverEmail: "lager@baucenter.demo", descriptionOfGoods: "Steel beams", quantity: "12", weight: "24000", dimensions: "1200x30x30", truckType: "Flatbed", freightCost: "2100", specialHandlingInstructions: "Secure with chains, max 4 per stack" },
  { shipperName: "Lone Star Plastics", pickupLocation: "Dallas, TX, USA", contactPerson: "Mike Turner", phoneNumber: "+1 214 555 0170", emailAddress: "dispatch@lonestarplastics.demo", receiverName: "Midwest Packaging", deliveryLocation: "Chicago, IL, USA", receiverContact: "Sarah Kowalski", receiverPhone: "+1 312 555 0190", receiverEmail: "receiving@midwestpack.demo", descriptionOfGoods: "Plastic resin, 20 totes", quantity: "20", weight: "18100", dimensions: "120x100x120", truckType: "Box", freightCost: "2650" },
  { shipperName: "Peach State Foods", pickupLocation: "Atlanta, GA, USA", contactPerson: "Denise Howard", phoneNumber: "+1 404 555 0133", emailAddress: "shipping@peachstatefoods.demo", receiverName: "Publix DC", deliveryLocation: "Orlando, FL, USA", receiverContact: "Carlos Rivera", receiverPhone: "+1 407 555 0122", receiverEmail: "dc-inbound@publix.demo", descriptionOfGoods: "Frozen goods, 26 pallets", quantity: "26", weight: "19500", dimensions: "120x100x160", truckType: "Refrigerated", freightCost: "1350", temperatureControl: "-18 °C" },
  { shipperName: "Pacific Furniture", pickupLocation: "Los Angeles, CA, USA", contactPerson: "Kevin Nguyen", phoneNumber: "+1 213 555 0111", emailAddress: "orders@pacificfurniture.demo", receiverName: "Desert Home", deliveryLocation: "Phoenix, AZ, USA", receiverContact: "Laura Mitchell", receiverPhone: "+1 602 555 0155", receiverEmail: "warehouse@deserthome.demo", descriptionOfGoods: "Flat-pack furniture", quantity: "40", weight: "11300", dimensions: "200x100x60", truckType: "Box", freightCost: "1240" },
  { shipperName: "Ohio Auto Parts", pickupLocation: "Columbus, OH, USA", contactPerson: "Brian Foster", phoneNumber: "+1 614 555 0166", emailAddress: "logistics@ohioautoparts.demo", receiverName: "Detroit Assembly", deliveryLocation: "Detroit, MI, USA", receiverContact: "Angela Price", receiverPhone: "+1 313 555 0177", receiverEmail: "jit-receiving@detroitassembly.demo", descriptionOfGoods: "Brake assemblies", quantity: "30", weight: "14200", dimensions: "120x80x100", truckType: "Box", freightCost: "980", hazardousMaterial: "No" },
];

async function main() {
  const { db, pool } = createDb(process.env.DATABASE_URL!);
  const passwordHash = await argon2.hash(DEMO_PASSWORD);

  await db
    .insert(users)
    .values([
      { email: "admin@demo.logistic", passwordHash, role: "admin" },
      { email: "dispatcher@demo.logistic", passwordHash, role: "dispatcher" },
    ])
    .onConflictDoNothing();
  await db.insert(trucks).values(demoTrucks).onConflictDoNothing();
  await db.insert(trailers).values(demoTrailers).onConflictDoNothing();
  await db.insert(drivers).values(demoDrivers).onConflictDoNothing();

  const existingCargo = await db.$count(cargos);
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
        status: i % 2 ? "confirmed" : "new",
      })),
    );
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

  // Backfill points for demo cargo seeded before coordinates were added.
  for (const [location, point] of Object.entries(CITY_POINTS)) {
    await db.update(cargos).set({ pickupPoint: point }).where(and(eq(cargos.pickupLocation, location), isNull(cargos.pickupPoint)));
    await db.update(cargos).set({ deliveryPoint: point }).where(and(eq(cargos.deliveryLocation, location), isNull(cargos.deliveryPoint)));
  }

  await pool.end();
  console.log(`Seeded demo data. Log in as admin@demo.logistic or dispatcher@demo.logistic / ${DEMO_PASSWORD}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

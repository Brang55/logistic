import { sql } from "drizzle-orm";
import { parseEWKB } from "drizzle-orm/pg-core/columns/postgis_extension/utils";
import {
  bigserial,
  check,
  customType,
  date,
  doublePrecision,
  index,
  integer,
  uniqueIndex,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// WGS84 point. Drizzle's built-in geometry column drops the SRID, which would store
// SRID 0 and break distance functions, so this writes EWKT with SRID 4326 explicitly.
const point4326 = customType<{ data: { x: number; y: number }; driverData: string }>({
  dataType: () => "geometry(Point,4326)",
  toDriver: ({ x, y }) => `SRID=4326;POINT(${x} ${y})`,
  fromDriver: (hex) => {
    const [x, y] = parseEWKB(hex);
    return { x, y };
  },
});

export const userRole = pgEnum("user_role", ["admin", "dispatcher", "driver"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull().default("dispatcher"),
  ...timestamps,
});

// One row per issued refresh token, so tokens can be rotated and revoked.
export const refreshTokens = pgTable("refresh_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamps.createdAt,
});

export const trucks = pgTable("trucks", {
  id: uuid("id").primaryKey().defaultRandom(),
  truckNumber: text("truck_number").notNull().unique(),
  truckModel: text("truck_model").notNull().default(""),
  engineVariation: text("engine_variation").notNull().default(""),
  status: text("status").notNull().default("available"),
  plate: text("plate"),
  vin: text("vin"),
  // Metric, as the routing engines expect; the web app shows them in imperial units.
  heightM: doublePrecision("height_m"),
  widthM: doublePrecision("width_m"),
  lengthM: doublePrecision("length_m"),
  weightT: doublePrecision("weight_t"),
  axles: integer("axles"),
  odometerKm: integer("odometer_km"),
  // The vehicle's id in the telematics provider (Samsara, Geotab, ...); falls back to truck number.
  telematicsId: text("telematics_id").unique(),
  ...timestamps,
});

// GPS fixes from telematics (or the simulator). Append-only.
export const positions = pgTable(
  "positions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    truckId: uuid("truck_id")
      .notNull()
      .references(() => trucks.id, { onDelete: "cascade" }),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    point: point4326("point").notNull(),
    speedKmh: doublePrecision("speed_kmh"),
    heading: doublePrecision("heading"),
    source: text("source").notNull().default("telematics"),
    createdAt: timestamps.createdAt,
  },
  (table) => [index("positions_truck_recorded_idx").on(table.truckId, table.recordedAt.desc())],
);

export const trailers = pgTable("trailers", {
  id: uuid("id").primaryKey().defaultRandom(),
  trailer: text("trailer").notNull().default(""),
  trailerNumber: text("trailer_number").notNull().unique(),
  status: text("status").notNull().default("available"),
  ...timestamps,
});

export const drivers = pgTable("drivers", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phoneNumber: text("phone_number").notNull().default(""),
  truckDriverEmail: text("truck_driver_email").notNull().unique(),
  truckNumber: text("truck_number").notNull().default(""),
  content: text("content").notNull().default(""),
  status: text("status").notNull().default("available"),
  ...timestamps,
});

const cargoText = (name: string) => text(name).notNull().default("");

export const cargos = pgTable("cargos", {
  id: uuid("id").primaryKey().defaultRandom(),
  status: text("status").notNull().default("new"),
  shipperName: cargoText("shipper_name"),
  shipperAddress: cargoText("shipper_address"),
  contactPerson: cargoText("contact_person"),
  phoneNumber: cargoText("phone_number"),
  emailAddress: cargoText("email_address"),
  receiverName: cargoText("receiver_name"),
  receiverAddress: cargoText("receiver_address"),
  receiverContact: cargoText("receiver_contact"),
  receiverPhone: cargoText("receiver_phone"),
  receiverEmail: cargoText("receiver_email"),
  descriptionOfGoods: cargoText("description_of_goods"),
  quantity: cargoText("quantity"),
  weight: cargoText("weight"),
  dimensions: cargoText("dimensions"),
  pickupDate: cargoText("pickup_date"),
  deliveryDate: cargoText("delivery_date"),
  pickupLocation: cargoText("pickup_location"),
  deliveryLocation: cargoText("delivery_location"),
  truckType: cargoText("truck_type"),
  serviceType: cargoText("service_type"),
  temperatureControl: cargoText("temperature_control"),
  hazardousMaterial: cargoText("hazardous_material"),
  specialHandlingInstructions: cargoText("special_handling_instructions"),
  freightCost: cargoText("freight_cost"),
  paymentTerms: cargoText("payment_terms"),
  notes: cargoText("notes"),
  // Geocoded pickup/delivery points, filled in once routing lands (Phase 2).
  pickupPoint: point4326("pickup_point"),
  deliveryPoint: point4326("delivery_point"),
  driverId: uuid("driver_id").references(() => drivers.id, { onDelete: "set null" }),
  truckId: uuid("truck_id").references(() => trucks.id, { onDelete: "set null" }),
  trailerId: uuid("trailer_id").references(() => trailers.id, { onDelete: "set null" }),
  pickedUpAt: timestamp("picked_up_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  // Latest delay reported by the driver (or dispatcher).
  delayMinutes: integer("delay_minutes"),
  delayReason: text("delay_reason"),
  delayReportedAt: timestamp("delay_reported_at", { withTimezone: true }),
  // A dispatcher assigned this truck although its route breaks height/weight limits.
  // The acceptance only covers that truck; another truck has to be accepted again.
  restrictionsAcceptedAt: timestamp("restrictions_accepted_at", { withTimezone: true }),
  restrictionsAcceptedBy: text("restrictions_accepted_by"),
  restrictionsAcceptedTruckId: uuid("restrictions_accepted_truck_id").references(() => trucks.id, { onDelete: "set null" }),
  // Where the load came from: "manual", or a load board's id; externalId is the board's load id.
  source: text("source").notNull().default("manual"),
  externalId: text("external_id"),
  ...timestamps,
}, (table) => [uniqueIndex("cargos_source_external_idx").on(table.source, table.externalId)]);

export type User = typeof users.$inferSelect;
export type UserRole = (typeof userRole.enumValues)[number];

// ---- Vehicle records: the "notepad" for each truck and trailer ----

// Each record belongs to exactly one truck or one trailer.
const vehicleRefs = {
  truckId: uuid("truck_id").references(() => trucks.id, { onDelete: "cascade" }),
  trailerId: uuid("trailer_id").references(() => trailers.id, { onDelete: "cascade" }),
};
const oneVehicle = (name: string, table: { truckId: unknown; trailerId: unknown }) =>
  check(name, sql`(${table.truckId} is null) <> (${table.trailerId} is null)`);

export const vehicleDocuments = pgTable(
  "vehicle_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...vehicleRefs,
    type: text("type").notNull(),
    title: text("title").notNull().default(""),
    number: text("number").notNull().default(""),
    issuedOn: date("issued_on", { mode: "string" }),
    expiresOn: date("expires_on", { mode: "string" }),
    notes: text("notes").notNull().default(""),
    // Uploaded scan: stored under a random key, never the uploaded file name.
    fileKey: text("file_key"),
    fileName: text("file_name"),
    fileMime: text("file_mime"),
    fileSize: integer("file_size"),
    ...timestamps,
  },
  (table) => [oneVehicle("vehicle_documents_one_vehicle", table)],
);

export const maintenanceItems = pgTable(
  "maintenance_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...vehicleRefs,
    type: text("type").notNull(),
    title: text("title").notNull(),
    intervalDays: integer("interval_days"),
    intervalKm: integer("interval_km"),
    lastDoneOn: date("last_done_on", { mode: "string" }),
    lastDoneKm: integer("last_done_km"),
    notes: text("notes").notNull().default(""),
    ...timestamps,
  },
  (table) => [oneVehicle("maintenance_items_one_vehicle", table)],
);

export const vehicleLog = pgTable(
  "vehicle_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...vehicleRefs,
    entryDate: date("entry_date", { mode: "string" }).notNull(),
    kind: text("kind").notNull().default("note"),
    title: text("title").notNull(),
    odometerKm: integer("odometer_km"),
    cost: doublePrecision("cost"),
    currency: text("currency"),
    notes: text("notes").notNull().default(""),
    maintenanceItemId: uuid("maintenance_item_id").references(() => maintenanceItems.id, { onDelete: "set null" }),
    authorEmail: text("author_email"),
    createdAt: timestamps.createdAt,
  },
  (table) => [oneVehicle("vehicle_log_one_vehicle", table)],
);

// Driver community: road reports (police, traffic, road works…) pinned where the reporting
// driver's truck was, and the drivers' group chat.
export const roadReports = pgTable(
  "road_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(),
    point: point4326("point").notNull(),
    note: text("note").notNull().default(""),
    driverId: uuid("driver_id")
      .notNull()
      .references(() => drivers.id, { onDelete: "cascade" }),
    truckId: uuid("truck_id").references(() => trucks.id, { onDelete: "set null" }),
    createdAt: timestamps.createdAt,
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("road_reports_expires_idx").on(table.expiresAt)],
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    driverId: uuid("driver_id")
      .notNull()
      .references(() => drivers.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamps.createdAt,
  },
  (table) => [index("chat_messages_created_idx").on(table.createdAt.desc())],
);

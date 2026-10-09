import { parseEWKB } from "drizzle-orm/pg-core/columns/postgis_extension/utils";
import {
  bigserial,
  customType,
  doublePrecision,
  index,
  integer,
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
  // Dimensions are passed to Mapbox Directions as max_height / max_width / max_weight.
  heightM: doublePrecision("height_m"),
  widthM: doublePrecision("width_m"),
  lengthM: doublePrecision("length_m"),
  weightT: doublePrecision("weight_t"),
  axles: integer("axles"),
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
  ...timestamps,
});

export type User = typeof users.$inferSelect;
export type UserRole = (typeof userRole.enumValues)[number];

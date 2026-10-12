import { BadRequestException, Injectable } from "@nestjs/common";
import { AuthUser } from "../../auth/auth-user";
import { CreateCargoDto, UpdateCargoDto } from "../../cargos/cargos.dto";
import { Cargo, CargosService } from "../../cargos/cargos.service";
import { TAKEN } from "../../common/assignable";
import { CARGO_STATUSES, CargoStatus, FINISHED_STATUSES } from "../../common/cargo-status";
import { DriversService } from "../../drivers/drivers.service";
import { TrailersService } from "../../trailers/trailers.service";
import { TrucksService } from "../../trucks/trucks.service";
import { AssistantTool, InputSchema, ToolInput, WriteTool } from "../assistant.types";
import {
  cargoWeightLb,
  lbToKg,
  matchesAll,
  optionalDay,
  optionalNumber,
  optionalRef,
  optionalText,
  orNull,
  requiredId,
  requiredText,
  shipmentRef,
} from "./format";
import { FleetDirectory } from "./fleet-directory";

const STAFF = ["admin", "dispatcher"] as const;
const MAX_RESULTS = 30;

// Cargo fields the assistant may set, with how each is described to Claude and to the user.
const CARGO_FIELDS = {
  pickupLocation: { label: "Pickup", schema: { type: "string", description: "Pickup address or city" } },
  deliveryLocation: { label: "Delivery", schema: { type: "string", description: "Delivery address or city" } },
  pickupDate: { label: "Pickup date", schema: { type: "string", description: "YYYY-MM-DD" } },
  deliveryDate: { label: "Delivery date", schema: { type: "string", description: "YYYY-MM-DD" } },
  weightLb: { label: "Weight", schema: { type: "number", description: "Total weight in pounds" } },
  descriptionOfGoods: { label: "Goods", schema: { type: "string" } },
  quantity: { label: "Quantity", schema: { type: "string", description: 'e.g. "24 pallets"' } },
  shipperName: { label: "Shipper", schema: { type: "string" } },
  receiverName: { label: "Receiver", schema: { type: "string" } },
  truckType: { label: "Equipment", schema: { type: "string", description: 'e.g. "Dry van", "Reefer", "Flatbed"' } },
  specialHandlingInstructions: { label: "Handling", schema: { type: "string" } },
  notes: { label: "Notes", schema: { type: "string" } },
} as const;
type CargoField = keyof typeof CARGO_FIELDS;
const FIELD_KEYS = Object.keys(CARGO_FIELDS) as CargoField[];

const cargoFieldProperties = Object.fromEntries(FIELD_KEYS.map((key) => [key, CARGO_FIELDS[key].schema]));

/** The cargo fields present in the input, checked and converted to what the API stores. */
const cargoChanges = (input: ToolInput): Partial<CreateCargoDto> => {
  const dto: Partial<CreateCargoDto> = {};
  for (const key of FIELD_KEYS) {
    if (key === "weightLb") {
      const lb = optionalNumber(input, key);
      // One decimal of kg, as the cargo form stores it, so 40,000 lb reads back as 40,000 lb.
      if (lb !== undefined) dto.weight = String(Math.round(lbToKg(lb) * 10) / 10);
    } else if (key === "pickupDate" || key === "deliveryDate") {
      const day = optionalDay(input, key);
      if (day !== undefined) dto[key] = day;
    } else {
      const text = optionalText(input, key);
      if (text !== undefined) dto[key] = text;
    }
  }
  return dto;
};

/** "Fri, Oct 16, 2026" for a stored YYYY-MM-DD day. */
const showDay = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

/** "a", "a and b", "a, b and c". */
const listOf = (items: string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

const showWeight = (weight: string) => {
  const lb = cargoWeightLb(weight);
  return typeof lb === "number" ? `${lb.toLocaleString("en-US")} lb` : weight;
};

/** "Weight: 40,000 lb" lines for the confirmation dialog; with `current`, only real changes, as "before → after". */
const describe = (dto: Partial<CreateCargoDto>, current?: Cargo) =>
  FIELD_KEYS.flatMap((key) => {
    const dtoKey = key === "weightLb" ? "weight" : key;
    const value = dto[dtoKey];
    const before = current?.[dtoKey];
    if (value === undefined || value === before) return [];
    const show = key === "weightLb" ? showWeight : key === "pickupDate" || key === "deliveryDate" ? showDay : (text: string) => text;
    const label = CARGO_FIELDS[key].label;
    return [before ? `${label}: ${show(before)} → ${show(value)}` : `${label}: ${show(value)}`];
  });

const route = (cargo: Pick<Cargo, "pickupLocation" | "deliveryLocation">) =>
  `${cargo.pickupLocation || "?"} → ${cargo.deliveryLocation || "?"}`;

const preview = (cargo: Cargo) => ({
  type: "navigate" as const,
  path: `/cargoList/${cargo.id}/preview`,
  label: shipmentRef(cargo.id),
});

/** The local calendar day of a timestamp, comparable with the YYYY-MM-DD planned dates. */
const dayOf = (date: Date | null) =>
  date
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
    : null;

// The day `find_cargo` filters and sorts on: planned pickup or delivery, or the actual delivery.
const DATE_FIELDS = {
  pickup: (c: Cargo) => orNull(c.pickupDate),
  delivery: (c: Cargo) => orNull(c.deliveryDate),
  delivered: (c: Cargo) => dayOf(c.deliveredAt),
};
type DateField = keyof typeof DATE_FIELDS;

const schema = (properties: Record<string, unknown>, required: string[] = []): InputSchema => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

/** Finding, creating, editing, assigning and confirming loads. */
@Injectable()
export class CargoTools {
  constructor(
    private readonly cargos: CargosService,
    private readonly trucks: TrucksService,
    private readonly drivers: DriversService,
    private readonly trailers: TrailersService,
    private readonly directory: FleetDirectory,
  ) {}

  tools(): AssistantTool[] {
    return [this.findCargo(), this.createCargo(), this.updateCargo(), this.assignCargo(), this.confirmCargo()];
  }

  private findCargo(): AssistantTool {
    return {
      name: "find_cargo",
      kind: "read",
      roles: [...STAFF],
      description:
        "Search loads (cargo). `text` matches the reference (SH-...), pickup and delivery places, shipper, receiver, " +
        "goods, and the assigned truck number, driver or trailer; every word must match. For questions about a period " +
        '("deliveries in October", "pickups this week") set `dateField` with `from`/`to`; `dateField: "delivered"` is when ' +
        "loads were actually delivered, pickup and delivery are the planned dates. `delayedOnly` keeps loads whose driver " +
        "reported a delay. Returns up to 30 loads (`truncated` when there are more): by date when a period is given, else newest first.",
      input_schema: schema({
        text: { type: "string" },
        status: {
          type: "string",
          enum: ["active", "any", ...CARGO_STATUSES],
          description: '"active" is everything not delivered or cancelled. Default: "any" with a period, else "active"',
        },
        dateField: { type: "string", enum: Object.keys(DATE_FIELDS) },
        from: { type: "string", description: "YYYY-MM-DD, inclusive" },
        to: { type: "string", description: "YYYY-MM-DD, inclusive" },
        delayedOnly: { type: "boolean" },
      }),
      run: async (input) => {
        const text = optionalText(input, "text");
        const from = optionalDay(input, "from");
        const to = optionalDay(input, "to");
        const dateField = optionalText(input, "dateField") as DateField | undefined;
        if (dateField && !DATE_FIELDS[dateField]) throw new BadRequestException("dateField must be pickup, delivery or delivered");
        if ((from || to) && !dateField) throw new BadRequestException("Set dateField to say which date from/to apply to");
        const dayOfLoad = dateField ? DATE_FIELDS[dateField] : undefined;
        const status = optionalText(input, "status") ?? (dateField ? "any" : "active");
        const delayedOnly = input.delayedOnly === true;

        const [all, names] = await Promise.all([this.cargos.findAll(), this.directory.load()]);
        const found = all.filter((c) => {
          const day = dayOfLoad?.(c);
          return (
            (status === "any" ||
              (status === "active" ? !FINISHED_STATUSES.includes(c.status) : c.status === (status as CargoStatus))) &&
            (!dayOfLoad || (!!day && (!from || day >= from) && (!to || day <= to))) &&
            (!delayedOnly || (c.delayMinutes ?? 0) > 0) &&
            matchesAll(
              text,
              shipmentRef(c.id),
              c.pickupLocation,
              c.deliveryLocation,
              c.shipperName,
              c.receiverName,
              c.descriptionOfGoods,
              names.truck(c.truckId),
              names.driver(c.driverId),
              names.trailer(c.trailerId),
            )
          );
        });
        // Chronological reads best for a period; findAll is already newest first otherwise.
        if (dayOfLoad) found.sort((a, b) => dayOfLoad(a)!.localeCompare(dayOfLoad(b)!));
        return {
          total: found.length,
          truncated: found.length > MAX_RESULTS,
          loads: found.slice(0, MAX_RESULTS).map((c) => ({
            id: c.id,
            ref: shipmentRef(c.id),
            status: c.status,
            pickup: orNull(c.pickupLocation),
            delivery: orNull(c.deliveryLocation),
            pickupDate: orNull(c.pickupDate),
            deliveryDate: orNull(c.deliveryDate),
            goods: orNull(c.descriptionOfGoods),
            weightLb: cargoWeightLb(c.weight),
            equipment: orNull(c.truckType),
            shipper: orNull(c.shipperName),
            receiver: orNull(c.receiverName),
            truck: names.truck(c.truckId),
            driver: names.driver(c.driverId),
            trailer: names.trailer(c.trailerId),
            pickedUp: !!c.pickedUpAt,
            deliveredOn: dayOf(c.deliveredAt),
            delay: c.delayMinutes ? { minutes: c.delayMinutes, reason: c.delayReason } : null,
          })),
        };
      },
    };
  }

  private createCargo(): WriteTool {
    return {
      name: "create_cargo",
      kind: "write",
      roles: [...STAFF],
      description: "Propose a new load. The user confirms before it is created.",
      input_schema: schema(cargoFieldProperties, ["pickupLocation", "deliveryLocation"]),
      prepare: async (input) => {
        const pickupLocation = requiredText(input, "pickupLocation");
        const deliveryLocation = requiredText(input, "deliveryLocation");
        const dto = cargoChanges(input);
        return {
          title: "Create load",
          summary: `Create a load ${route({ pickupLocation, deliveryLocation })}`,
          details: describe(dto).filter((line) => !/^(Pickup|Delivery):/.test(line)),
          warnings: [],
        };
      },
      execute: async (input) => {
        const cargo = await this.cargos.create(cargoChanges(input) as CreateCargoDto);
        return { message: `Created ${shipmentRef(cargo.id)}: ${route(cargo)}.`, link: preview(cargo) };
      },
    };
  }

  private updateCargo(): WriteTool {
    return {
      name: "update_cargo",
      kind: "write",
      roles: [...STAFF],
      description: "Propose changes to a load's details. Only send the fields that change. The user confirms first.",
      input_schema: schema({ cargoId: { type: "string" }, ...cargoFieldProperties }, ["cargoId"]),
      prepare: async (input) => {
        const cargo = await this.cargos.findOne(requiredId(input, "cargoId"));
        const dto = cargoChanges(input);
        const details = describe(dto, cargo);
        if (!details.length) throw new BadRequestException("Nothing to change");
        return {
          title: "Edit load",
          summary: `Update ${shipmentRef(cargo.id)} (${route(cargo)})`,
          details,
          warnings:
            cargo.status === "confirmed" ? ["The load goes back to Edited and has to be confirmed again."] : [],
        };
      },
      execute: async (input) => {
        const cargo = await this.cargos.update(requiredId(input, "cargoId"), cargoChanges(input) as UpdateCargoDto);
        return { message: `Updated ${shipmentRef(cargo.id)}.`, link: preview(cargo) };
      },
    };
  }

  private assignCargo(): WriteTool {
    // How each resource is named to the user, and whether another load already holds it.
    const resources = [
      {
        key: "truckId",
        noun: "truck",
        // Names the driver the truck brings, so the user sees who will drive the load.
        lookup: async (id: string) => {
          const truck = await this.trucks.findOne(id);
          const driver = truck.driverId ? await this.drivers.findOne(truck.driverId) : null;
          const crew = driver ? ` (driven by ${driver.firstName} ${driver.lastName})` : " (no driver seated)";
          return { label: `truck ${truck.truckNumber}${crew}`, taken: truck.status === TAKEN };
        },
      },
      {
        key: "driverId",
        noun: "driver",
        lookup: async (id: string) => {
          const driver = await this.drivers.findOne(id);
          return { label: `${driver.firstName} ${driver.lastName}`, taken: driver.status === TAKEN };
        },
      },
      {
        key: "trailerId",
        noun: "trailer",
        lookup: async (id: string) => {
          const trailer = await this.trailers.findOne(id);
          return { label: `trailer ${trailer.trailerNumber}`, taken: trailer.status === TAKEN };
        },
      },
    ] as const;

    return {
      name: "assign_cargo",
      kind: "write",
      roles: [...STAFF],
      description:
        "Propose assigning a truck, driver and/or trailer to a load. Omit a field to keep it as is; null removes it. " +
        "A truck brings its own driver and hooked trailer, so usually only truckId is needed; set driverId only " +
        "for a different (relief) driver on this one load. Removing the truck removes the driver too. " +
        "Use ids from find_trucks, find_drivers and find_trailers. The user confirms first.",
      input_schema: schema(
        {
          cargoId: { type: "string" },
          truckId: { type: ["string", "null"] },
          driverId: { type: ["string", "null"] },
          trailerId: { type: ["string", "null"] },
        },
        ["cargoId"],
      ),
      prepare: async (input) => {
        const cargo = await this.cargos.findOne(requiredId(input, "cargoId"));
        if (FINISHED_STATUSES.includes(cargo.status)) {
          throw new BadRequestException(`${shipmentRef(cargo.id)} is ${cargo.status}; it can't be reassigned`);
        }
        const assigned: string[] = [];
        const removed: string[] = [];
        const warnings: string[] = [];
        for (const resource of resources) {
          const id = optionalRef(input, resource.key);
          if (id === undefined || id === cargo[resource.key]) continue;
          if (id === null) {
            removed.push(`the ${resource.noun}`);
            continue;
          }
          const { label, taken } = await resource.lookup(id);
          assigned.push(label);
          if (taken) warnings.push(`${label} is already on another load.`);
        }
        if (!assigned.length && !removed.length) throw new BadRequestException("Nothing to change");
        const parts = [
          ...(assigned.length ? [`Assign ${listOf(assigned)} to`] : []),
          ...(removed.length ? [`${assigned.length ? "and remove" : "Remove"} ${listOf(removed)} from`] : []),
        ];
        return {
          title: "Assign load",
          summary: `${parts.join(" ")} ${shipmentRef(cargo.id)} (${route(cargo)})`,
          details: [],
          warnings,
        };
      },
      execute: async (input, user: AuthUser, options) => {
        const id = requiredId(input, "cargoId");
        const dto = Object.fromEntries(
          resources.flatMap(({ key }) => {
            const ref = optionalRef(input, key);
            return ref === undefined ? [] : [[key, ref]];
          }),
        );
        const cargo = await this.cargos.assign(id, { ...dto, acceptRestrictions: options.acceptRestrictions }, user);
        return { message: `Assignment saved for ${shipmentRef(cargo.id)}.`, link: preview(cargo) };
      },
    };
  }

  private confirmCargo(): WriteTool {
    return {
      name: "confirm_cargo",
      kind: "write",
      roles: [...STAFF],
      description: "Propose confirming a planned load (status new or edited). The user confirms first.",
      input_schema: schema({ cargoId: { type: "string" } }, ["cargoId"]),
      prepare: async (input) => {
        const cargo = await this.cargos.findOne(requiredId(input, "cargoId"));
        if (cargo.status === "confirmed") throw new BadRequestException(`${shipmentRef(cargo.id)} is already confirmed`);
        if (!["new", "edited"].includes(cargo.status)) {
          throw new BadRequestException(`A ${cargo.status.replace("_", " ")} load can't be confirmed`);
        }
        return {
          title: "Confirm load",
          summary: `Confirm ${shipmentRef(cargo.id)} (${route(cargo)})`,
          details: [],
          warnings: cargo.truckId ? [] : ["No truck is assigned yet."],
        };
      },
      execute: async (input) => {
        const id = requiredId(input, "cargoId");
        await this.cargos.confirm(id);
        return { message: `${shipmentRef(id)} is confirmed.` };
      },
    };
  }
}

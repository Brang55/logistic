import { Injectable } from "@nestjs/common";
import { Cargo, CargosService } from "../../cargos/cargos.service";
import { RESOURCE_STATUSES } from "../../common/assignable";
import { FINISHED_STATUSES } from "../../common/cargo-status";
import { AlertsService } from "../../live/alerts.service";
import { TrafficService } from "../../trips/traffic.service";
import { VehicleRecordsService } from "../../vehicles/vehicle-records.service";
import { AssistantTool, InputSchema } from "../assistant.types";
import { FleetDirectory } from "./fleet-directory";
import { feet, matchesAll, miles, optionalNumber, optionalText, orNull, pounds, shipmentRef } from "./format";

const STAFF = ["admin", "dispatcher"] as const;
const MAX_RESULTS = 15;

const schema = (properties: Record<string, unknown>): InputSchema => ({
  type: "object",
  properties,
  additionalProperties: false,
});

const searchSchema = (matches: string) =>
  schema({
    text: { type: "string", description: `Matches ${matches}; every word must match` },
    status: { type: "string", enum: [...RESOURCE_STATUSES], description: '"taken" means on an unfinished load' },
  });

/** Which unfinished load holds each truck, driver and trailer. */
const currentLoads = (cargos: Cargo[]) => {
  const byResource = new Map<string, string>();
  for (const c of cargos) {
    if (FINISHED_STATUSES.includes(c.status)) continue;
    const label = `${shipmentRef(c.id)} (${c.pickupLocation} → ${c.deliveryLocation})`;
    for (const id of [c.truckId, c.driverId, c.trailerId]) if (id && !byResource.has(id)) byResource.set(id, label);
  }
  return (id: string) => byResource.get(id) ?? null;
};

/** Trucks, drivers and trailers, plus what the fleet is doing right now. */
@Injectable()
export class FleetTools {
  constructor(
    private readonly directory: FleetDirectory,
    private readonly cargos: CargosService,
    private readonly traffic: TrafficService,
    private readonly alerts: AlertsService,
    private readonly records: VehicleRecordsService,
  ) {}

  tools(): AssistantTool[] {
    return [
      {
        name: "find_trucks",
        kind: "read",
        roles: [...STAFF],
        description: "Search trucks with their driver, hooked trailer, status, size and current load. Assigning a truck brings its driver.",
        input_schema: searchSchema("truck number, model, plate or VIN"),
        run: async (input) => {
          const [fleet, cargos] = await Promise.all([this.directory.load(), this.cargos.findAll()]);
          const loadOf = currentLoads(cargos);
          const status = optionalText(input, "status");
          const found = fleet.trucks.filter(
            (t) => (!status || t.status === status) && matchesAll(optionalText(input, "text"), t.truckNumber, t.truckModel, t.plate, t.vin),
          );
          return {
            total: found.length,
            trucks: found.slice(0, MAX_RESULTS).map((t) => ({
              id: t.id,
              truckNumber: t.truckNumber,
              model: orNull(t.truckModel),
              status: t.status,
              plate: t.plate,
              driver: fleet.driver(t.driverId),
              trailer: fleet.trailer(t.trailerId),
              heightFt: t.heightM == null ? null : feet(t.heightM),
              weightLb: t.weightT == null ? null : pounds(t.weightT * 1000),
              currentLoad: loadOf(t.id),
            })),
          };
        },
      },
      {
        name: "find_drivers",
        kind: "read",
        roles: [...STAFF],
        description: "Search drivers with their status, phone and current load.",
        input_schema: searchSchema("first or last name, email, phone or the number of the truck they drive"),
        run: async (input) => {
          const [fleet, cargos] = await Promise.all([this.directory.load(), this.cargos.findAll()]);
          const loadOf = currentLoads(cargos);
          const status = optionalText(input, "status");
          const found = fleet.drivers.filter(
            (d) =>
              (!status || d.status === status) &&
              matchesAll(optionalText(input, "text"), d.firstName, d.lastName, d.truckDriverEmail, d.phoneNumber, d.truckNumber),
          );
          return {
            total: found.length,
            drivers: found.slice(0, MAX_RESULTS).map((d) => ({
              id: d.id,
              name: `${d.firstName} ${d.lastName}`,
              status: d.status,
              phone: orNull(d.phoneNumber),
              email: d.truckDriverEmail,
              truck: d.truckNumber,
              usesDriverApp: !!d.userId,
              currentLoad: loadOf(d.id),
            })),
          };
        },
      },
      {
        name: "find_trailers",
        kind: "read",
        roles: [...STAFF],
        description: "Search trailers with their status and current load.",
        input_schema: searchSchema("trailer number or type"),
        run: async (input) => {
          const [fleet, cargos] = await Promise.all([this.directory.load(), this.cargos.findAll()]);
          const loadOf = currentLoads(cargos);
          const status = optionalText(input, "status");
          const found = fleet.trailers.filter(
            (t) => (!status || t.status === status) && matchesAll(optionalText(input, "text"), t.trailerNumber, t.trailer),
          );
          return {
            total: found.length,
            trailers: found.slice(0, MAX_RESULTS).map((t) => ({
              id: t.id,
              trailerNumber: t.trailerNumber,
              type: orNull(t.trailer),
              status: t.status,
              currentLoad: loadOf(t.id),
            })),
          };
        },
      },
      {
        name: "fleet_status",
        kind: "read",
        roles: [...STAFF],
        description:
          "Trucks on the road right now: current load, next stop, miles and drive time left, ETA, traffic delay, " +
          "delays reported by drivers, incidents and truck restrictions on the route. Use for \"who's late\", \"where is truck 7\" and similar.",
        input_schema: schema({}),
        run: async () => {
          const { checkedAt, trips } = await this.traffic.report();
          return {
            checkedAt,
            trips: trips.map((t) => ({
              truck: t.truckNumber,
              truckId: t.truckId,
              load: `${shipmentRef(t.cargoId)} (${t.cargo})`,
              cargoId: t.cargoId,
              nextStop: `${t.nextStop.kind} in ${t.nextStop.name}`,
              milesLeft: t.remainingM == null ? null : miles(t.remainingM),
              driveMinutesLeft: t.remainingS == null ? null : Math.round(t.remainingS / 60),
              etaAt: t.etaAt,
              trafficDelayMinutes: Math.round(t.trafficDelayS / 60),
              reportedDelay: t.reportedDelay,
              incidents: t.incidents.filter((i) => !i.closed).map((i) => i.description),
              restrictionViolations: t.violations.map((v) => v.message),
              restrictionsAccepted: t.restrictionsAccepted,
            })),
          };
        },
      },
      {
        name: "recent_alerts",
        kind: "read",
        roles: [...STAFF],
        description: "Recent dispatcher alerts (delays, incidents, address changes, compliance), newest first.",
        input_schema: schema({ limit: { type: "integer", description: "Default 10, at most 50" } }),
        run: async (input) => {
          const limit = Math.min(optionalNumber(input, "limit") ?? 10, 50);
          return this.alerts
            .list()
            .slice(0, limit)
            .map((a) => ({ kind: a.kind, severity: a.severity, message: a.message, at: a.createdAt }));
        },
      },
      {
        name: "fleet_attention",
        kind: "read",
        roles: [...STAFF],
        description: "Truck and trailer documents that are expired or expiring, and maintenance that is overdue or due soon.",
        input_schema: schema({}),
        run: async () =>
          (await this.records.attention()).map((item) => ({
            vehicle: item.vehicleLabel,
            kind: item.kind,
            vehicleId: item.vehicleId,
            what: item.title,
            status: item.status,
            dueOn: item.dueOn,
            daysLeft: item.daysLeft,
            milesLeft: item.kmLeft == null ? null : miles(item.kmLeft * 1000),
          })),
      },
    ];
  }
}

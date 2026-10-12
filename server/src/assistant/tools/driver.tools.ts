import { BadRequestException, Injectable, UnprocessableEntityException } from "@nestjs/common";
import { AuthUser } from "../../auth/auth-user";
import { CargosService } from "../../cargos/cargos.service";
import { CommunityService } from "../../community/community.service";
import { REPORT_TYPE_KEYS, REPORT_TYPES, ReportType } from "../../community/report-types";
import { DriversService } from "../../drivers/drivers.service";
import { AlertsService } from "../../live/alerts.service";
import { distanceM } from "../../telematics/geo";
import { Trip, TripsService } from "../../trips/trips.service";
import { TrucksService } from "../../trucks/trucks.service";
import { LOG_KINDS } from "../../vehicles/vehicles.dto";
import { VehicleRecordsService } from "../../vehicles/vehicle-records.service";
import { AssistantTool, InputSchema, ToolInput, WriteTool } from "../assistant.types";
import { cargoWeightLb, miles, optionalNumber, optionalText, orNull, requiredId, requiredText, shipmentRef } from "./format";

const DRIVER = ["driver"] as const;
const MILE_KM = 1.609344;
// Further than this from the stop, confirming it gets a warning (as in the app's own dialog).
const FAR_FROM_STOP_M = 2000;

const CHECKS = {
  pickup: ["The goods are loaded and secured", "Quantity and weight match the papers", "The bill of lading is signed"],
  delivery: ["The goods are unloaded", "The receiver signed the proof of delivery", "Any damage or shortage is noted on the papers"],
};

const schema = (properties: Record<string, unknown>, required: string[] = []): InputSchema => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

const limited = (input: ToolInput, key: string, max: number) => {
  const text = requiredText(input, key);
  if (text.length > max) throw new BadRequestException(`${key} can be at most ${max} characters`);
  return text;
};

const nextStopOf = (trip: Trip) => `${trip.nextStop.kind} in ${trip.nextStop.name}`;

/** What a driver can ask or do hands-free: their trip, delays, stops, road reports, messages, logbook. */
@Injectable()
export class DriverTools {
  constructor(
    private readonly drivers: DriversService,
    private readonly trips: TripsService,
    private readonly cargos: CargosService,
    private readonly trucks: TrucksService,
    private readonly community: CommunityService,
    private readonly alerts: AlertsService,
    private readonly records: VehicleRecordsService,
  ) {}

  /** The driver's current load in a line, sent with every message so common commands need no lookup. */
  async contextLine(user: AuthUser) {
    const { trip } = await this.current(user);
    if (!trip) return "The driver has no load assigned.";
    const { cargo } = trip;
    return (
      `Current load ${shipmentRef(cargo.id)} on truck ${trip.truck.truckNumber}: pickup at ${cargo.pickupLocation} ` +
      `(${cargo.pickedUpAt ? "already picked up" : "not picked up yet"}), delivery at ${cargo.deliveryLocation}.`
    );
  }

  /** The current trip's next stop, distance and drive time, for "where to next?". */
  async nextStopReply(user: AuthUser) {
    const { trip } = await this.current(user);
    if (!trip) return "You have no load assigned right now.";
    const where = `${trip.nextStop.kind === "pickup" ? "Pickup" : "Delivery"} in ${trip.nextStop.name}`;
    const leg = await this.legToNextStop(trip);
    if (!leg) return `${where}.`;
    const minutes = Math.round(leg.durationS / 60);
    const time = minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
    return `${where}. ${miles(leg.distanceM)} miles, about ${time}.`;
  }

  tools(): AssistantTool[] {
    return [
      this.myTrip(),
      this.roadReports(),
      this.reportDelay(),
      this.confirmStop("pickup"),
      this.confirmStop("delivery"),
      this.changeStopAddress(),
      this.reportRoadIssue(),
      this.messageDispatch(),
      this.postToDriverChat(),
      this.addLogbookEntry(),
    ];
  }

  private async current(user: AuthUser) {
    const driver = await this.drivers.findByUserId(user.id);
    const [trip] = await this.trips.activeTrips({ driverId: driver.id });
    return { driver, trip: trip as Trip | undefined };
  }

  private async requireTrip(user: AuthUser) {
    const { trip } = await this.current(user);
    if (!trip) throw new BadRequestException("You have no load assigned right now.");
    return trip;
  }

  /** The trip a proposal was made for, if it is still the driver's current one. */
  private async sameTrip(user: AuthUser, input: ToolInput) {
    const trip = await this.requireTrip(user);
    if (trip.cargo.id !== requiredId(input, "cargoId")) throw new BadRequestException("That load is no longer your current load.");
    return trip;
  }

  private async legToNextStop(trip: Trip) {
    if (!trip.position) return undefined;
    const route = await this.trips.routeFor(trip).catch(() => null);
    return route?.legs[0];
  }

  private myTrip(): AssistantTool {
    return {
      name: "my_trip",
      kind: "read",
      roles: [...DRIVER],
      description:
        "The driver's current load: stops and dates, goods, truck and trailer, next stop with miles and drive time left, " +
        "any delay already reported, truck restrictions on the route, and loads queued after it.",
      input_schema: schema({}),
      run: async (_input, user) => {
        const { trip } = await this.current(user);
        if (!trip) return { load: null };
        const { cargo } = trip;
        const [leg, trailer, route] = await Promise.all([
          this.legToNextStop(trip),
          this.trips.trailerFor(cargo),
          this.trips.routeFor(trip).catch(() => null),
        ]);
        return {
          load: shipmentRef(cargo.id),
          truck: trip.truck.truckNumber,
          trailer: trailer?.trailerNumber ?? null,
          pickup: { place: cargo.pickupLocation, date: orNull(cargo.pickupDate), done: !!cargo.pickedUpAt },
          delivery: { place: cargo.deliveryLocation, date: orNull(cargo.deliveryDate) },
          goods: orNull(cargo.descriptionOfGoods),
          weightLb: cargoWeightLb(cargo.weight),
          shipper: orNull(cargo.shipperName),
          receiver: orNull(cargo.receiverName),
          handling: orNull(cargo.specialHandlingInstructions),
          nextStop: nextStopOf(trip),
          milesToNextStop: leg ? miles(leg.distanceM) : null,
          minutesToNextStop: leg ? Math.round(leg.durationS / 60) : null,
          reportedDelay: cargo.delayMinutes ? { minutes: cargo.delayMinutes, reason: orNull(cargo.delayReason) } : null,
          routeRestrictions: [...new Set((route?.notices ?? []).filter((n) => n.type === "violation").map((n) => n.message))],
          queuedLoads: trip.queue.map((c) => `${shipmentRef(c.id)}: ${c.pickupLocation} → ${c.deliveryLocation}`),
        };
      },
    };
  }

  private roadReports(): AssistantTool {
    return {
      name: "road_reports",
      kind: "read",
      roles: [...DRIVER],
      description: "Active road reports from other drivers (police, accidents, closures, ...), nearest to the truck first.",
      input_schema: schema({}),
      run: async (_input, user) => {
        const { position, reports } = await this.community.listReports(user);
        return reports
          .map((r) => ({
            what: r.label,
            note: orNull(r.note),
            milesAway: position ? miles(distanceM(position, r.point)) : null,
            reportedBy: r.reporter.truckNumber ? `truck ${r.reporter.truckNumber}` : r.reporter.name,
            minutesAgo: Math.round((Date.now() - r.createdAt.getTime()) / 60_000),
          }))
          .sort((a, b) => (a.milesAway ?? Infinity) - (b.milesAway ?? Infinity))
          .slice(0, 10);
      },
    };
  }

  private reportDelay(): WriteTool {
    return {
      name: "report_delay",
      kind: "write",
      roles: [...DRIVER],
      description:
        'Propose telling dispatch the driver will be late to their next stop ("half an hour" = 30, "an hour and a half" = 90). ' +
        "Ask for the minutes if none were said. The driver confirms first.",
      input_schema: schema({ minutes: { type: "integer" }, reason: { type: "string" } }, ["minutes"]),
      prepare: async (input, user) => {
        const trip = await this.requireTrip(user);
        const minutes = optionalNumber(input, "minutes");
        if (!minutes || !Number.isInteger(minutes) || minutes > 24 * 60) {
          throw new BadRequestException("minutes must be a whole number from 1 to 1440");
        }
        const reason = optionalText(input, "reason");
        return {
          title: "Report delay",
          summary: `Report a ${minutes} minute delay for the ${nextStopOf(trip)}`,
          details: reason ? [`Reason: ${reason}`] : [],
          warnings: [],
          input: { cargoId: trip.cargo.id, minutes, reason },
        };
      },
      execute: async (input, user) => {
        const trip = await this.sameTrip(user, input);
        const minutes = optionalNumber(input, "minutes")!;
        await this.cargos.reportDelay(trip.cargo.id, minutes, optionalText(input, "reason") ?? "");
        return { message: `Done. Dispatch knows you're ${minutes} minutes late.` };
      },
    };
  }

  private confirmStop(kind: "pickup" | "delivery"): WriteTool {
    const isPickup = kind === "pickup";
    return {
      name: isPickup ? "confirm_pickup" : "confirm_delivery",
      kind: "write",
      roles: [...DRIVER],
      description: isPickup
        ? "Propose confirming the current load has been picked up (loaded). The driver confirms first."
        : "Propose confirming the current load has been delivered (unloaded). The driver confirms first.",
      input_schema: schema({}),
      prepare: async (_input, user) => {
        const trip = await this.requireTrip(user);
        const { cargo } = trip;
        if (isPickup && cargo.pickedUpAt) throw new BadRequestException("This load is already picked up.");
        if (!isPickup && !cargo.pickedUpAt) throw new BadRequestException("Confirm the pickup first.");
        const place = isPickup ? cargo.pickupLocation : cargo.deliveryLocation;
        const point = isPickup ? cargo.pickupPoint : cargo.deliveryPoint;
        const away = trip.position && point ? distanceM(trip.position.point, [point.x, point.y]) : 0;
        return {
          title: isPickup ? "Confirm pickup" : "Confirm delivery",
          summary: `Confirm ${kind} in ${place}`,
          details: CHECKS[kind].map((check) => `✓ ${check}`),
          warnings:
            away > FAR_FROM_STOP_M
              ? [`Your truck is about ${miles(away)} miles from ${place}. Only confirm if you're really there.`]
              : [],
          input: { cargoId: cargo.id },
        };
      },
      execute: async (input, user) => {
        const trip = await this.sameTrip(user, input);
        if (isPickup) {
          await this.cargos.markPickedUp(trip.cargo.id);
          return { message: `Pickup confirmed. Next stop: delivery in ${trip.cargo.deliveryLocation}.` };
        }
        await this.cargos.markDelivered(trip.cargo.id);
        return { message: "Delivery confirmed. Good job." };
      },
    };
  }

  private changeStopAddress(): WriteTool {
    return {
      name: "change_stop_address",
      kind: "write",
      roles: [...DRIVER],
      description:
        "Propose changing the pickup or delivery address of the current load, e.g. when the shipper or receiver moved the dock. " +
        "Put the place exactly as said. Dispatch is alerted. The driver confirms first.",
      input_schema: schema(
        { stop: { type: "string", enum: ["pickup", "delivery"] }, address: { type: "string" } },
        ["stop", "address"],
      ),
      prepare: async (input, user) => {
        const trip = await this.requireTrip(user);
        const stop = requiredText(input, "stop");
        if (stop !== "pickup" && stop !== "delivery") throw new BadRequestException('stop must be "pickup" or "delivery"');
        if (stop === "pickup" && trip.cargo.pickedUpAt) throw new BadRequestException("This load is already picked up.");
        const address = limited(input, "address", 200);
        const current = stop === "pickup" ? trip.cargo.pickupLocation : trip.cargo.deliveryLocation;
        return {
          title: "Change address",
          summary: `Change the ${stop} address to ${address}`,
          details: [`Now: ${current}`],
          warnings: ["Dispatch is alerted about the change."],
          input: { cargoId: trip.cargo.id, stop, address },
        };
      },
      execute: async (input, user) => {
        const trip = await this.sameTrip(user, input);
        const stop = requiredText(input, "stop") as "pickup" | "delivery";
        const address = requiredText(input, "address");
        const field = stop === "pickup" ? "pickupLocation" : "deliveryLocation";
        const previous = trip.cargo[field];
        await this.cargos.update(trip.cargo.id, { [field]: address });
        const driver = await this.drivers.findByUserId(user.id);
        this.alerts.raise({
          kind: "address-changed",
          severity: "warning",
          message: `${driver.firstName} (${trip.truck.truckNumber}) changed the ${stop} address from "${previous}" to "${address}"`,
          cargoId: trip.cargo.id,
          truckId: trip.truck.id,
        });
        return { message: `Updated. New ${stop}: ${address}.` };
      },
    };
  }

  private reportRoadIssue(): WriteTool {
    return {
      name: "report_road_issue",
      kind: "write",
      roles: [...DRIVER],
      description:
        "Propose pinning a road report at the truck's current position for other drivers and dispatch " +
        "(police, accident, closure, roadworks, hazard, weather, traffic). The driver confirms first.",
      input_schema: schema(
        { type: { type: "string", enum: REPORT_TYPE_KEYS }, note: { type: "string", description: "Optional detail, short" } },
        ["type"],
      ),
      prepare: async (input, user) => {
        const type = requiredText(input, "type") as ReportType;
        if (!REPORT_TYPES[type]) throw new BadRequestException(`type must be one of ${REPORT_TYPE_KEYS.join(", ")}`);
        const note = optionalText(input, "note")?.slice(0, 200);
        const { position } = await this.community.listReports(user);
        if (!position) throw new UnprocessableEntityException("Your truck's position isn't known yet, so a report can't be placed.");
        return {
          title: "Road report",
          summary: `Report "${REPORT_TYPES[type].label}" where your truck is now`,
          details: note ? [`Note: ${note}`] : [],
          warnings: [],
          input: { type, note },
        };
      },
      execute: async (input, user) => {
        const type = requiredText(input, "type") as ReportType;
        await this.community.createReport(user, { type, note: optionalText(input, "note") });
        const { label, ttlHours } = REPORT_TYPES[type];
        return { message: `Thanks, "${label}" is on the map for other drivers for ${ttlHours} h.` };
      },
    };
  }

  private messageDispatch(): WriteTool {
    return {
      name: "message_dispatch",
      kind: "write",
      roles: [...DRIVER],
      description: "Propose sending a short message to dispatch; it shows up in their alerts. The driver confirms first.",
      input_schema: schema({ text: { type: "string" } }, ["text"]),
      prepare: async (input) => {
        const text = limited(input, "text", 500);
        return { title: "Message dispatch", summary: `Send to dispatch: "${text}"`, details: [], warnings: [] };
      },
      execute: async (input, user) => {
        const { driver, trip } = await this.current(user);
        const truck = trip?.truck.truckNumber ?? orNull(driver.truckNumber);
        this.alerts.raise({
          kind: "driver-message",
          severity: "info",
          message: `${driver.firstName} ${driver.lastName}${truck ? ` (${truck})` : ""}: ${requiredText(input, "text")}`,
          cargoId: trip?.cargo.id,
          truckId: trip?.truck.id,
        });
        return { message: "Sent to dispatch." };
      },
    };
  }

  private postToDriverChat(): WriteTool {
    return {
      name: "post_to_driver_chat",
      kind: "write",
      roles: [...DRIVER],
      description: "Propose posting a message in the drivers' community chat (other drivers, not dispatch). The driver confirms first.",
      input_schema: schema({ text: { type: "string" } }, ["text"]),
      prepare: async (input) => {
        const text = limited(input, "text", 1000);
        return { title: "Drivers' chat", summary: `Post in the drivers' chat: "${text}"`, details: [], warnings: [] };
      },
      execute: async (input, user) => {
        await this.community.sendMessage(user, { body: requiredText(input, "text") });
        return { message: "Posted in the drivers' chat." };
      },
    };
  }

  private addLogbookEntry(): WriteTool {
    return {
      name: "add_logbook_entry",
      kind: "write",
      roles: [...DRIVER],
      description:
        "Propose adding an entry to the logbook of the driver's truck: a note, damage, repair, service or inspection, " +
        "optionally with the odometer in miles and a cost in dollars. The driver confirms first.",
      input_schema: schema(
        {
          title: { type: "string", description: 'Short, e.g. "Cracked mirror on passenger side"' },
          kind: { type: "string", enum: [...LOG_KINDS] },
          odometerMiles: { type: "integer" },
          costUsd: { type: "number" },
        },
        ["title"],
      ),
      prepare: async (input, user) => {
        const title = limited(input, "title", 160);
        const kind = optionalText(input, "kind") ?? "note";
        if (!(LOG_KINDS as readonly string[]).includes(kind)) throw new BadRequestException(`kind must be one of ${LOG_KINDS.join(", ")}`);
        const odometerMiles = optionalNumber(input, "odometerMiles");
        const costUsd = optionalNumber(input, "costUsd");
        const truck = await this.truckOf(user);
        return {
          title: "Logbook entry",
          summary: `Add to truck ${truck.truckNumber}'s logbook: ${title}`,
          details: [
            `Type: ${kind}`,
            ...(odometerMiles !== undefined ? [`Odometer: ${odometerMiles.toLocaleString("en-US")} mi`] : []),
            ...(costUsd !== undefined ? [`Cost: $${costUsd.toLocaleString("en-US")}`] : []),
          ],
          warnings: [],
          input: { truckId: truck.id, title, kind, odometerMiles, costUsd },
        };
      },
      execute: async (input, user) => {
        const odometerMiles = optionalNumber(input, "odometerMiles");
        await this.records.addLog(
          "trucks",
          requiredId(input, "truckId"),
          {
            title: requiredText(input, "title"),
            kind: optionalText(input, "kind") as (typeof LOG_KINDS)[number],
            odometerKm: odometerMiles === undefined ? undefined : Math.round(odometerMiles * MILE_KM),
            cost: optionalNumber(input, "costUsd"),
          },
          user.email,
        );
        return { message: "Added to the logbook." };
      },
    };
  }

  /** The truck the driver is on: their current load's, else the one they are seated in. */
  private async truckOf(user: AuthUser) {
    const { driver, trip } = await this.current(user);
    if (trip) return trip.truck;
    if (!driver.truckId) throw new BadRequestException("You aren't on a truck right now.");
    return this.trucks.findOne(driver.truckId);
  }
}

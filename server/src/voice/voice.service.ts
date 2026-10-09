import { BadRequestException, Injectable } from "@nestjs/common";
import { AuthUser } from "../auth/auth-user";
import { CargosService } from "../cargos/cargos.service";
import { DriversService } from "../drivers/drivers.service";
import { AlertsService } from "../live/alerts.service";
import { Trip, TripsService } from "../trips/trips.service";
import { ExecuteVoiceDto } from "./voice.dto";
import { IntentParser, VoiceIntent } from "./voice.types";

const formatDuration = (seconds: number) => {
  const minutes = Math.round(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
};

/**
 * Voice commands for drivers: a transcript is first interpreted into a proposed action
 * (nothing changes yet), the driver confirms, and only then is it executed.
 */
@Injectable()
export class VoiceService {
  constructor(
    private readonly parser: IntentParser,
    private readonly trips: TripsService,
    private readonly drivers: DriversService,
    private readonly cargos: CargosService,
    private readonly alerts: AlertsService,
  ) {}

  async interpret(user: AuthUser, transcript: string) {
    const trip = await this.currentTrip(user);
    const context = trip
      ? { pickup: trip.cargo.pickupLocation, delivery: trip.cargo.deliveryLocation, pickedUp: !!trip.cargo.pickedUpAt }
      : null;
    const intent = await this.parser.parse(transcript, context);

    // Questions are answered straight away; changes need the driver to confirm.
    if (intent.action === "next_stop") {
      return { intent, parser: this.parser.name, needsConfirmation: false, reply: await this.nextStopReply(trip) };
    }
    if (intent.action === "unknown") {
      return { intent, parser: this.parser.name, needsConfirmation: false, reply: intent.clarification ?? "Sorry, I didn't get that." };
    }
    if (!trip) {
      return { intent, parser: this.parser.name, needsConfirmation: false, reply: "You have no load assigned right now." };
    }
    return {
      intent,
      parser: this.parser.name,
      needsConfirmation: true,
      cargoId: trip.cargo.id,
      reply: this.confirmationQuestion(intent, trip),
    };
  }

  async execute(user: AuthUser, dto: ExecuteVoiceDto) {
    const trip = await this.currentTrip(user);
    if (!trip || trip.cargo.id !== dto.cargoId) {
      throw new BadRequestException("That load is no longer your current load");
    }
    const cargo = trip.cargo;
    const driverName = `${(await this.drivers.findByUserId(user.id)).firstName}`;

    switch (dto.action) {
      case "report_delay": {
        if (!dto.delayMinutes) throw new BadRequestException("How many minutes is the delay?");
        await this.cargos.reportDelay(cargo.id, dto.delayMinutes, dto.reason ?? "");
        return { reply: `Done. Dispatch knows you're ${dto.delayMinutes} minutes late.` };
      }
      case "confirm_pickup":
        await this.cargos.markPickedUp(cargo.id);
        return { reply: `Pickup confirmed. Next stop: ${cargo.deliveryLocation}.` };
      case "confirm_delivery":
        await this.cargos.markDelivered(cargo.id);
        return { reply: "Delivery confirmed. Good job." };
      case "set_pickup_location":
      case "set_delivery_location": {
        if (!dto.location?.trim()) throw new BadRequestException("Which address?");
        const field = dto.action === "set_pickup_location" ? "pickupLocation" : "deliveryLocation";
        const previous = cargo[field];
        await this.cargos.update(cargo.id, { [field]: dto.location.trim() });
        this.alerts.raise({
          kind: "address-changed",
          severity: "warning",
          message: `${driverName} (${trip.truck.truckNumber}) changed the ${field === "pickupLocation" ? "pickup" : "delivery"} address from "${previous}" to "${dto.location.trim()}"`,
          cargoId: cargo.id,
          truckId: trip.truck.id,
        });
        return { reply: `Updated. New ${field === "pickupLocation" ? "pickup" : "delivery"}: ${dto.location.trim()}.` };
      }
    }
  }

  private async currentTrip(user: AuthUser): Promise<Trip | undefined> {
    const driver = await this.drivers.findByUserId(user.id);
    const [trip] = await this.trips.activeTrips({ driverId: driver.id });
    return trip;
  }

  private confirmationQuestion(intent: VoiceIntent, trip: Trip): string {
    const stop = trip.cargo.pickedUpAt ? `delivery in ${trip.cargo.deliveryLocation}` : `pickup in ${trip.cargo.pickupLocation}`;
    switch (intent.action) {
      case "report_delay":
        return intent.delayMinutes
          ? `Report a ${intent.delayMinutes} minute delay for the ${stop}${intent.reason ? `, because of ${intent.reason}` : ""}?`
          : `How many minutes late will you be for the ${stop}?`;
      case "confirm_pickup":
        return `Confirm pickup in ${trip.cargo.pickupLocation}?`;
      case "confirm_delivery":
        return `Confirm delivery in ${trip.cargo.deliveryLocation}?`;
      case "set_pickup_location":
        return `Change the pickup address to ${intent.location}?`;
      case "set_delivery_location":
        return `Change the delivery address to ${intent.location}?`;
      default:
        return "";
    }
  }

  private async nextStopReply(trip: Trip | undefined): Promise<string> {
    if (!trip) return "You have no load assigned right now.";
    const where = `${trip.nextStop.kind === "pickup" ? "Pickup" : "Delivery"} in ${trip.nextStop.name}`;
    const route = trip.position ? await this.trips.routeFor(trip).catch(() => null) : null;
    const leg = route?.legs[0];
    return leg ? `${where}. ${Math.round(leg.distanceM / 1000)} kilometres, about ${formatDuration(leg.durationS)}.` : `${where}.`;
  }
}

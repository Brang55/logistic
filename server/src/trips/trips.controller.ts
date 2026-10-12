import { Body, Controller, ForbiddenException, Get, HttpCode, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthUser, CurrentUser } from "../auth/auth-user";
import { ManageFleet, Roles } from "../auth/roles.decorator";
import { CargosService } from "../cargos/cargos.service";
import { DriversService } from "../drivers/drivers.service";
import { AlertsService } from "../live/alerts.service";
import { TrafficService } from "./traffic.service";
import { ReportDelayDto } from "./trips.dto";
import { stopsOf, TripsService } from "./trips.service";

@ApiTags("trips")
@ApiBearerAuth()
@Controller()
export class TripsController {
  constructor(
    private readonly trips: TripsService,
    private readonly traffic: TrafficService,
    private readonly alerts: AlertsService,
    private readonly cargos: CargosService,
    private readonly drivers: DriversService,
  ) {}

  @ManageFleet()
  @Get("trucks/:id/next-pickups")
  nextPickups(@Param("id", ParseUUIDPipe) id: string) {
    return this.trips.nextPickups(id);
  }

  @ManageFleet()
  @Get("traffic/report")
  trafficReport() {
    return this.traffic.report();
  }

  @ManageFleet()
  @Get("traffic/alerts")
  trafficAlerts() {
    return this.alerts.list();
  }

  // ---- Driver app ----

  /** The signed-in driver's current load, the route to the next stop, and queued loads. */
  @Roles("driver")
  @Get("me/trip")
  async myTrip(@CurrentUser() user: AuthUser) {
    const driver = await this.drivers.findByUserId(user.id);
    const [trip] = await this.trips.activeTrips({ driverId: driver.id });
    if (!trip) return { driver, trip: null };
    const [route, trailer] = await Promise.all([
      this.trips.routeFor(trip).catch(() => null),
      this.trips.trailerFor(trip.cargo),
    ]);
    return {
      driver,
      trip: { ...trip, trailer, stops: stopsOf(trip.cargo), route },
    };
  }

  @Roles("driver")
  @Post("me/trip/:cargoId/picked-up")
  @HttpCode(200)
  async pickedUp(@CurrentUser() user: AuthUser, @Param("cargoId", ParseUUIDPipe) cargoId: string) {
    await this.assertOwnCargo(user, cargoId);
    return this.cargos.markPickedUp(cargoId);
  }

  @Roles("driver")
  @Post("me/trip/:cargoId/delivered")
  @HttpCode(200)
  async delivered(@CurrentUser() user: AuthUser, @Param("cargoId", ParseUUIDPipe) cargoId: string) {
    await this.assertOwnCargo(user, cargoId);
    return this.cargos.markDelivered(cargoId);
  }

  @Roles("driver")
  @Post("me/trip/:cargoId/delay")
  @HttpCode(200)
  async delay(
    @CurrentUser() user: AuthUser,
    @Param("cargoId", ParseUUIDPipe) cargoId: string,
    @Body() dto: ReportDelayDto,
  ) {
    await this.assertOwnCargo(user, cargoId);
    return this.cargos.reportDelay(cargoId, dto.minutes, dto.reason ?? "");
  }

  private async assertOwnCargo(user: AuthUser, cargoId: string) {
    const driver = await this.drivers.findByUserId(user.id);
    const cargo = await this.cargos.findOne(cargoId);
    if (cargo.driverId !== driver.id) throw new ForbiddenException("This load is not assigned to you");
  }
}

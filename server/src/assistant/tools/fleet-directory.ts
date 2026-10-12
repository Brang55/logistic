import { Injectable } from "@nestjs/common";
import { DriversService } from "../../drivers/drivers.service";
import { TrailersService } from "../../trailers/trailers.service";
import { TrucksService } from "../../trucks/trucks.service";

/** Names for truck, driver and trailer ids, so tool results read "truck 12" instead of a UUID. */
@Injectable()
export class FleetDirectory {
  constructor(
    private readonly trucks: TrucksService,
    private readonly drivers: DriversService,
    private readonly trailers: TrailersService,
  ) {}

  async load() {
    const [trucks, drivers, trailers] = await Promise.all([
      this.trucks.findAll(),
      this.drivers.findAll(),
      this.trailers.findAll(),
    ]);
    const truckNames = new Map(trucks.map((t) => [t.id, t.truckNumber]));
    const driverNames = new Map(drivers.map((d) => [d.id, `${d.firstName} ${d.lastName}`]));
    const trailerNames = new Map(trailers.map((t) => [t.id, t.trailerNumber]));
    const name = (names: Map<string, string>) => (id: string | null) => (id ? (names.get(id) ?? null) : null);
    return {
      trucks,
      drivers,
      trailers,
      truck: name(truckNames),
      driver: name(driverNames),
      trailer: name(trailerNames),
    };
  }
}

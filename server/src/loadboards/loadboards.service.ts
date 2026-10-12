import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CargosService } from "../cargos/cargos.service";
import { AlertsService } from "../live/alerts.service";
import { PositionsService } from "../positions/positions.service";
import { distanceM } from "../telematics/geo";
import { TrucksService } from "../trucks/trucks.service";
import { ExternalLoad, LOAD_BOARD_PROVIDERS, LoadBoardProvider } from "./loadboard.types";

// Board equipment → the truck types used on our cargo form.
const TRUCK_TYPE: Record<ExternalLoad["equipment"], string> = {
  "Dry van": "Box",
  Curtainsider: "Box",
  Reefer: "Refrigerated",
  Flatbed: "Flatbed",
  Tanker: "Tanker",
};

export interface LoadSearch {
  region?: "EU" | "US";
  equipment?: string;
}

@Injectable()
export class LoadBoardsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(LoadBoardsService.name);
  private timer?: NodeJS.Timeout;
  private readonly syncIntervalMs: number;

  constructor(
    @Inject(LOAD_BOARD_PROVIDERS) private readonly boards: LoadBoardProvider[],
    private readonly cargos: CargosService,
    private readonly trucks: TrucksService,
    private readonly positions: PositionsService,
    private readonly alerts: AlertsService,
    config: ConfigService,
  ) {
    this.syncIntervalMs = Number(config.get("LOADBOARD_SYNC_INTERVAL_MS") ?? 10 * 60_000);
  }

  onApplicationBootstrap() {
    if (this.syncIntervalMs <= 0) return;
    const run = () => void this.syncBooked().catch((err) => this.logger.warn(`Load board sync failed: ${err.message}`));
    run();
    this.timer = setInterval(run, this.syncIntervalMs);
  }

  onApplicationShutdown() {
    clearInterval(this.timer);
  }

  listBoards() {
    return this.boards.map((board) => ({ name: board.name, region: board.region }));
  }

  /** Offered loads, flagged with our cargo if already imported and the nearest free truck. */
  async search(filter: LoadSearch) {
    const boards = this.boards.filter((board) => !filter.region || board.region === filter.region);
    const loads = (await Promise.all(boards.map((board) => board.search()))).flat().filter(
      (load) => !filter.equipment || load.equipment === filter.equipment,
    );

    const imported = new Map<string, string>();
    for (const board of boards) {
      const ids = loads.filter((load) => load.board === board.name).map((load) => load.id);
      for (const row of await this.cargos.findBySource(board.name, ids)) imported.set(`${board.name}:${row.externalId}`, row.id);
    }

    const freeTrucks = await this.freeTruckPositions();
    return loads
      .map((load) => {
        const nearest = freeTrucks
          .map((truck) => ({ truckId: truck.id, truckNumber: truck.truckNumber, km: Math.round(distanceM(truck.point, load.origin.point) / 1000) }))
          .sort((a, b) => a.km - b.km)[0];
        return { ...load, cargoId: imported.get(`${load.board}:${load.id}`) ?? null, nearestTruck: nearest ?? null };
      })
      .sort((a, b) => a.pickupDate.localeCompare(b.pickupDate) || a.origin.city.localeCompare(b.origin.city));
  }

  /** Creates our cargo from a board load; importing the same load twice returns the first import. */
  async import(boardName: string, loadId: string) {
    const board = this.boards.find((b) => b.name === boardName);
    const load = await board?.get(loadId);
    if (!board || !load) throw new NotFoundException("Load not found on that board");

    const [existing] = await this.cargos.findBySource(board.name, [load.id]);
    if (existing) return { cargo: await this.cargos.findOne(existing.id), created: false };

    const cargo = await this.cargos.create(
      {
        shipperName: load.shipper.name,
        shipperAddress: load.origin.address,
        contactPerson: load.shipper.contact,
        phoneNumber: load.shipper.phone,
        emailAddress: load.shipper.email,
        receiverName: load.receiver.name,
        receiverAddress: load.destination.address,
        receiverContact: load.receiver.contact,
        receiverPhone: load.receiver.phone,
        receiverEmail: load.receiver.email,
        descriptionOfGoods: load.commodity,
        quantity: "1",
        weight: String(load.weightKg),
        dimensions: "",
        pickupDate: load.pickupDate,
        deliveryDate: load.deliveryDate,
        pickupLocation: load.origin.address,
        deliveryLocation: load.destination.address,
        truckType: TRUCK_TYPE[load.equipment],
        serviceType: "Door-to-Door",
        hazardousMaterial: load.hazmat ? "Yes" : "No",
        freightCost: `${load.rate.amount} ${load.rate.currency}`,
        paymentTerms: "Prepaid",
        notes: `Imported from ${board.name} (load ${load.id}).`,
      },
      { source: board.name, externalId: load.id, pickupPoint: load.origin.point, deliveryPoint: load.destination.point },
    );
    return { cargo, created: true };
  }

  /** Imports every load our company booked on a board that isn't in the system yet. */
  async syncBooked() {
    const imported: { board: string; loadId: string; cargoId: string }[] = [];
    for (const board of this.boards) {
      for (const load of await board.bookedLoads()) {
        const { cargo, created } = await this.import(board.name, load.id);
        if (created) imported.push({ board: board.name, loadId: load.id, cargoId: cargo.id });
      }
    }
    if (imported.length) {
      this.alerts.raise({
        kind: "loads-imported",
        severity: "info",
        message: `Imported ${imported.length} booked load${imported.length > 1 ? "s" : ""} from ${[...new Set(imported.map((i) => i.board))].join(", ")}`,
      });
    }
    return { imported };
  }

  private async freeTruckPositions() {
    const [available, latest] = await Promise.all([this.trucks.findAll("available"), this.positions.latest()]);
    const where = new Map(latest.map((p) => [p.truckId, p.point]));
    return available.filter((t) => where.has(t.id)).map((t) => ({ ...t, point: where.get(t.id)! }));
  }
}

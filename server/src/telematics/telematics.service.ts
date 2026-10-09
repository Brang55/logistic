import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown, Optional } from "@nestjs/common";
import { LiveGateway } from "./live.gateway";
import { PositionsService } from "./positions.service";
import { PositionFix, TelematicsProvider } from "./telematics.types";

/** Single entry point for positions: stores them and pushes them to live clients. */
@Injectable()
export class TelematicsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(TelematicsService.name);

  constructor(
    private readonly positions: PositionsService,
    private readonly live: LiveGateway,
    @Optional() private readonly provider?: TelematicsProvider,
  ) {}

  async ingest(fixes: PositionFix[], source: string) {
    const { stored, latest, unknownVehicles } = await this.positions.record(fixes, source);
    this.live.broadcastPositions(latest);
    return { accepted: stored, unknownVehicles };
  }

  async onApplicationBootstrap() {
    if (!this.provider) return;
    this.logger.log(`Starting telematics provider "${this.provider.name}"`);
    await this.provider.start((fixes) => this.ingest(fixes, this.provider!.name));
  }

  async onApplicationShutdown() {
    await this.provider?.stop();
  }
}

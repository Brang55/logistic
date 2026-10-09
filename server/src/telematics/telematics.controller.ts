import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/roles.decorator";
import { TrucksService } from "../trucks/trucks.service";
import { PositionsService } from "./positions.service";
import { HistoryQueryDto, WebhookDto } from "./telematics.dto";
import { TelematicsService } from "./telematics.service";
import { WebhookSecretGuard } from "./webhook-secret.guard";

const DAY_MS = 24 * 60 * 60 * 1000;

@ApiTags("telematics")
@Controller()
export class TelematicsController {
  constructor(
    private readonly telematics: TelematicsService,
    private readonly positions: PositionsService,
    private readonly trucks: TrucksService,
  ) {}

  @Public()
  @UseGuards(WebhookSecretGuard)
  @ApiHeader({ name: "x-telematics-secret", required: true })
  @Post("telematics/webhook")
  @HttpCode(202)
  webhook(@Body() dto: WebhookDto) {
    return this.telematics.ingest(
      dto.positions.map((p) => ({
        vehicleId: p.vehicleId,
        point: [p.lng, p.lat],
        speedKmh: p.speedKmh,
        heading: p.heading,
        recordedAt: p.recordedAt,
      })),
      "webhook",
    );
  }

  @ApiBearerAuth()
  @Get("positions/latest")
  latest() {
    return this.positions.latest();
  }

  @ApiBearerAuth()
  @Get("trucks/:id/positions")
  async history(@Param("id", ParseUUIDPipe) id: string, @Query() query: HistoryQueryDto) {
    await this.trucks.findOne(id);
    return this.positions.history(id, query.since ?? new Date(Date.now() - DAY_MS), query.limit ?? 2000);
  }
}

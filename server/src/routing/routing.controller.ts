import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { TrucksService } from "../trucks/trucks.service";
import { RouteDto } from "./routing.dto";
import { RoutingService } from "./routing.types";

@ApiTags("routing")
@ApiBearerAuth()
@Controller("routing")
export class RoutingController {
  constructor(
    private readonly routing: RoutingService,
    private readonly trucks: TrucksService,
  ) {}

  @Post("route")
  @HttpCode(200)
  async route(@Body() dto: RouteDto) {
    const vehicle = dto.truckId ? await this.trucks.findOne(dto.truckId) : undefined;
    return this.routing.route({ coordinates: dto.coordinates, vehicle, alternatives: dto.alternatives });
  }
}

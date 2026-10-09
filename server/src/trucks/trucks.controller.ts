import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { ManageFleet } from "../auth/roles.decorator";
import { StatusQueryDto } from "../common/status-query.dto";
import { CreateTruckDto, UpdateTruckDto } from "./trucks.dto";
import { TrucksService } from "./trucks.service";

@ApiTags("trucks")
@ApiBearerAuth()
@Controller("trucks")
export class TrucksController {
  constructor(private readonly trucks: TrucksService) {}

  @Get()
  findAll(@Query() query: StatusQueryDto) {
    return this.trucks.findAll(query.status);
  }

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.trucks.findOne(id);
  }

  @ManageFleet()
  @Post()
  create(@Body() dto: CreateTruckDto) {
    return this.trucks.create(dto);
  }

  @ManageFleet()
  @Patch(":id")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateTruckDto) {
    return this.trucks.update(id, dto);
  }

  @ManageFleet()
  @Delete(":id")
  @HttpCode(204)
  remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.trucks.remove(id);
  }
}

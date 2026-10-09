import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { ManageFleet } from "../auth/roles.decorator";
import { StatusQueryDto } from "../common/status-query.dto";
import { parseLngLat } from "../common/lnglat";
import { AssignCargoDto, CargoRouteQueryDto, CreateCargoDto, UpdateCargoDto } from "./cargos.dto";
import { CargosService } from "./cargos.service";

@ApiTags("cargos")
@ApiBearerAuth()
@Controller("cargos")
export class CargosController {
  constructor(private readonly cargos: CargosService) {}

  @Get()
  findAll(@Query() query: StatusQueryDto) {
    return this.cargos.findAll(query.status);
  }

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.cargos.findOne(id);
  }

  @ManageFleet()
  @Post()
  create(@Body() dto: CreateCargoDto) {
    return this.cargos.create(dto);
  }

  @ManageFleet()
  @Patch(":id")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateCargoDto) {
    return this.cargos.update(id, dto);
  }

  @Get(":id/route")
  route(@Param("id", ParseUUIDPipe) id: string, @Query() query: CargoRouteQueryDto) {
    const from = query.from === undefined ? undefined : parseLngLat(query.from);
    if (query.from !== undefined && !from) throw new BadRequestException("from must be \"lng,lat\"");
    return this.cargos.route(id, { truckId: query.truckId, from });
  }

  @ManageFleet()
  @Post(":id/assign")
  @HttpCode(200)
  assign(@Param("id", ParseUUIDPipe) id: string, @Body() dto: AssignCargoDto) {
    return this.cargos.assign(id, dto);
  }

  @ManageFleet()
  @Post(":id/confirm")
  @HttpCode(200)
  confirm(@Param("id", ParseUUIDPipe) id: string) {
    return this.cargos.confirm(id);
  }

  @ManageFleet()
  @Delete(":id")
  @HttpCode(204)
  remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.cargos.remove(id);
  }
}

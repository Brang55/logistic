import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { ManageFleet } from "../auth/roles.decorator";
import { StatusQueryDto } from "../common/status-query.dto";
import { CreateTrailerDto, UpdateTrailerDto } from "./trailers.dto";
import { TrailersService } from "./trailers.service";

@ApiTags("trailers")
@ApiBearerAuth()
@Controller("trailers")
export class TrailersController {
  constructor(private readonly trailers: TrailersService) {}

  @Get()
  findAll(@Query() query: StatusQueryDto) {
    return this.trailers.findAll(query.status);
  }

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.trailers.findOne(id);
  }

  @ManageFleet()
  @Post()
  create(@Body() dto: CreateTrailerDto) {
    return this.trailers.create(dto);
  }

  @ManageFleet()
  @Patch(":id")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateTrailerDto) {
    return this.trailers.update(id, dto);
  }

  @ManageFleet()
  @Delete(":id")
  @HttpCode(204)
  remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.trailers.remove(id);
  }
}

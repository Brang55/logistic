import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { ManageFleet } from "../auth/roles.decorator";
import { StatusQueryDto } from "../common/status-query.dto";
import { CreateDriverDto, DriverAccountDto, EmailQueryDto, UpdateDriverDto } from "./drivers.dto";
import { DriversService } from "./drivers.service";

@ApiTags("drivers")
@ApiBearerAuth()
@Controller("drivers")
export class DriversController {
  constructor(private readonly drivers: DriversService) {}

  @Get()
  findAll(@Query() query: StatusQueryDto) {
    return this.drivers.findAll(query.status);
  }

  // Declared before ":id" so the path is not parsed as an id.
  @Get("email-exists")
  async emailExists(@Query() query: EmailQueryDto) {
    return { exists: await this.drivers.emailExists(query.email) };
  }

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.drivers.findOne(id);
  }

  @ManageFleet()
  @Post()
  create(@Body() dto: CreateDriverDto) {
    return this.drivers.create(dto);
  }

  @ManageFleet()
  @Patch(":id")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateDriverDto) {
    return this.drivers.update(id, dto);
  }

  @ManageFleet()
  @Post(":id/account")
  createAccount(@Param("id", ParseUUIDPipe) id: string, @Body() dto: DriverAccountDto) {
    return this.drivers.createAccount(id, dto.password);
  }

  @ManageFleet()
  @Delete(":id")
  @HttpCode(204)
  remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.drivers.remove(id);
  }
}

import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthUser, CurrentUser } from "../auth/auth-user";
import { Roles } from "../auth/roles.decorator";
import { ChatMessageDto, RoadReportDto } from "./community.dto";
import { CommunityService } from "./community.service";

@ApiTags("community")
@ApiBearerAuth()
@Controller()
export class CommunityController {
  constructor(private readonly community: CommunityService) {}

  /** Active road reports from all drivers. */
  @Roles("driver", "admin", "dispatcher")
  @Get("road-reports")
  reports(@CurrentUser() user: AuthUser) {
    return this.community.listReports(user);
  }

  /** One-tap report, pinned at the driver's truck position. */
  @Roles("driver")
  @Post("road-reports")
  report(@CurrentUser() user: AuthUser, @Body() dto: RoadReportDto) {
    return this.community.createReport(user, dto);
  }

  @Roles("driver", "admin", "dispatcher")
  @Delete("road-reports/:id")
  @HttpCode(204)
  async removeReport(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    await this.community.removeReport(user, id);
  }

  /** The signed-in driver's completed deliveries, newest first. */
  @Roles("driver")
  @Get("me/history")
  history(@CurrentUser() user: AuthUser) {
    return this.community.history(user);
  }

  /** Every driver with their phone number, so drivers can call each other. */
  @Roles("driver")
  @Get("community/drivers")
  directory() {
    return this.community.directory();
  }

  @Roles("driver")
  @Get("community/messages")
  messages(@Query("before") before?: string) {
    const date = before ? new Date(before) : undefined;
    return this.community.messages(date && !Number.isNaN(date.getTime()) ? date : undefined);
  }

  @Roles("driver")
  @Post("community/messages")
  send(@CurrentUser() user: AuthUser, @Body() dto: ChatMessageDto) {
    return this.community.sendMessage(user, dto);
  }
}

import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { AuthUser, CurrentUser } from "../auth/auth-user";
import { ManageFleet } from "../auth/roles.decorator";
import { AssistantMessageDto, ConfirmActionDto } from "./assistant.dto";
import { AssistantService } from "./assistant.service";

@ApiTags("assistant")
@ApiBearerAuth()
@ManageFleet()
@Controller("assistant")
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  /** Whether the assistant is configured, so the app can explain when it isn't. */
  @Get()
  status() {
    return this.assistant.status();
  }

  /** Answers a request; changes come back as proposed actions and nothing is changed yet. */
  @Post("message")
  @HttpCode(200)
  // Every message is a paid model call.
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  message(@CurrentUser() user: AuthUser, @Body() dto: AssistantMessageDto) {
    return this.assistant.message(user, dto.text, dto.conversationId, dto.page);
  }

  /** Runs a proposed action the user confirmed. */
  @Post("actions/:id/confirm")
  @HttpCode(200)
  confirm(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ConfirmActionDto) {
    return this.assistant.confirm(user, id, dto);
  }

  @Post("actions/:id/cancel")
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.assistant.cancel(user, id);
  }
}

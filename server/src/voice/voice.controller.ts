import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthUser, CurrentUser } from "../auth/auth-user";
import { Roles } from "../auth/roles.decorator";
import { ExecuteVoiceDto, InterpretVoiceDto } from "./voice.dto";
import { VoiceService } from "./voice.service";

@ApiTags("voice")
@ApiBearerAuth()
@Roles("driver")
@Controller("me/voice")
export class VoiceController {
  constructor(private readonly voice: VoiceService) {}

  /** Understands a spoken command and proposes an action; changes nothing yet. */
  @Post("interpret")
  @HttpCode(200)
  interpret(@CurrentUser() user: AuthUser, @Body() dto: InterpretVoiceDto) {
    return this.voice.interpret(user, dto.transcript);
  }

  /** Runs an action the driver confirmed. */
  @Post("execute")
  @HttpCode(200)
  execute(@CurrentUser() user: AuthUser, @Body() dto: ExecuteVoiceDto) {
    return this.voice.execute(user, dto);
  }
}

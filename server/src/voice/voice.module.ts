import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CargosModule } from "../cargos/cargos.module";
import { DriversModule } from "../drivers/drivers.module";
import { LiveModule } from "../live/live.module";
import { TripsModule } from "../trips/trips.module";
import { ClaudeIntentParser } from "./claude.parser";
import { RuleBasedIntentParser } from "./rule-based.parser";
import { VoiceController } from "./voice.controller";
import { VoiceService } from "./voice.service";
import { IntentParser } from "./voice.types";

@Module({
  imports: [CargosModule, DriversModule, LiveModule, TripsModule],
  controllers: [VoiceController],
  providers: [
    VoiceService,
    RuleBasedIntentParser,
    ClaudeIntentParser,
    // Claude when an API key is configured, otherwise the keyword parser.
    {
      provide: IntentParser,
      inject: [ConfigService, ClaudeIntentParser, RuleBasedIntentParser],
      useFactory: (config: ConfigService, claude: ClaudeIntentParser, rules: RuleBasedIntentParser) =>
        config.get("ANTHROPIC_API_KEY") ? claude : rules,
    },
  ],
})
export class VoiceModule {}

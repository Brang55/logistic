import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AlertsService } from "./alerts.service";
import { LiveGateway } from "./live.gateway";

@Module({
  imports: [AuthModule],
  providers: [LiveGateway, AlertsService],
  exports: [LiveGateway, AlertsService],
})
export class LiveModule {}

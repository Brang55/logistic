import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LiveModule } from "../live/live.module";
import { DriversController } from "./drivers.controller";
import { DriversService } from "./drivers.service";

@Module({
  imports: [AuthModule, LiveModule],
  controllers: [DriversController],
  providers: [DriversService],
  exports: [DriversService],
})
export class DriversModule {}

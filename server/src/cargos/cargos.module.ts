import { Module } from "@nestjs/common";
import { LiveModule } from "../live/live.module";
import { RoutingModule } from "../routing/routing.module";
import { TrucksModule } from "../trucks/trucks.module";
import { CargosController } from "./cargos.controller";
import { CargosService } from "./cargos.service";

@Module({
  imports: [LiveModule, RoutingModule, TrucksModule],
  controllers: [CargosController],
  providers: [CargosService],
  exports: [CargosService],
})
export class CargosModule {}

import { Module } from "@nestjs/common";
import { RoutingModule } from "../routing/routing.module";
import { TrucksModule } from "../trucks/trucks.module";
import { CargosController } from "./cargos.controller";
import { CargosService } from "./cargos.service";

@Module({
  imports: [RoutingModule, TrucksModule],
  controllers: [CargosController],
  providers: [CargosService],
})
export class CargosModule {}

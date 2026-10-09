import { Module } from "@nestjs/common";
import { CargosModule } from "../cargos/cargos.module";
import { LiveModule } from "../live/live.module";
import { PositionsModule } from "../positions/positions.module";
import { TrucksModule } from "../trucks/trucks.module";
import { LOAD_BOARD_PROVIDERS } from "./loadboard.types";
import { LoadBoardsController } from "./loadboards.controller";
import { LoadBoardsService } from "./loadboards.service";
import { MockLoadBoard } from "./mock-load-boards";

@Module({
  imports: [CargosModule, LiveModule, PositionsModule, TrucksModule],
  controllers: [LoadBoardsController],
  providers: [
    LoadBoardsService,
    // Real adapters (DAT, Truckstop, Timocom, Trans.eu) go here once API access is in place.
    { provide: LOAD_BOARD_PROVIDERS, useFactory: () => [new MockLoadBoard("mock-eu-exchange", "EU"), new MockLoadBoard("mock-us-exchange", "US")] },
  ],
})
export class LoadBoardsModule {}

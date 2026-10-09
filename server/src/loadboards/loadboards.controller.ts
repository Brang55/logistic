import { Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString } from "class-validator";
import { ManageFleet } from "../auth/roles.decorator";
import { LoadBoardsService } from "./loadboards.service";

class LoadSearchDto {
  @IsOptional()
  @IsIn(["EU", "US"])
  region?: "EU" | "US";

  @IsOptional()
  @IsString()
  equipment?: string;
}

@ApiTags("load boards")
@ApiBearerAuth()
@ManageFleet()
@Controller("loadboards")
export class LoadBoardsController {
  constructor(private readonly loadBoards: LoadBoardsService) {}

  @Get()
  boards() {
    return this.loadBoards.listBoards();
  }

  @Get("loads")
  search(@Query() query: LoadSearchDto) {
    return this.loadBoards.search(query);
  }

  @Post(":board/loads/:loadId/import")
  @HttpCode(200)
  import(@Param("board") board: string, @Param("loadId") loadId: string) {
    return this.loadBoards.import(board, loadId);
  }

  /** Imports loads our company booked on the boards (also runs on a timer). */
  @Post("sync")
  @HttpCode(200)
  sync() {
    return this.loadBoards.syncBooked();
  }
}

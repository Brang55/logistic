import { Body, Controller, HttpCode, NotFoundException, Post, Req, Res, UnauthorizedException, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { ApiTags } from "@nestjs/swagger";
import { Request, Response } from "express";
import { Public } from "../auth/roles.decorator";
import { GateDto } from "./gate.dto";
import { GateService } from "./gate.service";

export const GATE_COOKIE = "site_gate";
const GATE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

@ApiTags("gate")
@Controller("gate")
export class GateController {
  constructor(private readonly gate: GateService) {}

  // Rate-limited like login (LOGIN_RATE_LIMIT per minute per IP).
  @Public()
  @UseGuards(ThrottlerGuard)
  @Post()
  @HttpCode(204)
  unlock(@Body() dto: GateDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = this.gate.token();
    if (!token) throw new NotFoundException();
    if (!this.gate.check(dto.password)) throw new UnauthorizedException("Wrong password");
    res.cookie(GATE_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      // Behind Caddy, `trust proxy` makes this true for HTTPS visitors.
      secure: req.secure,
      path: "/",
      maxAge: GATE_MAX_AGE_MS,
    });
  }
}

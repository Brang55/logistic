import { Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { OnGatewayInit, WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import { Namespace, Socket } from "socket.io";
import { AuthUser } from "../auth/auth-user";
import { UserRole } from "../db/schema";
import { TruckPosition } from "../telematics/telematics.types";

const FLEET_ROOM = "fleet";
const FLEET_ROLES: UserRole[] = ["admin", "dispatcher"];

/** Something dispatchers should look at: a reported delay, heavy traffic or a closure. */
export interface LiveAlert {
  id: string;
  kind: "delay-reported" | "traffic-delay" | "incident";
  severity: "info" | "warning" | "critical";
  message: string;
  cargoId?: string;
  truckId?: string;
  createdAt: string;
}

/**
 * Live fleet feed. Clients connect to the "/live" namespace with
 * `auth: { token: <access token> }` and receive "position", "cargo" and "alert" events.
 */
@WebSocketGateway({ namespace: "live", cors: { origin: true } })
export class LiveGateway implements OnGatewayInit {
  private readonly logger = new Logger(LiveGateway.name);

  @WebSocketServer()
  private readonly server: Namespace;

  constructor(private readonly jwt: JwtService) {}

  afterInit(server: Namespace) {
    server.use(async (socket: Socket, next) => {
      try {
        const payload = await this.jwt.verifyAsync<{ sub: string; email: string; role: UserRole }>(
          String(socket.handshake.auth?.token ?? ""),
        );
        const user: AuthUser = { id: payload.sub, email: payload.email, role: payload.role };
        socket.data.user = user;
        if (FLEET_ROLES.includes(user.role)) await socket.join(FLEET_ROOM);
        next();
      } catch {
        next(new Error("unauthorized"));
      }
    });
    this.logger.log("Live gateway ready on /live");
  }

  broadcastPositions(positions: TruckPosition[]) {
    for (const position of positions) {
      this.server?.to(FLEET_ROOM).emit("position", position);
    }
  }

  /** Tells dispatcher screens that a cargo changed so they can refetch. */
  cargoChanged(cargoId: string) {
    this.server?.to(FLEET_ROOM).emit("cargo", { id: cargoId });
  }

  alert(alert: LiveAlert) {
    this.server?.to(FLEET_ROOM).emit("alert", alert);
  }
}

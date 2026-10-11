import { INestApplicationContext, Logger } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import { ServerOptions } from "socket.io";

/**
 * Socket.IO with the same allowed origins as the HTTP API. With Redis connected, broadcasts
 * are shared across API instances through Redis pub/sub.
 */
export class LiveIoAdapter extends IoAdapter {
  private redisAdapter?: ReturnType<typeof createAdapter>;

  constructor(
    app: INestApplicationContext,
    private readonly corsOrigin: string[] | true,
  ) {
    super(app);
  }

  async connectRedis(redisUrl: string) {
    const pub = createClient({ url: redisUrl });
    const sub = pub.duplicate();
    await Promise.all([pub.connect(), sub.connect()]);
    this.redisAdapter = createAdapter(pub, sub);
    new Logger(LiveIoAdapter.name).log("Socket.IO uses the Redis adapter");
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, { ...options, cors: { origin: this.corsOrigin } });
    if (this.redisAdapter) server.adapter(this.redisAdapter);
    return server;
  }
}

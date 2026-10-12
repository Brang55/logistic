import { EventEmitter } from "node:events";
import { INestApplicationContext, Logger } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import { ServerOptions } from "socket.io";

/** The part of a node-redis client the adapter uses (tests pass a fake). */
export interface RedisClient extends Pick<EventEmitter, "on"> {
  connect(): Promise<unknown>;
  duplicate(): RedisClient;
}

/**
 * Socket.IO with the same allowed origins as the HTTP API. With Redis connected, broadcasts
 * are shared across API instances through Redis pub/sub.
 */
export class LiveIoAdapter extends IoAdapter {
  private redisAdapter?: ReturnType<typeof createAdapter>;
  private readonly redisLogger = new Logger(LiveIoAdapter.name);

  constructor(
    app: INestApplicationContext,
    private readonly corsOrigin: string[] | true,
  ) {
    super(app);
  }

  async connectRedis(redisUrl: string, create: (url: string) => RedisClient = (url) => createClient({ url })) {
    const pub = create(redisUrl);
    const sub = pub.duplicate();
    this.survive(pub, "publisher");
    this.survive(sub, "subscriber");
    await Promise.all([pub.connect(), sub.connect()]);
    this.redisAdapter = createAdapter(pub, sub);
    this.redisLogger.log("Socket.IO uses the Redis adapter");
  }

  /**
   * node-redis reconnects by itself, but an "error" event without a listener crashes the
   * process, so a Redis restart used to take the whole API down. Logs once per outage.
   */
  private survive(client: RedisClient, role: string) {
    let down = false;
    client.on("error", (err: Error) => {
      if (!down) this.redisLogger.warn(`Redis ${role} lost (${err.message || err.name}); reconnecting`);
      down = true;
    });
    client.on("ready", () => {
      if (down) this.redisLogger.log(`Redis ${role} reconnected`);
      down = false;
    });
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, { ...options, cors: { origin: this.corsOrigin } });
    if (this.redisAdapter) server.adapter(this.redisAdapter);
    return server;
  }
}

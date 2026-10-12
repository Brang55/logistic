import { EventEmitter } from "node:events";
import { INestApplicationContext, Logger } from "@nestjs/common";
import { LiveIoAdapter, RedisClient } from "./live-io.adapter";

class FakeRedis extends EventEmitter implements RedisClient {
  copies: FakeRedis[] = [];
  connect = jest.fn(async () => this);
  duplicate() {
    const copy = new FakeRedis();
    this.copies.push(copy);
    return copy;
  }
}

const refused = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:6379"), { code: "ECONNREFUSED" });

describe("LiveIoAdapter Redis connection", () => {
  let pub: FakeRedis;
  let sub: FakeRedis;
  let warn: jest.SpyInstance;
  let log: jest.SpyInstance;

  beforeEach(async () => {
    warn = jest.spyOn(Logger.prototype, "warn").mockImplementation();
    log = jest.spyOn(Logger.prototype, "log").mockImplementation();
    pub = new FakeRedis();
    const adapter = new LiveIoAdapter({} as INestApplicationContext, true);
    await adapter.connectRedis("redis://localhost:6379", () => pub);
    sub = pub.copies[0];
  });

  afterEach(() => jest.restoreAllMocks());

  it("connects both the publisher and the subscriber", () => {
    expect(pub.connect).toHaveBeenCalled();
    expect(sub.connect).toHaveBeenCalled();
  });

  it("keeps running when Redis goes away", () => {
    // Without a listener, EventEmitter throws on "error", which crashed the API.
    expect(() => pub.emit("error", refused)).not.toThrow();
    expect(() => sub.emit("error", refused)).not.toThrow();
  });

  it("logs an outage once and logs the reconnect", () => {
    pub.emit("error", refused);
    pub.emit("error", refused);
    pub.emit("error", refused);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("Redis publisher lost");

    log.mockClear();
    pub.emit("ready");
    expect(log).toHaveBeenCalledWith("Redis publisher reconnected");

    pub.emit("error", refused);
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

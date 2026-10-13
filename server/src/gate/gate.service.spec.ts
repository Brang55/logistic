import { ConfigService } from "@nestjs/config";
import { GateService } from "./gate.service";

const gate = (env: Record<string, string>) => new GateService(new ConfigService(env));

describe("GateService", () => {
  const configured = gate({ SITE_GATE_PASSWORD: "open sesame", SITE_GATE_TOKEN: "t0k3n" });

  it("accepts only the configured password", () => {
    expect(configured.check("open sesame")).toBe(true);
    expect(configured.check("open sesame ")).toBe(false);
    expect(configured.check("")).toBe(false);
  });

  it("hands out the token when both values are set", () => {
    expect(configured.token()).toBe("t0k3n");
  });

  it("is disabled when either value is missing", () => {
    expect(gate({ SITE_GATE_TOKEN: "t0k3n" }).token()).toBeNull();
    expect(gate({ SITE_GATE_PASSWORD: "open sesame" }).token()).toBeNull();
    expect(gate({}).check("")).toBe(false);
  });
});

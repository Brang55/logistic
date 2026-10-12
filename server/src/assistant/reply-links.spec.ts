import { isAppPath, linkReply, LinkTargets } from "./reply-links";

const LOAD = "675521ab-1111-4111-8111-111111111111";
const TRUCK = "0e67e0ad-a24a-4090-838c-d8296dbc5598";
const TRAILER = "a1b2c3d4-2222-4222-8222-222222222222";

const targets: LinkTargets = {
  cargos: [{ id: LOAD }],
  trucks: [
    { id: TRUCK, truckNumber: "US-205" },
    { id: "b0000000-0000-4000-8000-000000000000", truckNumber: "US-2051" },
    // Too plain to tell apart from an ordinary number.
    { id: "c0000000-0000-4000-8000-000000000000", truckNumber: "1" },
  ],
  trailers: [{ id: TRAILER, trailerNumber: "TR-12" }],
};
const link = (markdown: string) => linkReply(markdown, targets);

describe("linkReply", () => {
  it("links loads, trucks and trailers to their pages", () => {
    expect(link("**SH-675521** on US-205 with TR-12.")).toBe(
      `**[SH-675521](/cargoList/${LOAD}/preview)** on [US-205](/trucks/${TRUCK}) with [TR-12](/trailers/${TRAILER}).`,
    );
  });

  it("links inside tables and prefers the longest truck number", () => {
    expect(link("| SH-675521 | US-2051 |")).toBe(
      `| [SH-675521](/cargoList/${LOAD}/preview) | [US-2051](/trucks/b0000000-0000-4000-8000-000000000000) |`,
    );
  });

  it("leaves unknown references, plain numbers and partial matches alone", () => {
    expect(link("SH-FFFFFF, 1 was late, XUS-205 and US-205-B")).toBe("SH-FFFFFF, 1 was late, XUS-205 and US-205-B");
  });

  it("doesn't link again inside links or code", () => {
    const text = "[Traffic](/traffic) and `US-205`";
    expect(link(text)).toBe(text);
  });

  it("drops links to pages that don't exist, keeping their text", () => {
    expect(link("[open it](/nope) or [site](https://example.com) or [US-205](/trucks/not-an-id)")).toBe(
      `open it or site or [US-205](/trucks/${TRUCK})`,
    );
  });

  it("knows the app's pages", () => {
    expect(isAppPath("/cargoList")).toBe(true);
    expect(isAppPath(`/fleet?truck=${TRUCK}`)).toBe(true);
    expect(isAppPath("/cargoList/x/preview")).toBe(false);
    expect(isAppPath("/admin")).toBe(false);
  });
});

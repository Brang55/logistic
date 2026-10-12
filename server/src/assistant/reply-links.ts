import { Injectable } from "@nestjs/common";
import { CargosService } from "../cargos/cargos.service";
import { UserRole } from "../db/schema";
import { FleetDirectory } from "./tools/fleet-directory";
import { shipmentRef } from "./tools/format";
import { PAGES } from "./tools/navigation.tools";

export interface LinkTargets {
  cargos: { id: string }[];
  trucks: { id: string; truckNumber: string }[];
  trailers: { id: string; trailerNumber: string }[];
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Every staff page the reply may link to: fixed pages and the detail pages that take an id.
const ALLOWED_PATHS = Object.values(PAGES).map(
  ({ path }) => new RegExp(`^${escape(path).replace(":id", UUID)}$`, "i"),
);
export const isAppPath = (href: string) => ALLOWED_PATHS.some((pattern) => pattern.test(href));

// Markdown links and inline code: kept apart from the plain text that gets linked.
const PROTECTED = /(`[^`\n]*`|\[[^\]\n]*\]\([^)\s]*\))/;
const LINK = /^\[([^\]\n]*)\]\(([^)\s]*)\)$/;

// Truck and trailer numbers only count when they look like identifiers ("US-205"), so a
// number such as "1" in "1 was delayed" is never mistaken for one.
const looksLikeId = (number: string) => number.length >= 3 && /[a-z]/i.test(number) && /\d/.test(number);

/**
 * Turns load references (SH-…), truck numbers and trailer numbers in a staff reply into links
 * to their pages, and drops links that don't point to a page of the app.
 */
export function linkReply(markdown: string, targets: LinkTargets): string {
  const hrefs = new Map<string, string>();
  for (const { id } of targets.cargos) hrefs.set(shipmentRef(id), `/cargoList/${id}/preview`);
  for (const t of targets.trucks) if (looksLikeId(t.truckNumber)) hrefs.set(t.truckNumber, `/trucks/${t.id}`);
  for (const t of targets.trailers) if (looksLikeId(t.trailerNumber)) hrefs.set(t.trailerNumber, `/trailers/${t.id}`);

  // Longest first, so "US-2051" is never cut short by "US-205".
  const names = [...hrefs.keys()].sort((a, b) => b.length - a.length).map(escape);
  const mention = names.length ? new RegExp(`(?<![\\w-])(${names.join("|")})(?![\\w-])`, "g") : undefined;
  const linkMentions = (text: string) =>
    mention ? text.replace(mention, (name) => `[${name}](${hrefs.get(name)})`) : text;

  return markdown
    .split(PROTECTED)
    .map((part, i) => {
      // split() with a capture group puts the protected matches at odd indexes.
      if (i % 2 === 0) return linkMentions(part);
      const link = part.match(LINK);
      if (!link) return part;
      const [, text, href] = link;
      return isAppPath(href) ? part : linkMentions(text);
    })
    .join("");
}

/** Links staff replies to the loads, trucks and trailers they mention. */
@Injectable()
export class ReplyLinker {
  constructor(
    private readonly cargos: CargosService,
    private readonly directory: FleetDirectory,
  ) {}

  async link(markdown: string, role: UserRole) {
    // Drivers can't open staff pages, so their replies stay as written.
    if (role === "driver") return markdown;
    const [cargos, { trucks, trailers }] = await Promise.all([this.cargos.findAll(), this.directory.load()]);
    return linkReply(markdown, { cargos, trucks, trailers });
  }
}

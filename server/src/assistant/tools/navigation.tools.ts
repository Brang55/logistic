import { BadRequestException, Injectable } from "@nestjs/common";
import { AssistantTool } from "../assistant.types";
import { optionalText, requiredId } from "./format";

// Staff pages of the web app. `id` pages need the id of the cargo, truck or trailer.
export const PAGES: Record<string, { path: string; label: string; needsId?: true }> = {
  dashboard: { path: "/", label: "Dashboard" },
  dispatch: { path: "/dispatcher", label: "Dispatch" },
  live_fleet: { path: "/fleet", label: "Live fleet" },
  traffic: { path: "/traffic", label: "Traffic" },
  load_board: { path: "/loadboard", label: "Load board" },
  track_cargo: { path: "/track", label: "Track cargo" },
  all_cargo: { path: "/cargoList", label: "All cargo" },
  add_cargo: { path: "/cargo", label: "Add cargo" },
  trucks: { path: "/trucks", label: "Trucks" },
  trailers: { path: "/trailers", label: "Trailers" },
  drivers: { path: "/drivers", label: "Drivers" },
  cargo: { path: "/cargoList/:id/preview", label: "Load details", needsId: true },
  edit_cargo: { path: "/cargoList/:id/edit", label: "Edit load", needsId: true },
  truck: { path: "/trucks/:id", label: "Truck details", needsId: true },
  trailer: { path: "/trailers/:id", label: "Trailer details", needsId: true },
  truck_on_map: { path: "/fleet?truck=:id", label: "Truck on the map", needsId: true },
};

/** Opens pages in the web app for the user. */
@Injectable()
export class NavigationTools {
  tools(): AssistantTool[] {
    return [
      {
        name: "open_page",
        kind: "ui",
        roles: ["admin", "dispatcher"],
        description:
          "Open a page of the app for the user. cargo, edit_cargo, truck, trailer and truck_on_map need the `id` " +
          "of that load, truck or trailer (truck_on_map: a truck id).",
        input_schema: {
          type: "object",
          properties: { page: { type: "string", enum: Object.keys(PAGES) }, id: { type: "string" } },
          required: ["page"],
          additionalProperties: false,
        },
        action: (input) => {
          const page = PAGES[optionalText(input, "page") ?? ""];
          if (!page) throw new BadRequestException(`page must be one of ${Object.keys(PAGES).join(", ")}`);
          const path = page.needsId ? page.path.replace(":id", requiredId(input, "id")) : page.path;
          return { type: "navigate", path, label: page.label };
        },
      },
    ];
  }
}

// The few hast (HTML syntax tree) fields the plugin below reads and writes.
interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

const textOf = (node: HastNode): string =>
  node.type === "text" ? (node.value ?? "") : (node.children ?? []).map(textOf).join("");

const descendants = (node: HastNode, tagName: string): HastNode[] =>
  (node.children ?? []).flatMap((child) => (child.tagName === tagName ? [child] : descendants(child, tagName)));

/** Copies each column's header onto its cells (`data-label`), so on phones a row can show as a card. */
export const labelTableCells = () => (tree: HastNode) => {
  for (const table of descendants(tree, "table")) {
    const headers = descendants(table, "th").map(textOf);
    for (const row of descendants(table, "tr")) {
      descendants(row, "td").forEach((cell, index) => {
        cell.properties = { ...cell.properties, dataLabel: headers[index] ?? "" };
      });
    }
  }
};

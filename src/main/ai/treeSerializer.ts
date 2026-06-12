import { createHash } from "crypto";
import { screen } from "electron";
import type { AxDumpResult, AxElement } from "../axDump";
import type {
  SerializedTree,
  ContractElement,
} from "../../shared/partA-contract";

// Roles we always keep even without a label (they're interactive).
const INTERACTIVE_ROLES = new Set([
  "AXButton",
  "AXLink",
  "AXMenuItem",
  "AXMenuButton",
  "AXCheckBox",
  "AXRadioButton",
  "AXTextField",
  "AXTextArea",
  "AXSearchField",
  "AXComboBox",
  "AXPopUpButton",
  "AXSlider",
  "AXSwitch",
  "AXTab",
  "AXDisclosureTriangle",
]);

// Roles we skip entirely — they're structural containers, not targets.
const SKIP_ROLES = new Set([
  "AXWindow",
  "AXApplication",
  "AXSplitGroup",
  "AXScrollArea",
  "AXScrollBar",
  "AXSplitter",
  "AXLayoutItem",
  "AXLayoutArea",
  "AXUnknown",
]);

const MAX_CONTRACT_ELEMENTS = 300;

/**
 * Returns a stable short id like "e17" for an element.
 * Hashes role + label + depth-path so the same logical element maps to the
 * same id across consecutive dumps (as long as the UI hasn't restructured).
 */
function stableId(el: AxElement, depthPath: string): string {
  const key = `${el.role}|${el.title}|${el.desc}|${depthPath}`;
  const hash = createHash("sha1").update(key).digest("hex");
  // Use first 3 hex chars → 0–4095; prefix with 'e' for readability.
  const num = parseInt(hash.slice(0, 3), 16) % 1000;
  return `e${num}`;
}

/**
 * Best human label for an element, used in the compact text format.
 */
function elementLabel(el: AxElement): string {
  return el.title || el.desc || el.value || el.role;
}

/**
 * AX coordinates from the dump are already in macOS screen points (physical px
 * on non-retina; logical pts × scale on retina). We report them as-is and let
 * the overlay divide by screenScale to get CSS px.
 */
function getScreenScale(): number {
  try {
    // screen is only available in the main process; guard for tests/workers.
    const primary = screen.getPrimaryDisplay();
    return primary.scaleFactor ?? 1;
  } catch {
    return 1;
  }
}

function extractWindowInfo(elements: AxElement[]): {
  window: string;
  focusedEl: AxElement | null;
} {
  const windowEl = elements.find(
    (el) => el.role === "AXWindow" || el.role === "AXDocument",
  );
  const window =
    windowEl?.title?.trim() ||
    elements.find((el) => el.title?.trim())?.title?.trim() ||
    "";

  // Best guess at the focused element: the one with the narrowest bbox that
  // has a label, as a heuristic (the dump doesn't tag focus explicitly).
  const focusedEl =
    elements.find(
      (el) =>
        INTERACTIVE_ROLES.has(el.role) && (el.title || el.desc) && el.w > 0,
    ) ?? null;

  return { window, focusedEl };
}

/**
 * Build the `SerializedTree` that Person 2's planner consumes.
 * Called by axEventWatcher on every AX notification.
 */
export function buildSerializedTree(dump: AxDumpResult): SerializedTree {
  const screenScale = getScreenScale();
  const { window, focusedEl } = extractWindowInfo(dump.elements);

  // Filter and cap.
  const filtered = dump.elements.filter((el) => {
    if (SKIP_ROLES.has(el.role)) return false;
    if (el.w <= 0 || el.h <= 0) return false;
    const hasLabel = !!(el.title || el.desc || el.value);
    if (!hasLabel && !INTERACTIVE_ROLES.has(el.role)) return false;
    return true;
  });

  const capped = filtered.slice(0, MAX_CONTRACT_ELEMENTS);
  const truncatedCount =
    filtered.length > MAX_CONTRACT_ELEMENTS
      ? filtered.length - MAX_CONTRACT_ELEMENTS
      : undefined;

  // Assign stable IDs. Track collisions: if two elements hash to the same id,
  // append a suffix to disambiguate.
  const usedIds = new Map<string, number>();
  const contractElements: ContractElement[] = [];
  let focusedId: string | null = null;

  for (const el of capped) {
    const depthPath = `d${el.depth}`;
    let id = stableId(el, depthPath);

    // Collision resolution: append a counter.
    const count = usedIds.get(id) ?? 0;
    if (count > 0) id = `${id}_${count}`;
    usedIds.set(id.replace(/_\d+$/, ""), count + 1);

    const label = elementLabel(el);
    const bbox: [number, number, number, number] = [
      Math.round(el.x),
      Math.round(el.y),
      Math.round(el.x + el.w),
      Math.round(el.y + el.h),
    ];

    contractElements.push({
      id,
      role: el.role,
      label,
      value: el.value || undefined,
      bbox,
    });

    if (focusedEl && el.i === focusedEl.i) focusedId = id;
  }

  const compactText = renderCompactText(
    dump.app,
    window,
    focusedId,
    contractElements,
    truncatedCount,
  );

  return {
    app: dump.app,
    window,
    screenScale,
    focusedId,
    elements: contractElements,
    truncatedCount,
    compactText,
  };
}

/**
 * Produces the flat text block the planner prompt eats:
 *
 *   APP: Gmail (browser: Chrome)  WINDOW: Inbox — user@gmail.com
 *   FOCUSED: e42 (textfield "Search mail")
 *   [e3]  button "Compose" (88, 120)
 *   [e17] button "Attach files" (612, 884)
 *   ...
 */
export function renderCompactText(
  app: string,
  window: string,
  focusedId: string | null,
  elements: ContractElement[],
  truncatedCount?: number,
): string {
  const lines: string[] = [];
  lines.push(`APP: ${app}  WINDOW: ${window || "(unknown)"}`);

  if (focusedId) {
    const focused = elements.find((el) => el.id === focusedId);
    if (focused) {
      lines.push(
        `FOCUSED: ${focused.id} (${roleShort(focused.role)} "${focused.label}")`,
      );
    }
  }

  for (const el of elements) {
    const x = el.bbox[0];
    const y = el.bbox[1];
    lines.push(
      `[${el.id.padEnd(4)}] ${roleShort(el.role).padEnd(12)} "${el.label.slice(0, 60)}" (${x}, ${y})`,
    );
  }

  if (truncatedCount && truncatedCount > 0) {
    lines.push(`... and ${truncatedCount} more elements (truncated)`);
  }

  return lines.join("\n");
}

function roleShort(role: string): string {
  return role.replace(/^AX/, "").toLowerCase();
}

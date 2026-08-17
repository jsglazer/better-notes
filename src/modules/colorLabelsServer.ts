import { getAnnotationColorLabel } from "../utils/annotation";

export { registerColorLabelsEndpoint, unregisterColorLabelsEndpoint };

// Zotero's 8 built-in annotation-color hexes, mapped to the canonical names
// zotero-manager's own `colorLabels` setting keys on (`DEFAULT_COLOR_LABELS`
// in its src/types.ts) — capitalized rather than the lowercase names in
// `DEFAULT_COLOR_NAMES` (annotationColorLabels.ts), which exist for DOM
// button-title detection, not for this JSON contract.
const COLOR_NAMES: Record<string, string> = {
  ffd400: "Yellow",
  ff6666: "Red",
  "5fb236": "Green",
  "2ea8e5": "Blue",
  a28ae5: "Purple",
  e56eee: "Magenta",
  f19837: "Orange",
  aaaaaa: "Gray",
};

const ENDPOINT_PATH = "/better-notes/color-labels";

/**
 * Exposes the user's per-color annotation labels (Zotero prefs, set via
 * Better Notes' own settings) as JSON on Zotero's local HTTP server —
 * the same server (default port 23119) Better BibTeX registers
 * `/better-bibtex/...` on, and that zotero-manager already talks to. Lets
 * zotero-manager sync its `colorLabels` setting from this plugin instead of
 * requiring the user to maintain the mapping twice.
 *
 * Only non-empty labels are included; a consumer should keep its own
 * default/fallback for any color missing from the response.
 */
// Zotero.Server dispatches endpoints one of two ways depending on client
// version: the newer `init(options) => Promise<[code, type, body]>`, or the
// older `init(data, sendResponseCallback)` where the endpoint itself must
// call the callback. Declaring `init()` with the promise signature alone
// left a real 9.0.6 client waiting forever for a callback that never came
// (confirmed: curl hung indefinitely against a live install, while
// `/better-bibtex/...` on the same server responded instantly and an
// unregistered path 404'd immediately — proving the request *was* reaching
// this endpoint's `init`, just never producing a response). Support both
// so this works regardless of which dispatch style the running client uses.
class ColorLabelsEndpoint {
  supportedMethods = ["GET"];

  init(
    _optionsOrData: unknown,
    sendResponseCallback?: (
      code: number,
      contentTypeOrHeaders?: string | Record<string, string>,
      body?: string,
    ) => void,
  ): void | Promise<[number, string, string]> {
    const colorLabels: Record<string, string> = {};
    for (const [hex, name] of Object.entries(COLOR_NAMES)) {
      const label = getAnnotationColorLabel(hex);
      if (label) colorLabels[name] = label;
    }
    const body = JSON.stringify({ colorLabels });

    if (typeof sendResponseCallback === "function") {
      sendResponseCallback(200, "application/json", body);
      return;
    }
    return Promise.resolve([200, "application/json", body]);
  }
}

function registerColorLabelsEndpoint(): void {
  Zotero.Server.Endpoints[ENDPOINT_PATH] = ColorLabelsEndpoint;
}

function unregisterColorLabelsEndpoint(): void {
  delete Zotero.Server.Endpoints[ENDPOINT_PATH];
}

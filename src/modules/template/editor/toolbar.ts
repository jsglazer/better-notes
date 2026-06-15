import { config } from "../../../../package.json";
import {
  FILTERS,
  ITEM_FIELDS,
  NOTE_FIELDS,
  TAGS,
  VARIABLES,
} from "../completions";

export { initFormats, updateSnippets };

/**
 * The template editor's two insert palettes:
 * - **formats** (`formatStore`) — Markdown/HTML formatting buttons that wrap the
 *   current selection (`${text}` is the selection placeholder).
 * - **snippets** (`snippetsStore`) — Liquid constructs + curated `item`/`note`
 *   fields, keyed by the editor's template type.
 *
 * Both are pure view helpers that read/write `addon.data.template.editor`.
 */

async function initFormats() {
  const container =
    addon.data.template.editor.window?.document.querySelector(
      "#formats-container",
    );
  if (!container) {
    return;
  }
  container.innerHTML = "";

  // Add formats to the container, with each format as a button
  for (const format of formatStore) {
    const button = document.createElement("div");
    button.classList.add("format", format.name);
    button.style.backgroundImage = `url("chrome://${config.addonRef}/content/icons/editor/${format.name}.svg")`;
    button.dataset.l10nId = `${config.addonRef}-format-${format.name}`;
    button.addEventListener("click", () => {
      const { editor, monaco } = addon.data.template.editor;
      const selection = editor.getSelection();
      const range = new monaco.Range(
        selection.startLineNumber,
        selection.startColumn,
        selection.endLineNumber,
        selection.endColumn,
      );
      const textTemplate = format.code;
      const source =
        editor.getModel().getValueInRange(range) ||
        format.defaultText ||
        "text";
      const text = textTemplate.replace("${text}", source);
      editor.executeEdits("", [
        {
          range,
          text,
          forceMoveMarkers: true,
        },
      ]);
      // Keep the selection after inserting the format
      const textBeforeReplace = textTemplate.split("${text}")[0];
      const textBeforeLines = textBeforeReplace.split("\n");
      const textLines = source.split("\n");

      // Calculate the new range
      const startLineNumber =
        selection.startLineNumber + textBeforeLines.length - 1;
      const startColumn =
        textBeforeLines.length === 1
          ? selection.startColumn + textBeforeReplace.length
          : textBeforeLines.slice(-1)[0].length + 1;
      const endLineNumber = startLineNumber + textLines.length - 1;
      const endColumn =
        textLines.length === 1
          ? startColumn + source.length
          : textLines.slice(-1)[0].length + 1;

      const newRange = new monaco.Range(
        startLineNumber,
        startColumn,
        endLineNumber,
        endColumn,
      );

      editor.setSelection(newRange);

      // Ensure the Liquid markdown sentinel is present so the inserted format
      // (Markdown) is converted on render. (Was the removed JS engine's
      // `// @use-markdown`.)
      if (
        !editor
          .getModel()
          .getLinesContent()
          .some((line: any) => line.trim().startsWith("<!--markdown-->"))
      ) {
        editor.executeEdits("", [
          {
            range: new monaco.Range(1, 1, 1, 1),
            text: "<!--markdown-->\n",
            forceMoveMarkers: true,
          },
        ]);
      }
    });
    container.appendChild(button);
  }
}

/**
 * Render the field/snippet palette for the given editor template type
 * (`item` / `text` / system|unknown). The field, filter, and tag lists +
 * their hover descriptions come from the shared completion catalog
 * (`completions.ts`) — the same source the editor autocomplete uses — so the
 * palette and autocomplete never drift. Items are grouped under headers; each
 * button inserts a ready-to-use Liquid token at the cursor.
 */
async function updateSnippets(type: string) {
  const container = addon.data.template.editor.window?.document.querySelector(
    "#snippets-container",
  );
  if (!container) {
    return;
  }
  container.innerHTML = "";

  for (const group of paletteGroups(type)) {
    if (!group.items.length) {
      continue;
    }
    const header = document.createElement("span");
    header.className = "snippet-group-header";
    header.textContent = group.title;
    container.appendChild(header);

    for (const item of group.items) {
      const button = document.createElement("span");
      button.classList.add("snippet", item.kind);
      button.textContent = item.label;
      // Hover description sourced from the completion catalog.
      button.title = item.info;
      button.addEventListener("click", () => insertSnippetCode(item.code));
      container.appendChild(button);
    }
  }
}

/** Insert `text` at the editor's current selection and re-select the result. */
function insertSnippetCode(text: string) {
  const { editor, monaco } = addon.data.template.editor;
  const selection = editor.getSelection();
  const range = new monaco.Range(
    selection.startLineNumber,
    selection.startColumn,
    selection.endLineNumber,
    selection.endColumn,
  );
  editor.executeEdits("", [{ range, text, forceMoveMarkers: true }]);
  // Re-select the inserted text (it can be multi-line).
  const newRange = new monaco.Range(
    selection.startLineNumber,
    selection.startColumn,
    selection.startLineNumber + text.split("\n").length - 1,
    text.split("\n").slice(-1)[0].length + 1,
  );
  editor.setSelection(newRange);
}

const formatStore = [
  {
    name: "bold",
    code: "**${text}**",
  },
  {
    name: "italic",
    code: "_${text}_",
  },
  {
    name: "strikethrough",
    code: "~~${text}~~",
  },
  {
    name: "underline",
    code: "<u>${text}</u>",
  },
  {
    name: "superscript",
    code: "<sup>${text}</sup>",
  },
  { name: "subscript", code: "<sub>${text}</sub>" },
  {
    name: "textColor",
    code: '<span style="color: orange">${text}</span>',
  },
  {
    name: "link",
    code: "[${text}](url)",
  },
  {
    name: "quote",
    code: "\n> ${text}",
  },
  {
    name: "monospaced",
    code: "<code>${text}</code>",
  },
  {
    name: "code",
    code: "\n<pre>\n${text}\n</pre>\n",
  },
  {
    name: "table",
    code: "\n| ${text} | Header 2 |\n|----------|----------|\n| Cell 1   | Cell 2   |\n",
  },
  {
    name: "h1",
    code: "\n# ${text}",
  },
  {
    name: "h2",
    code: "\n## ${text}",
  },
  {
    name: "h3",
    code: "\n### ${text}",
  },
  {
    name: "bullet",
    code: "\n- ${text}",
  },
  {
    name: "numbered",
    code: "\n1. ${text}",
  },
  {
    name: "inlineMath",
    code: "$${text}$",
    defaultText: "e=mc^2",
  },
  {
    name: "blockMath",
    code: "\n$$\n${text}\n$$\n",
    defaultText: "e=mc^2",
  },
  // The Markdown-formatting toolbar holds only Markdown/HTML formatting. Liquid
  // constructs (`{{ … }}`, `{% if %}`/`{% for %}`, etc.) are inserted from the
  // snippets palette (`snippetsStore`) — the legacy `inlineScript`/`blockScript`
  // buttons here were residue of the removed JS engine and duplicated it.
] as { name: string; code: string; defaultText?: string }[];

// ---- Field/snippet palette (catalog-backed) --------------------------------
// The palette's field/filter/tag lists + descriptions come from the shared
// completion catalog (`completions.ts`); only the *insert* tokens live here,
// since the catalog stores type-ahead fragments (e.g. "title"), not the
// ready-to-insert Liquid (`{{ item.title }}`).

interface PaletteItem {
  /** Button text. */
  label: string;
  /** Liquid inserted at the cursor on click. */
  code: string;
  /** Hover description (from the catalog). */
  info: string;
  /** Drives the `.snippet.<kind>` colour. */
  kind: "syntax" | "variable" | "field" | "filter" | "tag";
}

// Sentinels aren't in the catalog (they're document directives, not data).
const SYNTAX_ITEMS: PaletteItem[] = [
  { label: "liquid header", code: "<!--liquid-->\n", kind: "syntax", info: "Required first line — marks the template as Liquid." },
  { label: "markdown", code: "<!--markdown-->\n", kind: "syntax", info: "Render the output as Markdown, then convert to note HTML." },
  { label: "add tags", code: "<!--addTags: -->\n", kind: "syntax", info: "After rendering, add the listed tags to the target note." },
];

// Array fields read better as a loop than `{{ item.authors }}` (object dump).
const ITEM_ARRAY_INSERT: Record<string, string> = {
  authors: "{% for a in item.authors %}{{ a.name }}{% unless forloop.last %}; {% endunless %}{% endfor %}",
  creators: "{% for a in item.creators %}{{ a.name }}{% unless forloop.last %}; {% endunless %}{% endfor %}",
  tags: "{% for t in item.tags %}{{ t }}{% unless forloop.last %}, {% endunless %}{% endfor %}",
  collections: "{% for c in item.collections %}{{ c }}{% unless forloop.last %}, {% endunless %}{% endfor %}",
};
const NOTE_ARRAY_INSERT: Record<string, string> = {
  tags: "{% for t in note.tags %}{{ t }}{% unless forloop.last %}, {% endunless %}{% endfor %}",
  collections: "{% for c in note.collections %}{{ c }}{% unless forloop.last %}, {% endunless %}{% endfor %}",
};

// Block/opener tags get a full skeleton; the catalog's close/branch tokens
// (endif, else, …) are omitted since the skeletons include their closers.
const TAG_INSERT: Record<string, string> = {
  if: "{% if condition %}\n\n{% endif %}\n",
  unless: "{% unless condition %}\n\n{% endunless %}\n",
  for: "{% for x in items %}\n\n{% endfor %}\n",
  assign: "{% assign x = item.title %}",
  capture: "{% capture var %}\n\n{% endcapture %}\n",
  comment: "{% comment %}\n\n{% endcomment %}\n",
  annotations: "{% annotations %}",
};

function fieldGroup(
  entries: typeof ITEM_FIELDS,
  prefix: "item" | "note",
  arrayInsert: Record<string, string>,
): PaletteItem[] {
  return entries.map((e) => ({
    label: e.label,
    code: arrayInsert[e.label] ?? `{{ ${prefix}.${e.label} }}`,
    info: e.info,
    kind: "field",
  }));
}

function filterGroup(): PaletteItem[] {
  return FILTERS.map((e) => ({
    label: e.label,
    code: `| ${e.label}`,
    info: e.info,
    kind: "filter",
  }));
}

function tagGroup(): PaletteItem[] {
  const items: PaletteItem[] = TAGS.filter((e) => TAG_INSERT[e.label]).map(
    (e) => ({ label: e.label, code: TAG_INSERT[e.label], info: e.info, kind: "tag" }),
  );
  items.push({
    label: "annotations (grouped)",
    code: "{% annotations grouped %}",
    info: "Plugin: annotation HTML bucketed under per-color-label sections.",
    kind: "tag",
  });
  return items;
}

// `now` is the only top-level variable that inserts usefully on its own;
// item/items/note are prefixes covered by the field groups.
function variableGroup(): PaletteItem[] {
  return VARIABLES.filter((e) => e.label === "now").map((e) => ({
    label: e.label,
    code: `{{ ${e.label} }}`,
    info: e.info,
    kind: "variable",
  }));
}

/** Palette groups for the given editor template type. */
function paletteGroups(type: string): { title: string; items: PaletteItem[] }[] {
  const groups: { title: string; items: PaletteItem[] }[] = [
    { title: "Syntax", items: SYNTAX_ITEMS },
    { title: "Variables", items: variableGroup() },
  ];
  if (type === "item") {
    groups.push({ title: "Item fields", items: fieldGroup(ITEM_FIELDS, "item", ITEM_ARRAY_INSERT) });
    groups.push({ title: "Note fields", items: fieldGroup(NOTE_FIELDS, "note", NOTE_ARRAY_INSERT) });
  } else if (type === "text") {
    groups.push({ title: "Note fields", items: fieldGroup(NOTE_FIELDS, "note", NOTE_ARRAY_INSERT) });
  }
  groups.push({ title: "Filters", items: filterGroup() });
  groups.push({ title: "Tags", items: tagGroup() });
  return groups;
}

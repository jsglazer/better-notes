import { config } from "../../../../package.json";

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

async function updateSnippets(type: string) {
  const container = addon.data.template.editor.window?.document.querySelector(
    "#snippets-container",
  );
  if (!container) {
    return;
  }
  container.innerHTML = "";

  const snippets = (
    snippetsStore[type as keyof typeof snippetsStore] || []
  ).concat(snippetsStore.global);
  if (!snippets) {
    return;
  }

  // Add snippets to the container, with each snippet as a button
  // Dragging the button to the editor will insert the snippet
  for (const snippet of snippets) {
    const button = document.createElement("span");
    button.classList.add("snippet", snippet.type);
    // Liquid snippets carry their own label + show the inserted code as tooltip
    // (decoupled from the locale files, which still describe the removed engine).
    button.textContent = snippet.label;
    button.title = snippet.code.trim();
    button.addEventListener("click", () => {
      const { editor, monaco } = addon.data.template.editor;
      const selection = editor.getSelection();
      const range = new monaco.Range(
        selection.startLineNumber,
        selection.startColumn,
        selection.endLineNumber,
        selection.endColumn,
      );
      const text = snippet.code;
      editor.executeEdits("", [
        {
          range,
          text,
          forceMoveMarkers: true,
        },
      ]);
      // Select the inserted text, should compute the new range, as the text can be multi-line
      const newRange = new monaco.Range(
        selection.startLineNumber,
        selection.startColumn,
        selection.startLineNumber + text.split("\n").length - 1,
        text.split("\n").slice(-1)[0].length + 1,
      );
      editor.setSelection(newRange);
    });
    container.appendChild(button);
  }
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

// Insertable snippets for the template editor, keyed by the editor's template
// type. Only `global`, `item`, and `text` are reachable (the editor-type
// selector yields unknown/system/item/text). All snippets emit valid Liquid;
// each carries its own display `label` (the locale files still describe the
// removed JS engine, so the renderer uses `label` + a code tooltip instead).
const snippetsStore: Record<
  string,
  { name: string; label: string; code: string; type: string }[]
> = {
  global: [
    { name: "liquidHeader", label: "liquid header", code: "<!--liquid-->\n", type: "syntax" },
    { name: "markdownHeader", label: "markdown", code: "<!--markdown-->\n", type: "syntax" },
    { name: "addTags", label: "add tags", code: "<!--addTags: -->\n", type: "syntax" },
    { name: "ifBlock", label: "if", code: "{% if condition %}\n\n{% endif %}\n", type: "syntax" },
    { name: "forBlock", label: "for", code: "{% for x in items %}\n\n{% endfor %}\n", type: "syntax" },
    { name: "comment", label: "comment", code: "{% comment %}\n\n{% endcomment %}\n", type: "syntax" },
  ],
  item: [
    { name: "itemTitle", label: "title", code: "{{ item.title }}", type: "variable" },
    { name: "itemCiteKey", label: "citation key", code: "{{ item.citekey }}", type: "variable" },
    { name: "itemAuthors", label: "authors", code: "{% for a in item.authors %}{{ a.name }}{% unless forloop.last %}; {% endunless %}{% endfor %}", type: "expression" },
    { name: "itemFirstAuthor", label: "first author", code: "{{ item.authors[0].name }}", type: "variable" },
    { name: "itemDate", label: "date", code: "{{ item.date }}", type: "variable" },
    { name: "itemYear", label: "year", code: "{{ item.year }}", type: "variable" },
    { name: "itemAbstract", label: "abstract", code: "{{ item.abstract }}", type: "variable" },
    { name: "itemAbstractOneline", label: "abstract (1 line)", code: "{{ item.abstract | oneline }}", type: "expression" },
    { name: "itemDOI", label: "DOI", code: "{{ item.doi }}", type: "variable" },
    { name: "itemURL", label: "URL", code: "{{ item.url }}", type: "variable" },
    { name: "itemType", label: "item type", code: "{{ item.itemType }}", type: "variable" },
    { name: "itemTags", label: "tags", code: "{% for t in item.tags %}{{ t }}{% unless forloop.last %}, {% endunless %}{% endfor %}", type: "expression" },
    { name: "itemCollections", label: "collections", code: "{% for c in item.collections %}{{ c }}{% endfor %}", type: "expression" },
    { name: "itemKey", label: "item key", code: "{{ item.key }}", type: "variable" },
    { name: "itemAnnotations", label: "annotations", code: "{% annotations %}", type: "syntax" },
    { name: "itemAnnotationsGrouped", label: "annotations (grouped)", code: "{% annotations grouped %}", type: "syntax" },
    { name: "itemNoteTitle", label: "note title", code: "{{ note.title }}", type: "variable" },
  ],
  text: [
    { name: "textNoteTitle", label: "note title", code: "{{ note.title }}", type: "variable" },
    { name: "textNoteCiteKey", label: "note citation key", code: "{{ note.citekey }}", type: "variable" },
    { name: "textNoteParentTitle", label: "parent title", code: "{{ note.parentTitle }}", type: "variable" },
    { name: "textNoteTags", label: "note tags", code: "{% for t in note.tags %}{{ t }}{% endfor %}", type: "expression" },
    { name: "textNow", label: "current date", code: '{{ now | date: "%Y-%m-%d" }}', type: "expression" },
  ],
};

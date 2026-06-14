// Data
export { SYSTEM_TEMPLATE_NAMES, DEFAULT_TEMPLATES };

const SYSTEM_TEMPLATE_NAMES = [
  "[QuickInsertV3]",
  "[QuickImportV2]",
  "[QuickNoteV5]",
  "[ExportMDFileNameV2]",
  "[ExportMDFileHeaderV2]",
  "[ExportMDFileContent]",
  "[ExportLatexFileContent]",
];

// Non-system templates are removed from default templates
const DEFAULT_TEMPLATES = <NoteTemplate[]>[
  {
    // Flipped to the sandboxed Liquid engine (U4). Renders a Markdown link from
    // the host-provided `link` / `linkText` context (see runQuickInsertTemplate).
    name: "[QuickInsertV3]",
    text: `<!--liquid-->
<!--markdown-->
[{{ linkText }}]({{ link }})`,
  },
  {
    // Flipped to Liquid (U4). The host pre-computes the linked note's embedded
    // HTML (link2html, incl. image embedding) into `linkContent`; the template
    // emits it inside a blockquote. NOT markdown — linkContent is already HTML.
    name: "[QuickImportV2]",
    text: `<!--liquid-->
<blockquote>
{{ linkContent }}
</blockquote>`,
  },
  {
    // Flipped to Liquid (U4). Host pre-computes `commentHTML` (the annotation's
    // Markdown comment → HTML, only when present) and the annotation HTML via
    // the shared `{% annotations %}` tag (rendered with ignoreComment). NOT
    // markdown — both pieces are already HTML.
    name: "[QuickNoteV5]",
    text: `<!--liquid-->
{{ commentHTML }}{% annotations %}`,
  },
  {
    name: "[ExportMDFileNameV2]",
    text: `\${{
  const parentItem = noteItem.parentItem;
  if (parentItem) {
    try {
      const bbtKey = Zotero.BetterBibTeX.KeyManager.get(parentItem.id).citationKey;
      if (bbtKey) return bbtKey + ".md";
    } catch(e) {}
  }
  return (noteItem.getNoteTitle ? noteItem.getNoteTitle().replace(/[/\\\\?%*:|"<> ]/g, "-") + "-" : "") + noteItem.key + ".md";
}}$`,
  },
  {
    name: "[ExportMDFileHeaderV2]",
    text: `\${{
  let header = {};
  header.tags = noteItem.getTags().map((_t) => _t.tag);
  header.parent = noteItem.parentItem
    ? noteItem.parentItem.getField("title")
    : "";
  header.collections = (
    await Zotero.Collections.getCollectionsContainingItems([
      (noteItem.parentItem || noteItem).id,
    ])
  ).map((c) => c.name);
  try {
    const parentItem = noteItem.parentItem;
    if (parentItem) {
      const bbtKey = Zotero.BetterBibTeX.KeyManager.get(parentItem.id).citationKey;
      if (bbtKey) header.CitationKey = bbtKey;
    }
  } catch(e) {}
  return JSON.stringify(header);
}}$`,
  },
  {
    // Liquid passthrough (U4). NOT markdown — the output stays raw Markdown for
    // the exported .md file. `{{ mdContent }}` substitutes the value as-is;
    // Liquid never re-parses a variable's value, so note content containing
    // `{{ }}`/`{% %}` is emitted literally.
    name: "[ExportMDFileContent]",
    text: `<!--liquid-->
{{ mdContent }}`,
  },
  {
    // Liquid passthrough (U4). NOT markdown — output is raw LaTeX.
    name: "[ExportLatexFileContent]",
    text: `<!--liquid-->
{{ latexContent }}`,
  },
  {
    // Sandboxed (Liquid) port of the user's [item]ItemNoteMD05 template — U4
    // parity test. Selectable from the template picker after install; coexists
    // with the legacy JS template until the cutover is verified.
    name: "[item]ItemNoteMD-Liquid",
    text: `<!--liquid-->
<!--markdown-->
<!--addTags: ItemNote-->
# {{ item.citekey }}

## Summary
- CiteKey: {{ item.citekey }}
- Title: {{ item.title }}
- Authors:
{% for a in item.authors %}    - {{ a.name }}
{% endfor %}{% if item.authors.size == 0 %}    - (no authors)
{% endif %}- Year: {{ item.year }}
- Tags: ItemNote
- Abstract: {{ item.abstract | oneline }}

## Persistent Notes


## Core Claims


## Methodology


## Critiques


## Questions


## General Notes

## References`,
  },
  {
    // Sandboxed (Liquid) [text] parity test — exercises the text path, the `now`
    // context, and Liquid's built-in `date` filter. Coexists with legacy.
    name: "[text]Current Time-Liquid",
    text: `<!--liquid-->
**Current Time**: {{ now | date: "%Y-%m-%d %H:%M" }}`,
  },
  {
    // Sandboxed (Liquid) [item] parity test for the `{% annotations %}` render
    // tag (U4). NOT markdown: the tag emits annotation HTML (with embedded
    // images on a live run), so the body is HTML to avoid md2html mangling it.
    name: "[item]Annotations-Liquid",
    text: `<!--liquid-->
<h1>{{ item.citekey }}</h1>
<h2>Annotations</h2>
{% annotations %}`,
  },
];

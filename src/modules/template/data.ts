// Data
export { SYSTEM_TEMPLATE_NAMES, DEFAULT_TEMPLATES };

const SYSTEM_TEMPLATE_NAMES = [
  "[QuickInsertV3]",
  "[QuickImportV2]",
  "[QuickNoteV5]",
  "[ExportMDFileNameV2]",
  "[ExportMDFileContent]",
  "[ExportLatexFileContent]",
];

// Obsolete templates removed on startup: the legacy JS engine is gone, so
// `[item]ItemNoteMD05` (user's old custom template) and `[ExportMDFileHeaderV2]`
// (replaced by the buildExportHeader() function) are pruned from stored prefs
// (U4). The three `*-Liquid` parity-test templates seeded during the U4 cutover
// are pruned too now that the cutover is verified — they were dev scaffolding,
// not user-facing defaults (the `{% annotations %}` / `{% annotations grouped %}`
// features they demonstrated are documented in docs/liquid-templates.md). The
// `[item]ItemNoteMD-Liquid` starter is kept.
const OBSOLETE_TEMPLATE_NAMES = [
  "[item]ItemNoteMD05",
  "[ExportMDFileHeaderV2]",
  "[text]Current Time-Liquid",
  "[item]Annotations-Liquid",
  "[item]Annotations-Grouped-Liquid",
];
export { OBSOLETE_TEMPLATE_NAMES };

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
    // Flipped to Liquid (U4). `note.citekey` resolves through the curated model
    // (BBT key → `extra` "Citation Key:" → `citationKey` field) — broader than
    // the old BBT-only check, an intentional improvement (user has no synced
    // files to migrate). Falls back to sanitized-title + note key. Whitespace is
    // trimmed by getMDFileName; output is a bare filename.
    name: "[ExportMDFileNameV2]",
    text: `<!--liquid-->
{%- if note.citekey != blank -%}{{ note.citekey }}.md{%- else -%}{{ note.title | sanitize_filename }}-{{ note.key }}.md{%- endif -%}`,
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
    // The shipped starter [item] template — a Liquid note scaffold (summary +
    // section headings). Originally the Liquid port of the user's legacy
    // [item]ItemNoteMD05; kept as the example users can copy and adapt.
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
];

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
    name: "[QuickInsertV3]",
    text: `// @use-markdown
[\${linkText}](\${link})`,
  },
  {
    name: "[QuickImportV2]",
    text: `<blockquote>
\${{
  return await Zotero.BetterNotes.api.convert.link2html(link, {noteItem, dryRun: _env.dryRun});
}}$
</blockquote>`,
  },
  {
    name: "[QuickNoteV5]",
    text: `\${{
  let res = "";
  if (annotationItem.annotationComment) {
    res += await Zotero.BetterNotes.api.convert.md2html(
      annotationItem.annotationComment
    );
  }
  res += await Zotero.BetterNotes.api.convert.annotations2html([annotationItem], {noteItem, ignoreComment: true});
  return res;
}}$`,
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
    name: "[ExportMDFileContent]",
    text: `\${{
  return mdContent;
}}$`,
  },
  {
    name: "[ExportLatexFileContent]",
    text: `\${{
  return latexContent;
}}$`,
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
];

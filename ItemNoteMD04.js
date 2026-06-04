# This template is specifically for importing/sharing, using better
# notes 'import from clipboard': copy the content and
# goto Zotero menu bar, click Tools->New Template from Clipboard.
# Do not copy-paste this to better notes template editor directly.

name: "[item]ItemNoteMD04"
zoteroVersion: "7.0.11"
pluginVersion: "1.0.11"
savedAt: "2026-06-03T00:00:00.000Z"
content: |-
  // @use-markdown
  ${{
    if (targetNoteItem && targetNoteItem.isNote()) {
      targetNoteItem.addTag("ItemNote");
      await targetNoteItem.saveTx();
    }
    return "";
  }}$
  # ${(() => {
      try {
        const bbtKey = Zotero.BetterBibTeX.KeyManager.get(topItem.id).citationKey;
        if (bbtKey) return bbtKey;
      } catch(e) {}
      const match = (topItem.getField("extra") || "").match(/Citation Key:\s*(.*?)($|\n)/);
      return match ? match[1].trim() : topItem.getField("citationKey") || "";
    })()}

  ## Summary
  - CiteKey: ${(() => {
      try {
        const bbtKey = Zotero.BetterBibTeX.KeyManager.get(topItem.id).citationKey;
        if (bbtKey) return bbtKey;
      } catch(e) {}
      const match = (topItem.getField("extra") || "").match(/Citation Key:\s*(.*?)($|\n)/);
      return match ? match[1].trim() : topItem.getField("citationKey") || "";
    })()}
  - Title: ${topItem.getField("title")}
  ${(()=>{
    const creators = topItem.getCreators();
    const authorLines = creators.length
      ? creators.map(v => {
          const ln = (v.lastName || "").trim();
          const fn = (v.firstName || "").trim();
          if (ln && fn) return `    - ${ln}, ${fn}`;
          return `    - ${ln || fn}`;
        }).join('\n')
      : "    - (no authors)";
    return `- Authors:\n${authorLines}`;
  })()}
  - Year: ${(topItem.getField("date").match(/\d{4}/)||[""])[0]}
  - Tags: ItemNote
  - Abstract: ${(topItem.getField('abstractNote') || '').replace(/[\r\n]+/g, ' ')}

  ## Persistent Notes


  ## Argument or Core Claim


  ## Methodology


  ## Questions or Critiques


  ## Running Notes

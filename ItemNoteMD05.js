# This template is specifically for importing/sharing, using better
# notes 'import from clipboard': copy the content and
# goto Zotero menu bar, click Tools->New Template from Clipboard.
# Do not copy-paste this to better notes template editor directly.

name: "[item]ItemNoteMD05"
zoteroVersion: "7.0.11"
pluginVersion: "1.0.17"
savedAt: "2026-06-10T00:00:00.000Z"
content: |-
  // @use-markdown
  ${{
    if (targetNoteItem && targetNoteItem.isNote()) {
      targetNoteItem.addTag("ItemNote");
      await targetNoteItem.saveTx();
    }
    return "";
  }}$
  ${(() => {
      let key = "";
      try {
        key = Zotero.BetterBibTeX.KeyManager.get(topItem.id).citationKey || "";
      } catch(e) {}
      if (!key) {
        const match = (topItem.getField("extra") || "").match(/Citation Key:[ \t]*(.*?)(?:$|\n)/);
        key = (match && match[1].trim()) || topItem.getField("citationKey") || "";
      }
      return `# ${key}\n\n## Summary\n- CiteKey: ${key}`;
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


  ## Core Claims


  ## Methodology


  ## Critiques


  ## Questions


  ## General Notes

  ## References

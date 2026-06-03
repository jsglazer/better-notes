# This template is specifically for importing/sharing, using better
# notes 'import from clipboard': copy the content and
# goto Zotero menu bar, click Tools->New Template from Clipboard.
# Do not copy-paste this to better notes template editor directly.
name: "[item]Notev6"
zoteroVersion: "7.0.11"
pluginVersion: "1.0.5"
savedAt: "2026-06-03T13:53:00.000Z"
content: |-
  <h1>Note-${topItem.getField("citationKey")}</h1>

  <h2>Metadata</h2>

  <ul>
    <li><b>Item Type:</b> ${topItem.itemType}</li>
    <li><b>Authors:</b>
    ${{
      let creators = topItem.getCreators().slice(0, 10);
      let names = creators.map((v) => (v.firstName + " " + v.lastName).trim());
      if (topItem.getCreators().length > 10) names.push("et al.");
      let wrappedNames = names.map(name => `[[${name}]]`);
      return wrappedNames.join(', ');
    }}$
    </li>
    <li><b>Year:</b> ${topItem.getField("date").split('T')[0].split('-')[0]}</li>
    <li><b>Publication Date:</b> ${topItem.getField("date").split('T')[0]}</li>
    <li><b>Journal / Publisher:</b> ${topItem.getField('publicationTitle') || topItem.getField('publisher') || ''}</li>
    <li>
    ${(() => {
      const doi = topItem.getField("DOI");
      if (doi) {
        return `<b>DOI:</b> <a href="https://doi.org/${doi}">${doi}</a>`;
      } else {
        const url = topItem.getField('url');
        return `<b>URL:</b> <a href="${url}">${url}</a>`;
      }
    })()}
    </li>
    <li><b>Cite Key:</b>
    ${(() => {
      try {
        const bbtKey = Zotero.BetterBibTeX.KeyManager.get(topItem.id).citationKey;
        if (bbtKey) return bbtKey;
      } catch(e) {}
      const match = topItem.getField("extra").match(/Citation Key:\s*(.*?)($|\n)/);
      return match ? match[1].trim() : "";
    })()}
    </li>
    <li><b>Citation:</b>
    ${(() => {
      const creators = topItem.getCreators();
      const year = topItem.getField("date").split('T')[0].split('-')[0];
      if (creators.length === 0) return topItem.getField("title") + " (" + year + ")";
      if (creators.length === 1) return creators[0].lastName + " (" + year + ")";
      if (creators.length === 2) return creators[0].lastName + " & " + creators[1].lastName + " (" + year + ")";
      return creators[0].lastName + " et al. (" + year + ")";
    })()}
    </li>
    <li><b>Tags:</b>
    ${{
      let tags = topItem.getTags().map(tagObj => `#${tagObj.tag.trim()}`);
      tags.push('#zotero');
      return tags.join(', ');
    }}$
    </li>
    <li><b>PDF:</b>
    ${(() => {
      const attachments = Zotero.Items.get(topItem.getAttachments());
      const pdf = attachments.filter((i) => i.isPDFAttachment());
      if (pdf && pdf.length > 0) {
        return `<a href="zotero://open-pdf/library/items/${pdf[0].key}">${pdf[0].getFilename()}</a>`;
      } else if (attachments && attachments.length > 0) {
        return `<a href="zotero://open-pdf/library/items/${attachments[0].key}">${attachments[0].getFilename()}</a>`;
      } else {
        return `No attachment`;
      }
    })()}
    </li>
    <li><b>Zotero Link:</b> <a href="zotero://select/items/1_${topItem.key}">Open in Zotero</a></li>
    <li><b>Note Created:</b> ${new Date().toLocaleString()}</li>
  </ul>

  <h2>Dissertation Classification</h2>
  AI<p>Budget
  <p></p>

  <h2>Abstract</h2>

  ${topItem.getField('abstractNote')}
  <p></p>

  <h2>Personal Summary</h2>
  <p></p>

  <h3>Argument or Core Claim</h3>
  <ul>
    <li>What is the central argument or finding? What problem does it address?</li>
  </ul>
  <p></p>

  <h3>Methodology</h3>
  <ul>
    <li>How was this research conducted? What analytical framework or method is used?</li>
  </ul>
  <p></p>

  <h3>Regulatory Mechanisms Identified</h3>
  <ul>
    <li>What specific regulatory tools, structures, or instruments are described or analyzed?</li>
  </ul>
  <p></p>

  <h3>Transferability Notes</h3>
  <ul>
    <li>What conditions make this mechanism transferable (or not) to AI governance? Reference Baldwin-Cave-Lodge, Hood-Rothstein-Baldwin, or Gilardi criteria as applicable.</li>
  </ul>
  <p></p>

  <h3>Budget Issue 1</h3>
  <ul>
    <li>Text here</li>
  </ul>
  <p></p>

  <h3>Budget Issue 2</h3>
  <ul>
    <li>Text here</li>
  </ul>
  <p></p>

  <h3>Connections to Other Sources</h3>
  <ul>
    <li>How does this relate to other literature in your review?</li>
    <li>Any contradictions, confirmations, or gaps?</li>
  </ul>
  <p></p>

  <h3>Questions or Critiques</h3>
  <ul>
    <li>What do you push back on?</li>
    <li>What would you need to verify or extend?</li>
  </ul>
  <p></p>

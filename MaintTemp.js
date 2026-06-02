# This template is specifically for importing/sharing, using better
# notes 'import from clipboard': copy the content and
# goto Zotero menu bar, click Tools->New Template from Clipboard.
# Do not copy-paste this to better notes template editor directly.

name: "[item]Dissertation Note"
zoteroVersion: "7.0.11"
pluginVersion: "1.0.5"
savedAt: "2025-01-01T00:00:00.000Z"
content: |-
  <h1>${topItem.getField("title")}</h1>

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

  <ul>
    <li><b>Source Type:</b>
      <br/>☐ Academic literature
      <br/>☐ Primary law / statute
      <br/>☐ Regulation / rule
      <br/>☐ Agency guidance / report
      <br/>☐ Congressional record / testimony
      <br/>☐ International / comparative instrument
      <br/>☐ Think tank / policy report
      <br/>☐ Other: ___
    </li>
    <li><b>Industry / Sector:</b>
      <br/>☐ Finance / securities
      <br/>☐ Pharmaceuticals / FDA
      <br/>☐ Nuclear / NRC
      <br/>☐ Aviation / FAA
      <br/>☐ Environmental / NEPA
      <br/>☐ Telecommunications
      <br/>☐ AI / tech (direct)
      <br/>☐ Cross-sector / general
      <br/>☐ Other: ___
    </li>
    <li><b>AI Safety Goal Mapped To:</b>
      <br/>☐ Alignment
      <br/>☐ Explainability / interpretability
      <br/>☐ Security / robustness
      <br/>☐ Privacy
      <br/>☐ Accountability / auditability
      <br/>☐ Multiple / general
      <br/>☐ Not directly applicable
    </li>
    <li><b>Regulatory Mechanism Type:</b>
      <br/>☐ Command-and-control (prescriptive rules)
      <br/>☐ Performance-based standards
      <br/>☐ Ex ante approval / licensing
      <br/>☐ Ex post liability / enforcement
      <br/>☐ Disclosure / transparency requirement
      <br/>☐ Self-regulation / co-regulation
      <br/>☐ International coordination mechanism
      <br/>☐ Other: ___
    </li>
    <li><b>Policy Transfer Relevance (Dolowitz &amp; Marsh):</b>
      <br/>☐ Lesson-drawing
      <br/>☐ Voluntary transfer
      <br/>☐ Mixed / negotiated
      <br/>☐ Coercive transfer
      <br/>☐ Not applicable
    </li>
    <li><b>Transferability Assessment (preliminary):</b>
      <br/>☐ High — mechanism maps cleanly
      <br/>☐ Medium — partial fit, adaptation needed
      <br/>☐ Low — significant structural barriers
      <br/>☐ Unclear — needs further analysis
    </li>
  </ul>

  <h2>Abstract</h2>

  ${topItem.getField('abstractNote')}

  <h2>Personal Summary</h2>

  <h3>Argument / Core Claim</h3>
  <blockquote>What is the central argument or finding? What problem does it address?</blockquote>
  <p></p>

  <h3>Methodology</h3>
  <blockquote>How was this research conducted? What analytical framework or method is used?</blockquote>
  <p></p>

  <h3>Regulatory Mechanisms Identified</h3>
  <blockquote>What specific regulatory tools, structures, or instruments are described or analyzed?</blockquote>
  <p></p>

  <h3>Transferability Notes</h3>
  <blockquote>What conditions make this mechanism transferable (or not) to AI governance? Reference Baldwin-Cave-Lodge, Hood-Rothstein-Baldwin, or Gilardi criteria as applicable.</blockquote>
  <p></p>

  <h3>Connections to Other Sources</h3>
  <blockquote>How does this relate to other literature in your review? Any contradictions, confirmations, or gaps?</blockquote>
  <p></p>

  <h3>Questions / Critiques</h3>
  <blockquote>What do you push back on? What would you need to verify or extend?</blockquote>
  <p></p>

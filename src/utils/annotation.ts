import { importImageToNote } from "./note";
import { getPref } from "./prefs";
import {
  AnnotationPiece,
  groupAnnotationPieces,
  parseSectionOrder,
} from "./annotationGroup";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * User-assigned label for an annotation color — Enhanced Notes' native color
 * labeling (replaces the Highlight Descriptions plugin). Reads the per-color
 * pref keyed by lowercase hex (no '#'); "" when unset or color is unknown.
 */
export function getAnnotationColorLabel(color: string): string {
  if (!color) {
    return "";
  }
  const hex = color.replace(/^#/, "").toLowerCase();
  try {
    return ((getPref(`annotationColorLabel.${hex}`) as string) || "").trim();
  } catch (e) {
    return ""; // color has no declared pref (non-standard color)
  }
}

/** Insert a bold color label just inside the first block tag of an annotation. */
function prependColorLabel(html: string, label: string): string {
  const badge = `<strong>${escapeHtml(label)}:</strong> `;
  const m = html.match(/^(\s*<(?:p|li|blockquote|div)\b[^>]*>)/i);
  if (m) {
    return html.slice(0, m[0].length) + badge + html.slice(m[0].length);
  }
  return badge + html;
}

declare type CustomAnnotationJSON =
  Partial<_ZoteroTypes.Annotations.AnnotationJson> & {
    id?: string;
    attachmentItemID?: number;
    text?: string;
    tags: any;
    imageAttachmentKey?: string | undefined;
  };

async function parseAnnotationJSON(annotationItem: Zotero.Item) {
  try {
    if (!annotationItem || !annotationItem.isAnnotation()) {
      return null;
    }
    const annotationJSON = await Zotero.Annotations.toJSON(annotationItem);
    const annotationObj = Object.assign(
      {},
      annotationJSON,
    ) as CustomAnnotationJSON;
    annotationObj.id = annotationItem.key;
    annotationObj.attachmentItemID = annotationItem.parentItem?.id;
    delete annotationObj.key;
    for (const key in annotationObj) {
      annotationObj[key as keyof typeof annotationObj] =
        annotationObj[key as keyof typeof annotationObj] || ("" as any);
    }
    annotationObj.tags = annotationObj.tags || [];
    return annotationObj as Required<CustomAnnotationJSON>;
  } catch (e: unknown) {
    Zotero.logError(e as Error);
    return null;
  }
}

// Zotero.EditorInstanceUtilities.serializeAnnotations
//
// Renders each annotation to HTML, returning the pieces (with their color label)
// plus the collected citation items. `skipColorLabelPrepend` suppresses the
// per-annotation "**Label:**" badge — used by grouped output, where the label
// becomes the section heading instead.
function renderAnnotationPieces(
  annotations: Required<CustomAnnotationJSON>[],
  skipEmbeddingItemData: boolean = false,
  skipCitation: boolean = false,
  skipColorLabelPrepend: boolean = false,
): { pieces: AnnotationPiece[]; citationItems: Record<string, any>[] } {
  const storedCitationItems: Record<string, any>[] = [];
  const pieces: AnnotationPiece[] = [];
  for (const annotation of annotations) {
    const attachmentItem = Zotero.Items.get(annotation.attachmentItemID);
    if (!attachmentItem) {
      continue;
    }

    if (
      (!annotation.text &&
        !annotation.comment &&
        !annotation.imageAttachmentKey &&
        !annotation.image) ||
      annotation.type === "ink"
    ) {
      continue;
    }

    let citationHTML = "";
    let imageHTML = "";
    let highlightHTML = "";
    let quotedHighlightHTML = "";
    let commentHTML = "";

    const storedAnnotation: any = {
      attachmentURI: Zotero.URI.getItemURI(attachmentItem),
      annotationKey: annotation.id,
      color: annotation.color,
      pageLabel: annotation.pageLabel,
      position: annotation.position,
    };

    // Citation
    const parentItem = skipCitation
      ? undefined
      : attachmentItem.parentID && Zotero.Items.get(attachmentItem.parentID);
    if (parentItem) {
      const uris = [Zotero.URI.getItemURI(parentItem)];
      const citationItem: any = {
        uris,
        locator: annotation.pageLabel,
      };

      // Note: integration.js` uses `Zotero.Cite.System.prototype.retrieveItem`,
      // which produces a little bit different CSL JSON
      // @ts-ignore
      const itemData = Zotero.Utilities.Item.itemToCSLJSON(parentItem);
      if (!skipEmbeddingItemData) {
        citationItem.itemData = itemData;
      }

      const item = storedCitationItems.find((item) =>
        item.uris.some((uri: string) => uris.includes(uri)),
      );
      if (!item) {
        storedCitationItems.push({ uris, itemData });
      }

      storedAnnotation.citationItem = citationItem;
      const citation = {
        citationItems: [citationItem],
        properties: {},
      };

      const citationWithData = JSON.parse(JSON.stringify(citation));
      citationWithData.citationItems[0].itemData = itemData;
      const formatted =
        Zotero.EditorInstanceUtilities.formatCitation(citationWithData);
      citationHTML = `<span class="citation" data-citation="${encodeURIComponent(
        JSON.stringify(citation),
      )}">${formatted}</span>`;
    }

    // Image
    if (annotation.imageAttachmentKey) {
      // Normalize image dimensions to 1.25 of the print size
      const rect = annotation.position.rects[0];
      const rectWidth = rect[2] - rect[0];
      const rectHeight = rect[3] - rect[1];
      // Constants from pdf.js
      const CSS_UNITS = 96.0 / 72.0;
      const PDFJS_DEFAULT_SCALE = 1.25;
      const width = Math.round(rectWidth * CSS_UNITS * PDFJS_DEFAULT_SCALE);
      const height = Math.round((rectHeight * width) / rectWidth);
      imageHTML = `<img data-attachment-key="${
        annotation.imageAttachmentKey
      }" width="${width}" height="${height}" data-annotation="${encodeURIComponent(
        JSON.stringify(storedAnnotation),
      )}"/>`;
    }

    // Image in b64
    if (annotation.image) {
      imageHTML = `<img src="${annotation.image}"/>`;
    }

    // Text
    if (annotation.text) {
      const text = Zotero.EditorInstanceUtilities._transformTextToHTML.call(
        Zotero.EditorInstanceUtilities,
        annotation.text.trim(),
      );
      highlightHTML = `<span class="${annotation.type}" data-annotation="${encodeURIComponent(
        JSON.stringify(storedAnnotation),
      )}">${text}</span>`;
      quotedHighlightHTML = `<span class="${annotation.type}" data-annotation="${encodeURIComponent(
        JSON.stringify(storedAnnotation),
      )}">${Zotero.getString(
        "punctuation.openingQMark",
      )}${text}${Zotero.getString("punctuation.closingQMark")}</span>`;
    }

    // Note
    if (annotation.comment) {
      commentHTML = Zotero.EditorInstanceUtilities._transformTextToHTML.call(
        Zotero.EditorInstanceUtilities,
        annotation.comment.trim(),
      );
    }

    let template: string = "";
    if (["highlight", "underline"].includes(annotation.type)) {
      template = Zotero.Prefs.get(
        "annotations.noteTemplates.highlight",
      ) as string;
    } else if (["note", "text"].includes(annotation.type)) {
      template = Zotero.Prefs.get("annotations.noteTemplates.note") as string;
    } else if (annotation.type === "image") {
      template = "<p>{{image}}<br/>{{citation}} {{comment}}</p>";
    }

    ztoolkit.log("Using note template:");
    ztoolkit.log(template);

    template = template.replace(
      /(<blockquote>[^<>]*?)({{highlight}})([\s\S]*?<\/blockquote>)/g,
      (match, p1, p2, p3) => p1 + "{{highlight quotes='false'}}" + p3,
    );

    const colorLabel = getAnnotationColorLabel(annotation.color || "");
    const vars = {
      color: annotation.color || "",
      // Enhanced Notes native color label (replaces Highlight Descriptions).
      colorLabel,
      // Include quotation marks by default, but allow to disable with `quotes='false'`
      highlight: (attrs: any) =>
        attrs.quotes === "false" ? highlightHTML : quotedHighlightHTML,
      comment: commentHTML,
      citation: citationHTML,
      image: imageHTML,
      tags: (attrs: any) =>
        (
          (annotation.tags && annotation.tags.map((tag: any) => tag.name)) ||
          []
        ).join(attrs.join || " "),
    };

    let templateHTML = Zotero.Utilities.Internal.generateHTMLFromTemplate(
      template,
      vars,
    );
    // Show the color label out of the box: if the annotation template didn't
    // place `{{colorLabel}}` itself, prepend the label (when one is set). Skipped
    // for grouped output, where the label is emitted as the section heading.
    if (
      !skipColorLabelPrepend &&
      colorLabel &&
      !/\{\{\s*colorLabel\b/.test(template)
    ) {
      templateHTML = prependColorLabel(templateHTML, colorLabel);
    }
    // Remove some spaces at the end of paragraph
    templateHTML = templateHTML.replace(/([\s]*)(<\/p)/g, "$2");
    // Remove multiple spaces
    templateHTML = templateHTML.replace(/\s\s+/g, " ");
    pieces.push({ colorLabel, html: templateHTML });
  }
  return { pieces, citationItems: storedCitationItems };
}

// Flat serialization (legacy behavior): concatenate every annotation's HTML.
function serializeAnnotations(
  annotations: Required<CustomAnnotationJSON>[],
  skipEmbeddingItemData: boolean = false,
  skipCitation: boolean = false,
) {
  const { pieces, citationItems } = renderAnnotationPieces(
    annotations,
    skipEmbeddingItemData,
    skipCitation,
  );
  return { html: pieces.map((p) => p.html).join(""), citationItems };
}

export async function importAnnotationImagesToNote(
  note: Zotero.Item | undefined,
  annotations: CustomAnnotationJSON[],
) {
  for (const annotation of annotations) {
    if (annotation.image && note) {
      annotation.imageAttachmentKey =
        (await importImageToNote(note, annotation.image)) || "";
      delete annotation.image;
    }
  }
}

export async function parseAnnotationHTML(
  annotations: Zotero.Item[],
  options: {
    noteItem?: Zotero.Item; // If you are sure there are no image annotations, note is not required.
    ignoreBody?: boolean;
    ignoreComment?: boolean;
    skipCitation?: boolean;
    /** Group annotations under `<h2>Label</h2>` sections by color label. */
    groupByColorLabel?: boolean;
  } = {},
) {
  const annotationJSONList: CustomAnnotationJSON[] = [];
  for (const annot of annotations) {
    const annotJson = await parseAnnotationJSON(annot);
    if (options.ignoreComment && annotJson?.comment) {
      annotJson.comment = "";
    }
    if (options.ignoreBody && annotJson?.text && annotJson?.comment) {
      annotJson.text = annotJson.comment;
      annotJson.comment = "";
    }
    annotationJSONList.push(annotJson!);
  }

  await importAnnotationImagesToNote(options.noteItem, annotationJSONList);

  // Grouped output: bucket annotations under color-label headings (the label is
  // the heading, so the per-annotation badge is suppressed). Section order comes
  // from the `annotationSectionOrder` pref.
  if (options.groupByColorLabel) {
    let sectionPref = "";
    try {
      sectionPref = (getPref("annotationSectionOrder") as string) || "";
    } catch (e) {
      // pref unavailable — parseSectionOrder falls back to the default order.
    }
    const { pieces } = renderAnnotationPieces(
      annotationJSONList as Required<CustomAnnotationJSON>[],
      false,
      options.skipCitation,
      true,
    );
    return groupAnnotationPieces(pieces, parseSectionOrder(sectionPref));
  }

  const html = serializeAnnotations(
    annotationJSONList as Required<CustomAnnotationJSON>[],
    false,
    options.skipCitation,
  ).html;
  return html;
}

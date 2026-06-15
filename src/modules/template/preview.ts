import * as YAML from "yaml";
import { getNoteLink } from "../../utils/link";
import { renderNoteHTML } from "../../utils/note";

export { renderTemplatePreview };

async function renderTemplatePreview(
  templateName: string,
  inputItems?: Zotero.Item[],
): Promise<string> {
  let html: string = generateWarning("Preview not available");
  if (!inputItems) {
    inputItems = Zotero.getMainWindow().ZoteroPane.getSelectedItems();
  }
  // For an [item] preview, fall back to a representative item when nothing is
  // selected (e.g. the template editor is focused) so a preview still renders
  // instead of a "select an item" message.
  if (
    inputItems.length === 0 &&
    templateName.toLowerCase().startsWith("[item]")
  ) {
    const fallback = await getPreviewFallbackItem();
    if (fallback) {
      inputItems = [fallback];
    }
  }
  try {
    if (templateName.toLowerCase().startsWith("[text]")) {
      html = await addon.api.template.runTextTemplate(templateName, {
        dryRun: true,
      });
    } else if (templateName.toLowerCase().startsWith("[item]")) {
      if (inputItems.length === 0) {
        return messages.noItem;
      }
      const data = inputItems?.map((item) => item.id);
      html = await addon.api.template.runItemTemplate(templateName, {
        itemIds: data,
        dryRun: true,
      });
    } else if (templateName.includes("ExportMDFileName")) {
      // noteItem
      const data = inputItems?.find((item) => item.isNote());
      if (!data) {
        html = messages.noNoteItem;
      } else {
        html = await addon.api.sync.getMDFileName(data.id);
      }
    } else if (templateName.includes("ExportMDFileHeader")) {
      // noteItem — header is built by buildExportHeader (no longer a template)
      const data = inputItems?.find((item) => item.isNote());
      if (!data) {
        html = messages.noNoteItem;
      } else {
        const header = Object.assign(
          {},
          await addon.api.convert.buildExportHeader(data),
          {
            version: data.version,
            libraryID: data.libraryID,
            itemKey: data.key,
          },
        );
        html = `<pre>${YAML.stringify(header)}</pre>`;
      }
    } else if (templateName.includes("ExportMDFileContent")) {
      // noteItem
      const data = inputItems?.find((item) => item.isNote());
      if (!data) {
        html = messages.noNoteItem;
      } else {
        html = `<pre>${await addon.api.convert.note2md(
          data,
          Zotero.getTempDirectory().path,
          { withYAMLHeader: false, skipSavingImages: true, keepNoteLink: true },
        )}</pre>`;
      }
    } else if (templateName.includes("ExportLatexFileContent")) {
      // noteItem
      const data = inputItems?.find((item) => item.isNote());
      if (!data) {
        html = messages.noNoteItem;
      } else {
        const [latexContent, bibString] = await addon.api.convert.note2latex(
          data,
          Zotero.getTempDirectory().path,
          { withYAMLHeader: false, skipSavingImages: true, keepNoteLink: true },
        );
        html = `<pre>${latexContent}</pre>`;
      }
    } else if (templateName.includes("QuickInsert")) {
      // link, linkText, subNoteItem, noteItem
      const data = inputItems?.find((item) => item.isNote());
      if (!data) {
        html = messages.noNoteItem;
      } else {
        const noteItem = new Zotero.Item("note");
        html = await addon.api.template.runQuickInsertTemplate(data, noteItem, {
          dryRun: true,
        });
      }
    } else if (templateName.includes("QuickImport")) {
      // link, noteItem
      const data = inputItems?.find((item) => item.isNote());
      if (!data) {
        html = messages.noNoteItem;
      } else {
        const link = getNoteLink(data) || "";
        const noteItem = new Zotero.Item("note");
        html = await addon.api.template.runQuickImportTemplate(link, noteItem, {
          dryRun: true,
        });
      }
    } else if (templateName.includes("QuickNote")) {
      // annotationItem, topItem, noteItem
      html = generateWarning(
        `Preview not available for template ${templateName}`,
      );
    } else {
      html = generateWarning(
        `Preview not available for template ${templateName}`,
      );
    }
  } catch (err: any) {
    html = generateWarning(`Error: ${err.message || "Unknown error"}`);
  }

  // TODO: might not be stable?
  html = await renderNoteHTML(html, []);

  return html;
}

function generateWarning(message: string): string {
  return `<p style="color: red;">${message}</p>`;
}

/**
 * A representative regular item to preview an [item] template against when the
 * user hasn't selected one — the first regular item currently shown in the
 * library view, else any regular item in the selected library. Returns
 * undefined only when the library has no regular items.
 */
async function getPreviewFallbackItem(): Promise<Zotero.Item | undefined> {
  try {
    const pane = Zotero.getMainWindow().ZoteroPane;
    const sorted = (pane.getSortedItems?.() as Zotero.Item[]) || [];
    const inView = sorted.find((it) => it.isRegularItem());
    if (inView) {
      return inView;
    }
    const libraryID = pane.getSelectedLibraryID();
    const all = await Zotero.Items.getAll(libraryID);
    return (all || []).find((it) => it.isRegularItem());
  } catch (e) {
    return undefined;
  }
}

const messages = {
  noItem: generateWarning(
    "No item selected. Please select an item in the library.",
  ),
  noNoteItem: generateWarning(
    "No NOTE item selected. Please select a NOTE item in the library.",
  ),
};

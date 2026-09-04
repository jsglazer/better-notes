import { showHintWithLink } from "../../utils/hint";
import { getPref } from "../../utils/prefs";
import {
  fileExists,
  formatPath,
  jointPath,
  writeFileAtomic,
} from "../../utils/str";

export async function saveMD(
  filename: string,
  noteId: number,
  options: {
    keepNoteLink?: boolean;
    withYAMLHeader?: boolean;
  } = {},
) {
  const noteItem = Zotero.Items.get(noteId);
  const dir = jointPath(...PathUtils.split(formatPath(filename)).slice(0, -1));
  await IOUtils.makeDirectory(dir);
  const hasImage = noteItem.getNote().includes("<img");
  if (hasImage) {
    const attachmentsDir = jointPath(
      dir,
      getPref("syncAttachmentFolder") as string,
    );
    await IOUtils.makeDirectory(attachmentsDir);
  }
  await writeFileAtomic(
    filename,
    await addon.api.convert.note2md(noteItem, dir, options),
  );

  showHintWithLink(`Note Saved to ${filename}`, "Show in Folder", (ev) => {
    Zotero.File.reveal(filename);
  });
}

export async function syncMDBatch(
  saveDir: string,
  noteIds: number[],
  metaList?: Record<string, any>[],
) {
  const noteItems = Zotero.Items.get(noteIds);
  await IOUtils.makeDirectory(saveDir);
  const attachmentsDir = jointPath(
    saveDir,
    getPref("syncAttachmentFolder") as string,
  );
  const hasImage = noteItems.some((noteItem) =>
    noteItem.getNote().includes("<img"),
  );
  if (hasImage) {
    await IOUtils.makeDirectory(attachmentsDir);
  }
  let i = 0;
  for (const noteItem of noteItems) {
    // Reuse the note's already-assigned filename so a re-sync never renames or
    // re-collides the file. Only derive a name for a note that isn't linked yet
    // — and make it unique within saveDir so multiple notes on one item don't
    // all land on a single <citekey>.md (prompts for a short ID on a clash).
    const filename = addon.api.sync.isSyncNote(noteItem.id)
      ? addon.api.sync.getSyncStatus(noteItem.id).filename ||
        (await addon.api.sync.getUniqueMDFileName(noteItem.id, saveDir))
      : await addon.api.sync.getUniqueMDFileName(noteItem.id, saveDir);
    const filePath = jointPath(saveDir, filename);

    // U23: read what's on disk once — it serves two purposes below.
    let existingContent: string | undefined;
    try {
      if (await fileExists(filePath)) {
        existingContent = (await Zotero.File.getContentsAsync(
          filePath,
          "utf-8",
        )) as string;
      }
    } catch (e) {
      ztoolkit.log("syncMDBatch could not read existing file", filePath, e);
    }

    // U23: never drop front matter the user wrote. `note2md` merges any
    // user-owned keys from `cachedYAMLHeader` back into the header it builds,
    // but several callers (the "Import from Markdown file" command, the link
    // dialog, the auto-merge) pass no meta at all — so the first export after
    // linking an existing Obsidian note rewrote the file with ONLY the
    // generated fields, wiping hand-written front matter. When the caller has
    // no cached header, recover it straight from the file we're about to
    // overwrite.
    let cachedYAMLHeader = metaList?.[i];
    if (!cachedYAMLHeader && existingContent !== undefined) {
      cachedYAMLHeader =
        addon.api.sync.getMDStatusFromContent(existingContent).meta ??
        undefined;
    }

    const content = await addon.api.convert.note2md(noteItem, saveDir, {
      keepNoteLink: false,
      withYAMLHeader: true,
      cachedYAMLHeader,
    });
    // U23: an identical rewrite still bumps the file's mtime, and Obsidian
    // reloads the open note on that alone — throwing the cursor back to the top
    // of the document mid-sentence. Only touch the file when it actually
    // changes; the sync status below is refreshed either way.
    if (existingContent !== content) {
      await writeFileAtomic(filePath, content);
    }
    // Record the freshly-written file's mtime so the sync stat-gate can skip
    // re-reading this file next cycle while it stays unchanged.
    let mdModified = 0;
    try {
      mdModified = (await IOUtils.stat(filePath)).lastModified || 0;
    } catch (e) {
      ztoolkit.log("syncMDBatch stat after write failed", e);
    }
    // Front-matter-stripped body = the agreed state at this sync. Stored as the
    // diff3 common ancestor (U2b) and hashed for the stat-gate.
    const baseMd = addon.api.sync.getMDStatusFromContent(content).content;
    addon.api.sync.updateSyncStatus(noteItem.id, {
      path: saveDir,
      filename,
      itemID: noteItem.id,
      md5: Zotero.Utilities.Internal.md5(baseMd, false),
      noteMd5: Zotero.Utilities.Internal.md5(noteItem.getNote(), false),
      lastsync: new Date().getTime(),
      mdModified,
      baseMd,
    });
    i += 1;
  }
}

import { MessageHelper } from "zotero-plugin-toolkit";
import { config } from "../../package.json";
import { getNoteLinkParams } from "./link";
import type { handlers } from "../extras/relationWorker";

function closeRelationServer() {
  if (addon.data.relation.server) {
    terminateServerWorker(addon.data.relation.server);
    addon.data.relation.server = undefined;
  }
}

/**
 * Tear down a worker-backed MessageHelper server AND terminate its worker.
 *
 * The toolkit's `MessageHelper.destroy()` only stops the helper and detaches its
 * message listener — it never calls `worker.terminate()`. A ChromeWorker that
 * loaded its script from this plugin's `chrome://` registration keeps the
 * plugin's resources in use, so Zotero refuses to remove the (still-active)
 * plugin until a restart finally kills the worker. better-notes is one of the
 * few plugins using workers, which is why removal failed only for it. Terminate
 * the worker ourselves so the plugin can be removed while enabled.
 */
function terminateServerWorker(server: { destroy: () => void; target?: unknown }) {
  const target = server.target;
  try {
    server.destroy();
  } catch (e) {
    // helper already torn down — still try to kill the worker below.
  }
  try {
    (target as Worker | undefined)?.terminate?.();
  } catch (e) {
    // worker already gone.
  }
}

export { terminateServerWorker };

async function getRelationServer(): Promise<MessageHelper<typeof handlers>> {
  if (!addon.data.relation.server) {
    const worker = new Worker(
      `chrome://${config.addonRef}/content/scripts/relationWorker.js`,
      { name: "relationWorker" },
    );
    const server = new MessageHelper<typeof handlers>({
      canBeDestroyed: false,
      dev: __env__ === "development",
      name: "relationWorkerMain",
      target: worker,
      handlers: {},
    });
    server.start();
    await server.exec("_ping");
    addon.data.relation.server = server;
  }

  return addon.data.relation.server!;
}

export { getRelationServer, closeRelationServer };

export {
  updateNoteLinkRelation,
  getNoteLinkInboundRelation,
  getNoteLinkOutboundRelation,
  linkAnnotationToTarget,
  getLinkTargetByAnnotation,
  getAnnotationByLinkTarget,
};

async function updateNoteLinkRelation(noteID: number) {
  ztoolkit.log("updateNoteLinkRelation", noteID);
  const note = Zotero.Items.get(noteID);
  const affectedNoteIDs = new Set([noteID]);
  const fromLibID = note.libraryID;
  const fromKey = note.key;
  const lines = await addon.api.note.getLinesInNote(note);
  const linkToData: LinkModel[] = [];
  for (let i = 0; i < lines.length; i++) {
    const linkMatches = lines[i].match(/href="zotero:\/\/note\/[^"]+"/g);
    if (!linkMatches) {
      continue;
    }
    for (const match of linkMatches) {
      const link = decodeHTMLEntities(match.slice(6, -1));
      const { noteItem, libraryID, noteKey, lineIndex, sectionName } =
        getNoteLinkParams(link);
      if (noteItem && noteItem.isNote() && noteItem.id !== note.id) {
        affectedNoteIDs.add(noteItem.id);
        linkToData.push({
          fromLibID,
          fromKey,
          toLibID: libraryID,
          toKey: noteKey!,
          fromLine: i,
          toLine: lineIndex ?? null,
          toSection: sectionName ?? null,
          url: link,
        });
      }
    }
  }
  const result = await (
    await getRelationServer()
  ).proxy.rebuildLinkForNote(fromLibID, fromKey, linkToData);

  for (const link of result.oldOutboundLinks as LinkModel[]) {
    const item = Zotero.Items.getByLibraryAndKey(link.toLibID, link.toKey);
    if (!item) {
      continue;
    }
    affectedNoteIDs.add(item.id);
  }
  Zotero.Notifier.trigger(
    // @ts-ignore
    "updateBNRelation",
    "item",
    Array.from(affectedNoteIDs),
    {},
    true,
  );
}

async function getNoteLinkOutboundRelation(
  noteID: number,
): Promise<LinkModel[]> {
  const note = Zotero.Items.get(noteID);
  const fromLibID = note.libraryID;
  const fromKey = note.key;
  return await (
    await getRelationServer()
  ).proxy.getOutboundLinks(fromLibID, fromKey);
}

async function getNoteLinkInboundRelation(
  noteID: number,
): Promise<LinkModel[]> {
  const note = Zotero.Items.get(noteID);
  const toLibID = note.libraryID;
  const toKey = note.key;
  return await (
    await getRelationServer()
  ).proxy.getInboundLinks(toLibID, toKey);
}

function decodeHTMLEntities(text: string) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

interface LinkModel {
  fromLibID: number;
  fromKey: string;
  toLibID: number;
  toKey: string;
  fromLine: number;
  toLine: number | null;
  toSection: string | null;
  url: string;
}

async function linkAnnotationToTarget(model: AnnotationModel) {
  return await (await getRelationServer()).proxy.linkAnnotationToTarget(model);
}

async function getLinkTargetByAnnotation(
  fromLibID: number,
  fromKey: string,
): Promise<AnnotationModel | undefined> {
  return await (
    await getRelationServer()
  ).proxy.getLinkTargetByAnnotation(fromLibID, fromKey);
}

async function getAnnotationByLinkTarget(
  toLibID: number,
  toKey: string,
): Promise<AnnotationModel | undefined> {
  return await (
    await getRelationServer()
  ).proxy.getAnnotationByLinkTarget(toLibID, toKey);
}

interface AnnotationModel {
  fromLibID: number;
  fromKey: string;
  toLibID: number;
  toKey: string;
  url: string;
}

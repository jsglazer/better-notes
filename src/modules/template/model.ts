/**
 * Curated, plain-object data model exposed to templates (U3).
 *
 * Templates read `item.*` / `note.*` instead of touching the raw Zotero API —
 * this is the core of the simpler, safer template language and the foundation
 * for the loss-free engine cutover (U4). The field mappings are straightforward
 * Zotero reads (need a live Zotero to exercise); the one piece of real logic —
 * the citation-key `extra`-field fallback — is factored out as a pure,
 * unit-tested helper.
 */

import { year } from "./filters";

export interface CreatorModel {
  firstName: string;
  lastName: string;
  /** "Last, First" when both present, else whichever exists. */
  name: string;
}

export interface ItemModel {
  title: string;
  creators: CreatorModel[];
  /** Alias of `creators` for template readability. */
  authors: CreatorModel[];
  date: string;
  year: string;
  tags: string[];
  abstract: string;
  citekey: string;
  collections: string[];
  doi: string;
  url: string;
  itemType: string;
  key: string;
}

export interface NoteModel {
  title: string;
  tags: string[];
  key: string;
  parentTitle: string;
  collections: string[];
  citekey: string;
}

const CITEKEY_EXTRA_RE = /Citation Key:[ \t]*(.*?)(?:$|\n)/;

/**
 * Pure: pull a citation key out of a Zotero `extra` field, or "". Mirrors the
 * regex used by the existing templates. Unit-tested.
 */
export function extractCiteKeyFromExtra(extra: string | undefined): string {
  const m = (extra || "").match(CITEKEY_EXTRA_RE);
  return (m && m[1].trim()) || "";
}

/**
 * Resolve an item's citation key with the same precedence as the existing
 * templates — Better BibTeX `KeyManager` → `extra` "Citation Key:" → the native
 * `citationKey` field — so filenames and headers stay byte-stable across the
 * engine swap.
 */
export function getCiteKey(item: Zotero.Item): string {
  let key = "";
  try {
    key =
      // BBT is an optional plugin; type it loosely.
      (Zotero as any).BetterBibTeX?.KeyManager?.get(item.id)?.citationKey || "";
  } catch (e) {
    // BBT not installed / not ready — fall through to the field fallbacks.
  }
  if (!key) {
    key =
      extractCiteKeyFromExtra(item.getField("extra") as string) ||
      (item.getField("citationKey") as string) ||
      "";
  }
  return key;
}

/**
 * Collect every annotation item belonging to a regular item (across its file
 * attachments) or to an attachment directly. Best-effort: any attachment that
 * can't be read is skipped. Used to feed the `{% annotations %}` render tag.
 */
export function collectItemAnnotations(item: Zotero.Item): Zotero.Item[] {
  try {
    if (item.isAttachment()) {
      return item.getAnnotations();
    }
    const out: Zotero.Item[] = [];
    for (const attID of item.getAttachments()) {
      const att = Zotero.Items.get(attID);
      try {
        if (att?.isAttachment()) {
          out.push(...att.getAnnotations());
        }
      } catch (e) {
        // Skip attachments whose annotations can't be read.
      }
    }
    return out;
  } catch (e) {
    return [];
  }
}

function toCreatorModel(c: {
  firstName?: string;
  lastName?: string;
}): CreatorModel {
  const firstName = (c.firstName || "").trim();
  const lastName = (c.lastName || "").trim();
  const name =
    lastName && firstName ? `${lastName}, ${firstName}` : lastName || firstName;
  return { firstName, lastName, name };
}

async function collectionNames(item: Zotero.Item): Promise<string[]> {
  try {
    const cols = await Zotero.Collections.getCollectionsContainingItems([
      item.id,
    ]);
    return cols.map((c) => (c as unknown as { name: string }).name);
  } catch (e) {
    return [];
  }
}

/** Build the `item` model for a (regular) Zotero item. */
export async function buildItemModel(item: Zotero.Item): Promise<ItemModel> {
  const date = (item.getField("date") as string) || "";
  const creators = item.getCreators().map(toCreatorModel);
  return {
    title: (item.getField("title") as string) || "",
    creators,
    authors: creators,
    date,
    year: year(date),
    tags: item.getTags().map((t) => t.tag),
    abstract: (item.getField("abstractNote") as string) || "",
    citekey: getCiteKey(item),
    collections: await collectionNames(item),
    doi: (item.getField("DOI") as string) || "",
    url: (item.getField("url") as string) || "",
    itemType: Zotero.ItemTypes.getName(item.itemTypeID),
    key: item.key,
  };
}

/** Build the `note` model for a Zotero note item (uses its parent for citekey). */
export async function buildNoteModel(
  noteItem: Zotero.Item,
): Promise<NoteModel> {
  const parent = noteItem.parentItem;
  return {
    title: noteItem.getNoteTitle().trim(),
    tags: noteItem.getTags().map((t) => t.tag),
    key: noteItem.key,
    parentTitle: parent ? (parent.getField("title") as string) || "" : "",
    collections: await collectionNames(parent || noteItem),
    citekey: parent ? getCiteKey(parent) : "",
  };
}

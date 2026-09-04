import { seededRandom } from "./seededRandom";
import pathHelper = require("path-browserify");

export function slice(str: string, len: number) {
  return str.length > len ? `${str.slice(0, len - 3)}...` : str;
}

export function fill(
  str: string,
  len: number,
  options: { char: string; position: "start" | "end" } = {
    char: " ",
    position: "end",
  },
) {
  if (str.length >= len) {
    return str;
  }
  return str[options.position === "start" ? "padStart" : "padEnd"](
    len - str.length,
    options.char,
  );
}

export function formatPath(path: string, suffix: string = "") {
  path = Zotero.File.normalizeToUnix(path);
  if (Zotero.isWin) {
    path = path.replace(/\//g, "\\");

    if (path[0] === "\\" && path[1] !== "\\") {
      // Assume it's an UNC path wrongly formatted, e.g. `\wsl.localhost\...` from pathHelper
      path = `\\${path}`;
    }
    return path;
  }
  if (suffix && !path.endsWith(suffix)) {
    path += suffix;
  }
  return path;
}

export async function getFileContent(path: string) {
  const res = await fetch(path);
  return await res.text();
}

/**
 * Write a note's Markdown file, IN PLACE.
 *
 * U23: this used to write a sibling temp file and rename it over the target, so
 * a crash mid-write could never leave a truncated note on disk. That
 * durability came at a cost we measured: a rename replaces the file's inode, so
 * a watcher sees the file *replaced* rather than *modified*, and an editor with
 * the note open answers that by closing and re-opening the document — the
 * cursor jumps to the top, and a multi-column layout can scramble. In a
 * three-minute trace, 38 in-place writes disturbed Obsidian not at all, while
 * every rename-write coincided with a jump.
 *
 * The trade is deliberate and it is a real downgrade: a crash or power loss
 * during the write now leaves a truncated `.md` rather than the intact previous
 * file. It is survivable here because the note itself lives in Zotero and the
 * sync keeps a `baseMd` baseline, so the file can be regenerated — but it is
 * genuinely weaker than what it replaced.
 *
 * Writing in place also means no temp file is created in the vault at all,
 * which retires the earlier dot-prefix workaround for the same problem.
 */
export async function writeNoteFile(filePath: string, content: string) {
  await Zotero.File.putContentsAsync(filePath, content);
}

export function randomString(len: number, seed?: string, chars?: string) {
  if (!chars) {
    chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  }
  if (!len) {
    len = 8;
  }
  let str = "";
  const random = seededRandom(seed);
  for (let i = 0; i < len; i++) {
    const rnum = Math.floor(random() * chars.length);
    str += chars.substring(rnum, rnum + 1);
  }
  return str;
}

function arrayBufferToBase64(buffer: ArrayBufferLike) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return ztoolkit.getGlobal("btoa")(binary);
}

export async function getItemDataURL(item: Zotero.Item) {
  if (addon.data.imageCache[item.id]) {
    return addon.data.imageCache[item.id];
  }
  const path = (await item.getFilePathAsync()) as string;
  const buf = (await IOUtils.read(path)).buffer;
  const dataURL =
    "data:" +
    item.attachmentContentType +
    ";base64," +
    arrayBufferToBase64(buf);
  const keys = Object.keys(addon.data.imageCache);
  // Limit cache size
  while (keys.length > 100) {
    delete addon.data.imageCache[keys.shift() as any];
  }
  addon.data.imageCache[item.id] = dataURL;
  return dataURL;
}

export async function fileExists(path: string): Promise<boolean> {
  if (!path) {
    return false;
  }
  try {
    // IOUtils.exists() will throw error if path is not valid
    return await IOUtils.exists(formatPath(path));
  } catch (e) {
    ztoolkit.log("[fileExists]", e);
    return false;
  }
}

export function jointPath(...paths: string[]) {
  try {
    return formatPath(
      pathHelper.join(...paths.map((p) => p.replaceAll("\\", "/"))),
    );
  } catch (e) {
    ztoolkit.log("[jointPath]", e);
    return "";
  }
}

export function tryDecodeParse(s: string) {
  try {
    return JSON.parse(decodeURIComponent(s));
  } catch (e) {
    return null;
  }
}

export function htmlEscape(doc: Document, str: string) {
  const div = doc.createElement("div");
  const text = doc.createTextNode(str);
  div.appendChild(text);
  return div.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function htmlUnescape(
  str: string,
  options: {
    excludeLineBreak?: boolean;
  } = {},
) {
  const map: Record<string, string> = {
    "&nbsp;": " ",
    "&quot;": '"',
    "&#39;": "'",
  };
  if (!options.excludeLineBreak) {
    map["\n"] = "";
  }
  const re = new RegExp(Object.keys(map).join("|"), "g");
  return str.replace(re, function (match) {
    return map[match as keyof typeof map];
  });
}

export function xhtmlEscape(str: string) {
  return str
    .replace(/&nbsp;/g, "#160;")
    .replace(/<br>/g, "<br/>")
    .replace(/<hr>/g, "<hr/>")
    .replace(/<img([^>]+)>/g, "<img$1/>");
}

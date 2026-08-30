import { getPref } from "../../utils/prefs";
import { getEditorItem, getEditorWindow } from "./adapter";

export function initEditorImagePreviewer(editor: Zotero.EditorInstance) {
  const doc = getEditorWindow(editor).document;
  const openPreview = (e: MouseEvent) => {
    const imgs = doc.querySelector(".primary-editor")?.querySelectorAll("img");
    if (!imgs?.length) {
      return;
    }
    const imageList = Array.from(imgs);
    addon.hooks.onShowImageViewer(
      imageList.map((elem) => (elem as HTMLImageElement)?.src),
      imageList.indexOf(e.target as HTMLImageElement),
      getEditorItem(editor).getNoteTitle(),
    );
  };
  doc.addEventListener("dblclick", (e) => {
    if ((e.target as HTMLElement).tagName === "IMG") {
      openPreview(e);
    }
  });
  doc.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).tagName === "IMG" && e.ctrlKey) {
      openPreview(e);
    }
  });
}

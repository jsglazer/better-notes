declare interface NoteNodeData {
  id: number;
  level: number;
  name: string;
  lineIndex: number;
  endIndex: number;
  link: string;
}

declare interface NoteStatus {
  meta: string;
  content: string;
  tail: string;
  lastmodify: Date;
}

declare interface SyncStatus {
  path: string;
  filename: string;
  md5: string;
  noteMd5: string;
  lastsync: number;
  itemID: number;
  /**
   * File mtime (ms) of the MD file at the last sync. Used by the sync stat-gate
   * to skip re-reading provably-unchanged files. Optional/back-compatible:
   * absent on records written before U2 → stat-gate falls back to full compare.
   */
  mdModified?: number;
  /**
   * The Markdown body (front-matter stripped) the note and file agreed on at the
   * last successful sync — the common ancestor for U2b diff3 3-way auto-merge.
   * Optional/back-compatible: absent → no baseline, so a both-sides change falls
   * back to the manual conflict dialog (pre-U2b behavior).
   */
  baseMd?: string;
}

declare interface MDStatus {
  meta: {
    $version: number;
    $libraryID?: number;
    $itemKey?: string;
  } | null;
  content: string;
  filedir: string;
  filename: string;
  lastmodify: Date;
}

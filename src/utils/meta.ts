export { getMetaField, GENERATED_HEADER_KEYS };

/**
 * Front-matter fields the exporter always regenerates from the live note.
 * A cached copy of any of them is stale by definition (see buildExportHeader /
 * note2md), so it must never be carried back into a re-exported file.
 */
const GENERATED_HEADER_KEYS = [
  "itemKey",
  "libraryID",
  "version",
  "tags",
  "CitationKey",
];

/**
 * Read a field from an exported note's YAML front matter, accepting both the
 * current and the legacy spelling.
 *
 * Files exported before v1.0.5 used `$`-prefixed keys (`$itemKey`,
 * `$libraryID`, `$version`). v1.0.5 dropped the prefix from the *writer* but
 * left every *reader* looking for the old names, so `findAllSyncedFiles`
 * matched nothing ("Detect..." in the Sync Manager could never locate a note)
 * and `doCompare` always read `undefined` for the version. Reading both
 * spellings restores detection without invalidating either file generation.
 */
function getMetaField(
  meta: Record<string, any> | null | undefined,
  name: string,
): any {
  if (!meta) {
    return undefined;
  }
  const bare = name.startsWith("$") ? name.slice(1) : name;
  return meta[bare] !== undefined ? meta[bare] : meta[`$${bare}`];
}

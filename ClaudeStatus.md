# ClaudeStatus — better-notes

Last updated: 2026-06-04

## Current version
v1.0.15

## Current tasks
None pending. Updates 06–12 are complete.

## Files modified (Updates 06–12)

| File | Change |
|------|--------|
| `src/modules/sync/api.ts` | `getSyncNoteIds` now filters out `item.deleted === true` — trashed notes excluded from all sync ops |
| `src/modules/sync/hooks.ts` | `doCompare` returns `NoteAhead` when `lastsync === 0` (first export) vs `UpToDate` when file is missing after prior sync |
| `src/modules/template/controller.ts` | `importTemplateFromClipboard` rewritten: `Services.prompt` dialogs with custom titles, YAML/JSON parse error handling, content type validation, `refresh()` removed to prevent native crash |
| `src/modules/template/editor.ts` | Prevented duplicate "Linked Note" entries in template editor |
| `src/modules/export/api.ts` | BBT citation key used for export filename via `[ExportMDFileNameV2]` template |
| `addon/prefs/sync.xhtml` (or equivalent) | Sync Manager "Clean" UI updated |
| `ItemNoteMD03.js` | Template updated: level-1 header with BBT citation key as first content line; `## Running Notes` section added at bottom |
| `package.json` | Version bumped 1.0.8 → 1.0.15 across updates |

## Key decisions

- **Patch location**: `patchNoteCreation` is called per-window in `onMainWindowLoad` (not global `onStartup`) because it patches `win.ZoteroPane` which is window-scoped.
- **Export fix**: `export/api.ts` uses direct item creation to avoid triggering the template picker patch.
- **Delete detection**: Zotero notifier `delete`/`item` events; `isSyncNote` checks pref store key only.
- **xpi location**: After every build, `build/better-notes.xpi` is moved to the project root as `better-notes.xpi`.
- **Clipboard import crash**: `refresh()` removed from `importTemplateFromClipboard` — it was async and unawaited, so errors from `updatePreview()` → `new AsyncFunction(template JS)` caused a native uncatchable crash. Template is saved to prefs; editor picks it up on next open.
- **Services.prompt parent**: All `Services.prompt.confirm/alert` calls use `null as unknown as mozIDOMWindowProxy` — `Zotero.getMainWindow()` returns `MainWindow` which is type-incompatible; `null` is valid for XUL modal dialogs.
- **First export vs deleted file**: `lastsync === 0` distinguishes "never exported" (create file) from `lastsync > 0` with missing file (file was deleted from Obsidian — skip).

## Open issues
None.

## Update log summary

| Update | Version | Summary |
|--------|---------|---------|
| Update03 | 1.0.6 | Fix blank note on Add; settings label → "Better Notes"; GitHub link → jsglazer |
| Update04 | 1.0.7 | Double-click to accept template; MD export bullets use `-` |
| Update05 | 1.0.8 | Auto-remove deleted Zotero notes from Sync Manager |
| Update06–09 | 1.0.9–1.0.11 | BBT filename, sync cleanup fixes, BN context menu, Link Creator shortcut |
| Update10 | 1.0.12–1.0.13 | Fix blank-line export, no auto-recreate deleted files, exclude trashed notes from sync |
| Update11 | 1.0.13 | First-export blocked by no-recreate logic — fixed with `lastsync === 0` check |
| Update12 | 1.0.14–1.0.15 | Clipboard template import crash — removed `refresh()`, added content validation, custom dialog titles |

# ClaudeStatus — better-notes

Last updated: 2026-06-03

## Current version
v1.0.8

## Current tasks
None pending. Updates 03–05 are complete.

## Files modified (Updates 03–05)

| File | Change |
|------|--------|
| `src/modules/patches/notes.ts` | Added `patchNoteCreation(win)` — intercepts ZoteroPane.newNote / newChildNote to show template picker instead of creating a blank note |
| `src/hooks.ts` | Import + call `patchNoteCreation(win)` in `onMainWindowLoad`; added `delete`/`item` handler in `onNotify` to auto-remove deleted notes from sync list |
| `src/modules/export/api.ts` | Replaced `ZoteroPane.newNote()` with direct `new Zotero.Item("note")` + `saveTx` to avoid triggering the new patch during exports |
| `src/modules/template/picker.ts` | Saves `createdNoteId`; calls `onOpenNote` after template insertion so the new note opens automatically |
| `src/extras/templatePicker.ts` | Added `onActivate` prop to VirtualizedTableHelper for double-click (and Enter) to accept a template |
| `src/extras/convert.ts` | Added `bullet: "-"` to `remarkStringify` so MD export uses `-` instead of `*` for bullets |
| `addon/locale/*/addon.ftl` (6 files) | Changed `pref-title = better-notes` → `pref-title = Better Notes` |
| `addon/chrome/content/preferences.xhtml` | Replaced three windingwind GitHub links with single jsglazer homepage link |
| `package.json` | Version bumped 1.0.5 → 1.0.8 across updates |
| `.claude/settings.local.json` | Added approved Bash permission patterns |

## Key decisions

- **Patch location**: `patchNoteCreation` is called per-window in `onMainWindowLoad` (not global `onStartup`) because it patches `win.ZoteroPane` which is window-scoped.
- **Export fix**: export/api.ts was using `ZoteroPane.newNote()` to create temp notes; after patching that method it would have triggered the template picker. Fixed with direct item creation.
- **Delete detection**: Zotero's notifier fires `delete`/`item` events; `isSyncNote` only checks the pref store key so no item fetch is needed (item is already gone).
- **xpi location**: After every build, `build/better-notes.xpi` must be moved to the project root as `better-notes.xpi`.

## Open issues
None.

## Update log summary

| Update | Version | Summary |
|--------|---------|---------|
| Update03 | 1.0.6 | Fix blank note on Add; settings label → "Better Notes"; GitHub link → jsglazer |
| Update04 | 1.0.7 | Double-click to accept template; MD export bullets use `-` |
| Update05 | 1.0.8 | Auto-remove deleted Zotero notes from Sync Manager |

# ClaudeStatus — better-notes

Last updated: 2026-06-04

## Summary
This session fixed the Tools menu keyboard shortcut hints (they were inline with labels instead of right-aligned), added a new ⌃⌥P shortcut to open Zotero's Plugins window, and audited/updated the project's `.claude/settings.local.json` permission allowlist. All changes are committed and pushed.

## Current Version
v1.0.16

## Current Branch
`main` — last commit `87878e4` (docs: add ⌃⌥P shortcut to README keyboard shortcuts table)

## Tasks Completed
- Fixed shortcut hint alignment in Tools menu: moved ⌃⌥L/M/T out of FTL label strings and into XUL `acceltext` attribute via `onShowing` callbacks in `menu.ts` (all 6 locales updated)
- Added ⌃⌥P keyboard shortcut to open Zotero Plugins window (`shortcuts.ts`)
- Updated README keyboard shortcuts table with ⌃⌥P entry
- Audited and updated `.claude/settings.local.json`: added `find *`, `grep *`, `ls *`, `git status/log/diff`, `mv` for xpi, `unzip *`, `mkdir -p *`, `Read(/private/tmp/**)`, removed narrow/redundant entries

## Files Modified

| File | Change |
|------|--------|
| `src/modules/shortcuts.ts` | Added `KeyP` case: opens Zotero Plugins via `Zotero.openInViewer('chrome://mozapps/content/extensions/aboutaddons.html', ...)` |
| `src/modules/menu.ts` | Added `onShowing` callbacks on Link Creator, Sync Manager, Template Editor menu items to set `acceltext` attribute |
| `addon/locale/en-US/mainWindow.ftl` | Removed `  ⌃⌥L/M/T` from label strings |
| `addon/locale/de/mainWindow.ftl` | Removed `  ⌃⌥M/T` from label strings |
| `addon/locale/it-IT/mainWindow.ftl` | Removed `  ⌃⌥M/T` from label strings |
| `addon/locale/ru-RU/mainWindow.ftl` | Removed `  ⌃⌥M/T` from label strings |
| `addon/locale/tr-TR/mainWindow.ftl` | Removed `  ⌃⌥M/T` from label strings |
| `addon/locale/zh-CN/mainWindow.ftl` | Removed `  ⌃⌥M/T` from label strings |
| `README.md` | Added ⌃⌥P row to keyboard shortcuts table |
| `.claude/settings.local.json` | Audited and expanded permission allowlist |

## Key Decisions

- **`acceltext` via `onShowing`**: Zotero's `MenuManager.registerMenu` API has no native `acceltext` field, so `context.menuElem.setAttribute("acceltext", "...")` is called each time the menu opens. This is a no-op after the first call and is the only available hook point.
- **Plugins shortcut implementation**: Found exact command from Zotero source (`zoteroPane.xhtml` extracted from `omni.ja`): `Zotero.openInViewer('chrome://mozapps/content/extensions/aboutaddons.html', { onLoad: ZoteroStandalone.updateAddonsPane })`. The `onLoad` callback is retrieved via `(Zotero.getMainWindow() as any).ZoteroStandalone?.updateAddonsPane` to avoid type errors.
- **Native Plugins menu item**: Cannot show ⌃⌥P hint in Zotero's own "Tools > Plugins" menuitem — plugins have no API to modify native Zotero menu items.
- **Cannot remap native Zotero shortcuts**: Plugin can only *add* new shortcuts (via `keydown` listeners). Zotero 7 exposes no API to override existing native keybindings.

## Open Issues
None.

## Update Log Summary

| Update | Version | Summary |
|--------|---------|---------|
| Update03 | 1.0.6 | Fix blank note on Add; settings label → "Better Notes"; GitHub link → jsglazer |
| Update04 | 1.0.7 | Double-click to accept template; MD export bullets use `-` |
| Update05 | 1.0.8 | Auto-remove deleted Zotero notes from Sync Manager |
| Update06–09 | 1.0.9–1.0.11 | BBT filename, sync cleanup fixes, BN context menu, Link Creator shortcut |
| Update10 | 1.0.12–1.0.13 | Fix blank-line export, no auto-recreate deleted files, exclude trashed notes from sync |
| Update11 | 1.0.13 | First-export blocked by no-recreate logic — fixed with `lastsync === 0` check |
| Update12 | 1.0.14–1.0.15 | Clipboard template import crash — removed `refresh()`, added content validation, custom dialog titles |
| Update12 (cont.) | 1.0.15–1.0.16 | Right-align shortcut hints via `acceltext`; add ⌃⌥P for Plugins window |

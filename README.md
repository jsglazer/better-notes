# Enhanced Notes

[![GitHub release](https://img.shields.io/github/v/release/jsglazer/enhanced-notes?logo=github)](https://github.com/jsglazer/enhanced-notes/releases) [![License](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/jsglazer/enhanced-notes/blob/main/LICENSE) [![Made with Claude](https://img.shields.io/badge/Made_with-Claude-D97756?logo=anthropic)](https://claude.ai) [![Gemini Flash Antigravity](https://img.shields.io/badge/Gemini%20Flash-Antigravity-4f86f7?logo=google-gemini&logoColor=white)](https://github.com/google-gemini) [![CI](https://github.com/jsglazer/enhanced-notes/actions/workflows/ci.yml/badge.svg)](https://github.com/jsglazer/enhanced-notes/actions/workflows/ci.yml) [![CodeQL](https://github.com/jsglazer/enhanced-notes/actions/workflows/codeql.yml/badge.svg)](https://github.com/jsglazer/enhanced-notes/actions/workflows/codeql.yml) [![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/jsglazer/enhanced-notes/badge)](https://scorecard.dev/viewer/?uri=github.com/jsglazer/enhanced-notes)

A Zotero plugin to expand the capability of notes and to sync notes to other locations (e.g., Obsidian). This is a fork of [windingwind's zotero-better-notes](https://github.com/windingwind/zotero-better-notes). This fork adds: a **sandboxed Liquid template language** (replacing the original arbitrary-JavaScript template engine), **native annotation color labels**, **multiple synced notes per item**, **automatic 3-way merge** of non-conflicting sync edits, keyboard shortcuts, more sync management options, cleaner exports to Obsidian, better error handling, more menu items, and other enhancements.

## Installation

1. Download `enhanced-notes.xpi` from above or from the [releases page](https://github.com/jsglazer/enhanced-notes/releases)
2. In Zotero: **Tools → Plugins → gear icon → Install Plugin From File**
3. Select the downloaded `.xpi` file and restart Zotero

## Keyboard Shortcuts

| Shortcut | Action                                 |
| -------- | -------------------------------------- |
| `⌃⌥L`    | Open the Link Creator                  |
| `⌃⌥S`    | Run sync (syncs all notes immediately) |
| `⌃⌥M`    | Open Sync Manager                      |
| `⌃⌥T`    | Open Template Editor                   |
| `⌃⌥P`    | Open Zotero Plugins window             |

## Features

- **Templates** — sandboxed **Liquid** templates (`{{ item.title }}`, `{% for %}`, filters like `| year`) with a live-preview editor, **autocomplete**, and a grouped **click-to-insert palette** of fields, filters, and tags (all backed by one shared catalog) — safe by design, no arbitrary JavaScript. A built-in **"Convert legacy JavaScript template to Liquid"** command (Template Editor → Options) migrates older `${ … }` templates automatically, flagging anything that needs a manual touch-up. The built-in **system templates** (export filename/content, quick-insert, etc.) are **user-editable** and your changes persist across restarts — their names are reserved, and **Options → Reset** restores the shipped default
- **File Sync** — sync notes to Markdown files on disk, with **automatic 3-way merge** of non-conflicting edits and a diff view for true conflicts. Sync runs on a timer (default every 30 s) and works **in the background** — edits you make to a note's `.md` in Obsidian flow back into Zotero even while Zotero is unfocused. A note you have **open and focused** in Zotero refreshes once you stop typing in it for a few seconds, so an external edit is never imported over keystrokes in progress
- **Sync Manager** (`⌃⌥M`) — see every synced note, its file path and last sync time; sync or unsync a selection; clean up entries whose file has been deleted. **Detect…** scans a folder and adopts any Markdown file carrying the exporter's front matter. **Link…** covers the case Detect can't: pick a note in Zotero's item pane, choose an existing `.md` file, and say which side wins (note → file, or file → note) — the pair becomes a normal synced note and the file is rewritten with proper front matter. That rescues files with no front matter at all, such as one produced by a plain Markdown export with the YAML header unchecked
- **Multiple notes per item** — each note exports to its own file; prompts for a short ID on a name clash
- **Annotation color labels** — assign a meaning to each highlight color (e.g. Yellow = "Important"); shown before each exported annotation, used to **group annotations into per-label sections** (`{% annotations grouped %}`) in a configurable order, and applied throughout the reader's own color UI — the new-highlight color picker, the sidebar's color-filter row, and **changing an existing annotation's color** — so Zotero's built-in color names (e.g. "Yellow") are renamed everywhere, not just when the highlight is first created. Also exposed as JSON at `/enhanced-notes/color-labels` on Zotero's local HTTP server (the one Better BibTeX registers `/better-bibtex/...` on) so other tools — e.g. [zotero-manager](https://github.com/jsglazer/zotero-manager)'s **Sync from Enhanced Notes** — can read the mapping instead of maintaining a second copy
- **Item tagging endpoint** — `POST /enhanced-notes/tag` on that same local HTTP server lets an external tool add tags to an item in your library. Zotero's own local API is read-only by construction (every endpoint is `GET`-only) and Better BibTeX's JSON-RPC is read/export only, so without this there is no way for a local tool to write a tag. Send `{ "itemKey": "ABCD2345", "libraryID": 1, "tags": ["2026-B", "POGO801"] }` and get back `{ itemKey, added, existing }`. Tags are added as **manual** tags, tags already on the item are reported and never duplicated, and the item isn't saved at all when nothing changed — so a tool can post the same tags repeatedly without bumping the item version or provoking a sync round-trip. An `itemKey` naming an attachment or child note tags its **parent**, so the source gets tagged rather than the PDF hanging off it. Built for an Obsidian Templater workflow that tags the cited work with the class it was assigned for. (Note: Zotero drops any request carrying an `Origin` header, so a browser-context caller — including Obsidian's `requestUrl` — can't reach this; use a plain HTTP client.)
- **Settings Sync** — keep your colour labels, note templates, editor options and sync settings identical on every computer. Settings travel inside a single note in your library, carried by **Zotero's own sync** — no cloud folder, no extra account, nothing to configure per machine beyond ticking the box. (Zotero syncs library data but never `prefs.js`, so a library item is the only Zotero-native channel available to a plugin.) The note is filed under an **Enhanced Notes** collection and tagged; when settings change on another computer you're shown exactly which ones differ and asked before anything is applied. Machine-specific state — per-note sync paths, window sizes — is deliberately never synced. **Export…/Import…** buttons write the same payload to a JSON file, for moving settings between libraries that don't share a Zotero account. Off by default, since enabling it creates the note in your library
- **Note Linking** — bidirectional inbound/outbound links between notes
- **Export** — export notes to Markdown, PDF, DOCX, LaTeX, or FreeMind
- **Import** — import Markdown files as Zotero notes
- **Math** — KaTeX math rendering in notes
- **Command Palette** — type `/` in any note to access formatting and linking commands
- **Workspace** — dedicated note workspace with outline, context, and relation panes
- **Relation Graph** — visualize connections between notes

## Command Palette

Type `/` in the note editor (or press `⌃/`) to open the command palette. Quick abbreviations:

| Abbreviation       | Command              |
| ------------------ | -------------------- |
| `it`               | Insert Template      |
| `ob`               | Insert Outbound Link |
| `ib`               | Insert Inbound Link  |
| `ic`               | Insert Citation      |
| `h1` / `h2` / `h3` | Headings             |
| `ul` / `ol`        | Lists                |
| `mb`               | Math Block           |
| `tb`               | Table                |
| `cf`               | Clear Formatting     |

## Building from Source

```bash
npm install
npm run build
```

Output: `build/enhanced-notes.xpi`

## Credits

**Enhanced Notes is a fork of [windingwind's zotero-better-notes](https://github.com/windingwind/zotero-better-notes)** — the original plugin, and the majority of its codebase, was created by windingwind. This fork reuses substantial portions of that code and builds on it with the changes described above (sandboxed Liquid templates, native annotation color labels, multiple synced notes per item, automatic 3-way merge, and other enhancements). Enhanced Notes is maintained independently by [Josh Glazer](https://github.com/jsglazer) and is not affiliated with or endorsed by windingwind — please direct Enhanced Notes-specific issues, questions, and feature requests to [this repo's issue tracker](https://github.com/jsglazer/enhanced-notes/issues) or [wiki](https://github.com/jsglazer/enhanced-notes/wiki), not upstream.

## License

[GNU AGPL-3.0-or-later](LICENSE), the same license as the upstream project it's forked from.

(Re) Built with Claude!

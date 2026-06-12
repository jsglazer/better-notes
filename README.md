# Better Notes

[![GitHub release](https://img.shields.io/github/v/release/jsglazer/better-notes?logo=github)](https://github.com/jsglazer/better-notes/releases)
[![GitHub license](https://img.shields.io/github/license/jsglazer/better-notes)](https://github.com/jsglazer/better-notes/blob/main/LICENSE)
[![Made with Claude](https://img.shields.io/badge/Made_with-Claude-D97756?logo=anthropic)](https://claude.ai)

A Zotero plugin to expand the capability of notes and to sync notes to other locations (e.g., Obsidian). 
This is a fork of [windingwind's zotero-better-notes](https://github.com/windingwind/zotero-better-notes).  This fork includes: keyboard shortcuts, more sync management options, cleaner exports to Obsidian, better error handling on invalid template imports, more menu items, and other enhancements.


## Installation

1. Download `better-notes.xpi` from above or from the [releases page](https://github.com/jsglazer/better-notes/releases)
2. In Zotero: **Tools → Plugins → gear icon → Install Plugin From File**
3. Select the downloaded `.xpi` file and restart Zotero

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `⌃⌥S` | Run sync (syncs all notes immediately) |
| `⌃⌥M` | Open Sync Manager |
| `⌃⌥T` | Open Template Editor |
| `⌃⌥P` | Open Zotero Plugins window |

## Features

- **Templates** — create and apply note templates with a Monaco-based editor
- **File Sync** — sync notes to markdown files on disk with diff view
- **Note Linking** — bidirectional inbound/outbound links between notes
- **Export** — export notes to Markdown, PDF, DOCX, LaTeX, FreeMind, or AsciiDoc
- **Import** — import Markdown files as Zotero notes
- **Math** — KaTeX math rendering in notes
- **Command Palette** — type `/` in any note to access formatting and linking commands
- **Workspace** — dedicated note workspace with outline, context, and relation panes
- **Relation Graph** — visualize connections between notes

## Command Palette

Type `/` in the note editor (or press `⌃/`) to open the command palette. Quick abbreviations:

| Abbreviation | Command |
|---|---|
| `it` | Insert Template |
| `ob` | Insert Outbound Link |
| `ib` | Insert Inbound Link |
| `ic` | Insert Citation |
| `h1` / `h2` / `h3` | Headings |
| `ul` / `ol` | Lists |
| `mb` | Math Block |
| `tb` | Table |
| `cf` | Clear Formatting |

## Building from Source

```bash
npm install
npm run build
```

Output: `build/better-notes.xpi`

## Credits

Original plugin by [windingwind](https://github.com/windingwind/zotero-better-notes). Fork maintained by [Josh Glazer](https://github.com/jsglazer).

## License

MIT

(Re) Built with Claude!

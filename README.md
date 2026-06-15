# Better Notes

[![GitHub release](https://img.shields.io/github/v/release/jsglazer/better-notes?logo=github)](https://github.com/jsglazer/better-notes/releases)
[![GitHub license](https://img.shields.io/github/license/jsglazer/better-notes)](https://github.com/jsglazer/better-notes/blob/main/LICENSE)
[![Made with Claude](https://img.shields.io/badge/Made_with-Claude-D97756?logo=anthropic)](https://claude.ai)
[![CI](https://github.com/jsglazer/better-notes/actions/workflows/ci.yml/badge.svg)](https://github.com/jsglazer/better-notes/actions/workflows/ci.yml)
[![CodeQL](https://github.com/jsglazer/better-notes/actions/workflows/codeql.yml/badge.svg)](https://github.com/jsglazer/better-notes/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/jsglazer/better-notes/badge)](https://scorecard.dev/viewer/?uri=github.com/jsglazer/better-notes)

A Zotero plugin to expand the capability of notes and to sync notes to other locations (e.g., Obsidian). 
This is a fork of [windingwind's zotero-better-notes](https://github.com/windingwind/zotero-better-notes).  This fork adds: a **sandboxed Liquid template language** (replacing the original arbitrary-JavaScript template engine), **native annotation color labels**, **multiple synced notes per item**, **automatic 3-way merge** of non-conflicting sync edits, keyboard shortcuts, more sync management options, cleaner exports to Obsidian, better error handling, more menu items, and other enhancements.


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

- **Templates** — sandboxed **Liquid** templates (`{{ item.title }}`, `{% for %}`, filters like `| year`) with a live-preview editor — safe by design, no arbitrary JavaScript. A built-in **"Convert legacy JavaScript template to Liquid"** command (Template Editor → Options) migrates older `${ … }` templates automatically, flagging anything that needs a manual touch-up
- **File Sync** — sync notes to Markdown files on disk, with **automatic 3-way merge** of non-conflicting edits and a diff view for true conflicts
- **Multiple notes per item** — each note exports to its own file; prompts for a short ID on a name clash
- **Annotation color labels** — assign a meaning to each highlight color (e.g. Yellow = "Important"); shown before each exported annotation, or used to **group annotations into per-label sections** (`{% annotations grouped %}`) in a configurable order
- **Note Linking** — bidirectional inbound/outbound links between notes
- **Export** — export notes to Markdown, PDF, DOCX, LaTeX, or FreeMind
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

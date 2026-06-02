# Better Notes

A Zotero plugin to expand the capability of notes and sync notes to other locations.

This is a fork of [windingwind's zotero-better-notes](https://github.com/windingwind/zotero-better-notes).

## Installation

1. Download `better-notes.xpi` from the [releases page](https://github.com/jsglazer/better-notes/releases)
2. In Zotero: **Tools → Add-ons → gear icon → Install Add-on From File**
3. Select the downloaded `.xpi` file and restart Zotero

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `⌃⌥M` | Open Sync Manager |
| `⌃⌥T` | Open Template Editor |

## Features

- **Workspace** — dedicated note workspace with outline, context, and relation panes
- **Templates** — create and apply note templates with a Monaco-based editor
- **Note Linking** — bidirectional inbound/outbound links between notes
- **File Sync** — sync notes to markdown files on disk with diff view
- **Export** — export notes to Markdown, PDF, DOCX, LaTeX, FreeMind, or AsciiDoc
- **Import** — import Markdown files as Zotero notes
- **Math** — KaTeX math rendering in notes
- **Relation Graph** — visualize connections between notes
- **Command Palette** — type `/` in any note to access formatting and linking commands

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

AGPL-3.0-or-later

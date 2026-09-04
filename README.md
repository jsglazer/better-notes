# Enhanced Notes

[![GitHub release](https://img.shields.io/github/v/release/jsglazer/enhanced-notes?logo=github)](https://github.com/jsglazer/enhanced-notes/releases) [![License](https://img.shields.io/badge/License-AGPL--3.0--or--later-blue.svg)](https://github.com/jsglazer/enhanced-notes/blob/main/LICENSE) [![Made with Claude](https://img.shields.io/badge/Made_with-Claude-D97756?logo=anthropic)](https://claude.ai) [![Gemini Flash Antigravity](https://img.shields.io/badge/Gemini%20Flash-Antigravity-4f86f7?logo=google-gemini&logoColor=white)](https://github.com/google-gemini) [![CI](https://github.com/jsglazer/enhanced-notes/actions/workflows/ci.yml/badge.svg)](https://github.com/jsglazer/enhanced-notes/actions/workflows/ci.yml) [![CodeQL](https://github.com/jsglazer/enhanced-notes/actions/workflows/codeql.yml/badge.svg)](https://github.com/jsglazer/enhanced-notes/actions/workflows/codeql.yml) [![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/jsglazer/enhanced-notes/badge)](https://scorecard.dev/viewer/?uri=github.com/jsglazer/enhanced-notes)

A Zotero plugin to expand the capability of notes and to sync notes to other locations (e.g., Obsidian). This is a fork of [windingwind's zotero-better-notes](https://github.com/windingwind/zotero-better-notes). This fork adds: a **sandboxed Liquid template language** (replacing the original arbitrary-JavaScript template engine), **native annotation color labels**, **multiple synced notes per item**, **automatic 3-way merge** of non-conflicting sync edits, a **richer note editor** (live math and callout rendering, code highlighting, collapsible sections, markdown shortcuts, custom CSS), a **faithful Markdown round trip**, keyboard shortcuts, more sync management options, cleaner exports to Obsidian, better error handling, more menu items, and other enhancements.

## Installation

**Requires Zotero 8** (minimum 8.0-beta.21).

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
- **Adopt a vault file from Obsidian** — `POST /enhanced-notes/link` on that same local HTTP server hands an existing Markdown file to Zotero and starts syncing it. Send `{ "citekey": "pindyck-Microeconomics-2018", "path": "/Users/you/Vault/ch3-a.md" }` and get back `{ noteKey, noteID, itemKey, created, path, filename }`. Zotero finds the item by cite key, creates a child note from the file's content (**the file wins**), registers the pairing, and re-exports so the file gains its front matter. The note key comes back so a Templater script can record it. Pairing is keyed on the **file**, not the item, so one book can own a note per chapter; posting the same file again returns the existing note with `created: false` rather than duplicating it, making the call safe to run on every save. A cite key matching zero or several items is an error (404 / 409), never a guess — attaching a chapter note to the wrong book is worse than a failed call. (Same `Origin`-header caveat as the tagging endpoint: use a plain HTTP client, not Obsidian's `requestUrl`.)
- **Settings Sync** — keep your colour labels, note templates, editor options and sync settings identical on every computer. Settings travel inside a single note in your library, carried by **Zotero's own sync** — no cloud folder, no extra account, nothing to configure per machine beyond ticking the box. (Zotero syncs library data but never `prefs.js`, so a library item is the only Zotero-native channel available to a plugin.) The note is filed under an **Enhanced Notes** collection and tagged; when settings change on another computer you're shown exactly which ones differ and asked before anything is applied. Machine-specific state — per-note sync paths, window sizes — is deliberately never synced. **Export…/Import…** buttons write the same payload to a JSON file, for moving settings between libraries that don't share a Zotero account. Off by default, since enabling it creates the note in your library
- **Rename** — a toolbar button that renames the note. Zotero has no note-title field (it derives the title from the note's first line), so there is otherwise no direct way to change it
- **Link Creator** (`⌃⌥L`) — build links between notes in either direction: an **outbound** link from this note to another, or an **inbound** link inserted into another note pointing back here, with a note picker, an outline picker for linking to a specific heading, and a live preview of the target
- **Export** — export notes to Markdown, PDF, DOCX, LaTeX, or FreeMind
- **Import** — import Markdown files as Zotero notes, and optionally keep syncing to them. **New Note → Import from Markdown File** creates standalone notes; the item pane's **Notes + → Import Item Note from Markdown File** attaches them to the selected item instead
- **Math** — KaTeX math rendering, both in exports and **live in the note editor**: a formula displays as rendered math while you read, and reverts to editable TeX the moment you click into it
- **Command Palette** — type `/` in any note to access formatting and linking commands
- **Workspace** — dedicated note workspace with a tree outline and context panes
- **Readable headings** — headings in the editor are styled as headings (size, weight, and a rule under the top two levels) rather than inheriting body text, so a note's structure is visible while you write
- **Faithful Markdown round trip** — the `.md` mirrors the note rather than reformatting it. Consecutive lines stay consecutive and a deliberate blank line stays a blank line; no blank line is forced around a heading or before a list; nested bullets are indented with tabs, the way Obsidian writes them; and highlights or coloured text inside a bullet survive syncing in both directions. Edits you make in either app are not undone by the next sync
- **Callouts** — Obsidian's `> [!note]`, `> [!warning]`, `> [!tip]` and the rest render as coloured, icon-titled callouts in Zotero and stay callouts in your vault. The marker is ordinary text in an ordinary block quote, so both apps render the same note from the same characters
- **Code blocks** — syntax highlighting for bash, CSS, Go, Java, JavaScript/TypeScript, JSON, Markdown, Python, R, SQL, XML/HTML and YAML; anything else is auto-detected
- **Collapsible sections** — click the twisty beside a heading to fold everything under it. Folding is a view state and never edits the note, so it cannot trigger a sync
- **Markdown shortcuts** — type `## ` for a heading, `- ` for a bullet, `1. ` for a numbered list, `> ` for a quote, a triple-backtick fence (optionally with a language, such as `py`) for a code block, or `**bold**`, `*italic*`, `` `code` ``, `~~strike~~` inline
- **Comfortable reading width** — optional cap on the width of text blocks in a wide window; tables and images still use the full pane
- **Editor options** — every editor enhancement above (callouts, code highlighting, collapsible sections, markdown shortcuts, KaTeX rendering, reading width) is individually switchable in Settings → Enhanced Notes → Note Editor
- **Custom CSS** — restyle the note editor from Settings → Enhanced Notes. Your rules are applied after the plugin's own, so they win, and they take effect immediately in notes you already have open. Presentation only: the note content and the synced Markdown are untouched

## Creating a Template

Templates generate note content from a Zotero item. They are written in **Liquid** — a small, sandboxed template language: it can read the data the plugin gives it and nothing else (no file system, no network, no arbitrary JavaScript).

Open the editor with `⌃⌥T`, or **Tools → Template Editor**.

### Walkthrough: a "Textbook Section" template

**1. Start the template.** Click **New** for a blank one, or select a template that is close to what you want and click **Duplicate** — the system templates make good starting points, and duplicating leaves the original untouched.

**2. Name it and set its type.** Set the type to `item` and the name to `Textbook Section`; it is stored as `[item]Textbook Section`. The type decides how the template runs:

| Type     | Purpose                                                                       |
| -------- | ----------------------------------------------------------------------------- |
| `item`   | Runs against one or more selected Zotero items — the usual choice             |
| `text`   | A reusable snippet inserted into an existing note                             |
| `system` | Built-in templates the plugin itself calls (export filename, quick insert, …) |

**3. Write it.** Click the palette chips to insert tokens at the cursor rather than typing them from memory:

```liquid
<!--liquid-->
<!--markdown-->
# {{ item.citekey | default: item.title }}

Sections:
Pages:

## Summary

- **Citekey:** {{ item.citekey }}
- **Author:** {% for a in item.authors %}{{ a.lastName }}{% unless forloop.last %}, {% endunless %}{% endfor %}
- **Year:** {{ item.date | year }}

## Take-aways

## Topics
```

What each part is doing:

- `<!--liquid-->` **must be the first line.** Without it the template is not treated as Liquid and will not run.
- `<!--markdown-->` lets you write Markdown (`#`, `-`, `**bold**`) instead of raw HTML; the output is converted for you.
- `{{ … }}` inserts a value. `{% … %}` is logic — loops, conditions — and prints nothing itself.
- `| default:` and `| year` are **filters**: they transform the value to their left. Here, fall back to the title when there is no citekey, and reduce a full date to just the year.
- The `{% for %}` loop prints each author's surname, and `{% unless forloop.last %}` adds `, ` between them but not after the final one.

**4. Save**, then use it: select the item in your library and choose **New Item Note from Template**, or type `/it` in an open note.

Use the **Preview** pane while editing to see the result against a real item before saving.

### What the palette buttons mean

| Group           | What it is                                                                                                                                                                                                                                                                                                                             |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Syntax**      | The `<!-- … -->` header lines. `liquid header` is required; `markdown` renders your output as Markdown; `add tags` applies tags to the note after rendering                                                                                                                                                                            |
| **Variables**   | The objects you can read: `item` (the item), `items` (all selected), `note` (the target note), `now` (current date/time)                                                                                                                                                                                                               |
| **Item fields** | Properties of `item` — `title`, `authors`, `creators`, `date`, `year`, `tags`, `abstract`, `citekey`, `collections`, `doi`, `url`, `itemType`, `key`                                                                                                                                                                                   |
| **Note fields** | Properties of `note` — `title`, `tags`, `key`, `parentTitle`, `collections`, `citekey`                                                                                                                                                                                                                                                 |
| **Filters**     | Transformations applied with `\|`. Plugin-specific: `year`, `oneline` (flatten newlines, handy for abstracts), `sanitize_filename`, `md`. The rest are standard Liquid: `date`, `default`, `join`, `split`, `upcase`, `downcase`, `capitalize`, `strip`, `truncate`, `replace`, `size`, `first`, `last`, `append`, `prepend`, `escape` |
| **Tags**        | Logic blocks: `if` / `unless` for conditions, `for` to loop, `assign` and `capture` for variables, `comment` for notes to yourself. `annotations` emits the item's annotations, and `annotations (grouped)` buckets them by colour label                                                                                               |

Hover any chip for a one-line description — the palette and the editor's autocomplete are generated from the same catalog, so they never disagree.

Full reference: [docs/liquid-templates.md](docs/liquid-templates.md).

## Command Palette

Type `/` in the note editor (or press `⌃/`) to open the command palette. Quick abbreviations:

| Abbreviation       | Command              |
| ------------------ | -------------------- |
| `it`               | Insert Template      |
| `ob`               | Insert Outbound Link |
| `ib`               | Insert Inbound Link  |
| `ic`               | Insert Citation      |
| `oa`               | Open Attachment      |
| `csl`              | Copy Section Link    |
| `cll`              | Copy Line Link       |
| `rt`               | Refresh Templates    |
| `h1` / `h2` / `h3` | Headings             |
| `pg`               | Paragraph            |
| `ul` / `ol`        | Lists                |
| `bq`               | Block Quote          |
| `ms`               | Monospaced           |
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

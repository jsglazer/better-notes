# Note Templates

Enhanced Notes templates let you generate note content (and exported file names/contents) from your Zotero items. Templates are written in a **sandboxed [Liquid](https://liquidjs.com/)** language.

> **Looking for syntax?** The full reference — sentinel header, the `item`/`note`
> data model, filters, tags, side effects, and the built-in (system) templates —
> lives in **[liquid-templates.md](./liquid-templates.md)**. This page covers
> using, importing, and sharing templates.

> **Upgrading from the old JavaScript templates?** The original arbitrary-JS
> engine (`${ … }` / `${{ … }}$` scripts and `// @` pragmas) was removed for
> safety — a shared template could read your files or modify your library.
> Open the Template Editor → **Options → "Convert legacy JavaScript template to
> Liquid"** to migrate an old template; anything that can't be auto-converted is
> flagged for a manual touch-up.

## Template structure

A template has two parts:

- **Name** — starts with a type tag in brackets: `[item]…` (renders from one or more selected items) or `[text]…` (a basic template with no item). The name's prefix selects what data the template receives.
- **Content** — the Liquid template body, beginning with a `<!--liquid-->` sentinel line. See [liquid-templates.md](./liquid-templates.md#anatomy).

Built-in templates (e.g. `[QuickInsertV3]`, `[ExportMDFileNameV2]`) have reserved names and are run automatically by the plugin — see [the built-in templates table](./liquid-templates.md#built-in-system-templates).

## Use a template

Open a note (or the workspace), and in the editor toolbar click **Insert Template**. Pick a template and it is inserted at the cursor line. You can browse community templates [here](https://github.com/windingwind/zotero-better-notes/discussions/categories/note-templates).

## Import a template

1. Copy a template share-code (YAML or JSON — see below).
2. In the Zotero menu bar: **Tools → New Template from Clipboard**.
3. Confirm.

## Share a template

1. Open the Template Editor (menu → **Note Template Editor**).
2. Select the template in the list.
3. **Options → Copy share code**.

A share-code is YAML (preferred for multi-line content) or JSON with a `name` and a `content` field:

```yaml
name: "[text] Current Time"
content: |-
  <!--liquid-->
  <!--markdown-->
  **Current Time**: {{ now | date: "%Y-%m-%d %H:%M" }}
```

```json
{
  "name": "[text] Current Time",
  "content": "<!--liquid-->\n<!--markdown-->\n**Current Time**: {{ now | date: \"%Y-%m-%d %H:%M\" }}"
}
```

Post templates to share [here](https://github.com/windingwind/zotero-better-notes/discussions/categories/note-templates).

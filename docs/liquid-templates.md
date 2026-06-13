# Note Templates (Liquid)

> **Status:** the template engine is migrating from the legacy JavaScript syntax
> to a sandboxed [Liquid](https://liquidjs.com/) engine (see the conversion plan).
> During the transition both run side-by-side; a template opts into Liquid with a
> `<!--liquid-->` first line. This document describes the new Liquid system.

## Why Liquid

Legacy templates were arbitrary JavaScript executed with full plugin privileges —
a shared/imported template could read your files, hit the network, or modify your
library. Liquid templates are **sandboxed**: a template can only read the data it
is given and use the filters/tags below. Nothing else is reachable. They are also
much simpler to write.

## Anatomy

A Liquid template is a normal Markdown/HTML document with `{{ … }}` for values
and `{% … %}` for logic, preceded by an optional sentinel header:

```liquid
<!--liquid-->
<!--markdown-->
<!--addTags: ItemNote-->
# {{ item.citekey }}

- Title: {{ item.title }}
- Year: {{ item.year }}
- Authors:
{% for a in item.authors %}    - {{ a.name }}
{% endfor %}- Abstract: {{ item.abstract | oneline }}
```

### Sentinel header (leading `<!-- … -->` lines)

| Sentinel | Effect |
|---|---|
| `<!--liquid-->` | **Required.** Marks the template as Liquid (vs legacy JS). |
| `<!--markdown-->` | The rendered output is Markdown → converted to note HTML. |
| `<!--addTags: A, B-->` | After rendering, add tags `A`, `B` to the target note. |

The header is stripped before rendering.

## Data model

The template name's prefix selects the type and the data it receives:

- `[item]…` — receives **`item`** (the first selected item), **`items`** (all
  selected), and **`note`** (the target note, if any).
- `[text]…` — receives **`note`** (the target note, if any).
- All templates receive **`now`** (current date/time).

### `item` fields

| Field | Notes |
|---|---|
| `item.title` | |
| `item.authors` / `item.creators` | array of `{ firstName, lastName, name }` where `name` is `"Last, First"` |
| `item.date` | raw date string |
| `item.year` | 4-digit year extracted from the date |
| `item.tags` | array of tag strings |
| `item.abstract` | |
| `item.citekey` | Better BibTeX key → `extra` "Citation Key:" → native `citationKey` |
| `item.collections` | array of collection names |
| `item.doi`, `item.url`, `item.itemType`, `item.key` | |

### `note` fields

`note.title`, `note.tags`, `note.key`, `note.parentTitle`, `note.collections`,
`note.citekey` (from the parent item).

## Filters

Standard [LiquidJS built-ins](https://liquidjs.com/filters/overview.html) are all
available — e.g. `join`, `strip_newlines`, `upcase`, `truncate`, `default`, and
`date` (`{{ now | date: "%Y-%m-%d" }}`). Custom filters added by Better Notes:

| Filter | Effect |
|---|---|
| `year` | extract a 4-digit year from a date string |
| `sanitize_filename` | replace filename-illegal chars and spaces with `-` |
| `oneline` | collapse newline runs to a single space (e.g. for abstracts) |
| `md` | render a Markdown string to note HTML |

## Side effects

Templates are pure — they cannot modify your library directly. Any write is
declared in the header and applied by the engine after rendering. Currently:
`<!--addTags: …-->`.

## Examples

**Citation link** (`[text]`):
```liquid
<!--liquid-->
<!--markdown-->
**Saved:** {{ now | date: "%Y-%m-%d %H:%M" }}
```

**Item summary** (`[item]`): see the bundled `[item]ItemNoteMD-Liquid` default.

## Migrating a legacy template

A best-effort converter is available at
`~/.claude/scripts/bn_legacy_to_liquid.mjs`. It translates the common patterns
(field access, year extraction, the citekey idiom, pragmas) and flags anything it
can't convert for manual rebuild — it is an aid, not a guaranteed transform, since
legacy templates could contain arbitrary JavaScript.

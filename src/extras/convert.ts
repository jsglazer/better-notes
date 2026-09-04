import { unified } from "unified";
import rehypeParse from "rehype-parse";
import rehypeRemark, { all } from "rehype-remark";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { defaultHandlers as rehype2remarkDefaultHandlers } from "hast-util-to-mdast";
import { toMarkdown } from "mdast-util-to-markdown";
import { gfmTableToMarkdown } from "mdast-util-gfm-table";
import { toHtml } from "hast-util-to-html";
import { toText } from "hast-util-to-text";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
// visit may push nodes twice, use new Array(...new Set(nodes))
// if the you want to process nodes outside visit
import { visit } from "unist-util-visit";
import { visitParents } from "unist-util-visit-parents";
import { h } from "hastscript";

import { Root as HRoot, RootContent } from "hast";
import { ListContent, Root as MRoot, TableContent } from "mdast";
import { Nodes } from "hast-util-to-text/lib";

import { diffChars } from "diff";

export {
  note2rehype,
  rehype2remark,
  rehype2note,
  remark2rehype,
  remark2md,
  remark2latex,
  md2remark,
  content2diff,
  md2html,
};

function replace(targetNode: any, sourceNode: any) {
  targetNode.type = sourceNode.type;
  targetNode.tagName = sourceNode.tagName;
  targetNode.properties = sourceNode.properties;
  targetNode.value = sourceNode.value;
  targetNode.children = sourceNode.children;
}

function note2rehype(str: string) {
  const rehype = unified()
    .use(remarkGfm)
    .use(remarkMath)
    .use(rehypeParse, { fragment: true })
    .parse(str);

  // Make sure <br> is inline break. Remove \n before/after <br>
  const removeBlank = (node: any, parentNode: any, offset: number) => {
    const idx = parentNode.children.indexOf(node);
    const target = parentNode.children[idx + offset];
    if (
      target &&
      target.type === "text" &&
      !target.value.replace(/[\r\n]/g, "")
    ) {
      (parentNode.children as any[]).splice(idx + offset, 1);
    }
  };
  visitParents(
    rehype,
    (_n: any) => _n.type === "element" && _n.tagName === "br",
    (_n: any, ancestors) => {
      if (ancestors.length) {
        const parentNode = ancestors[ancestors.length - 1];
        removeBlank(_n, parentNode, -1);
        removeBlank(_n, parentNode, 1);
      }
    },
  );

  // Make sure <span> and <img> wrapped by <p>
  visitParents(
    rehype,
    (_n: any) =>
      _n.type === "element" && (_n.tagName === "span" || _n.tagName === "img"),
    (_n: any, ancestors) => {
      if (ancestors.length) {
        const parentNode = ancestors[ancestors.length - 1];
        if (parentNode === rehype) {
          const newChild = h("span");
          replace(newChild, _n);
          const p = h("p", [newChild]);
          replace(_n, p);
        }
      }
    },
  );

  // Empty <p> under the root node is Zotero's representation of a deliberate
  // blank line. U21: it used to be deleted outright; it is now tagged and kept,
  // because `mergeAdjacentParagraphs` (remark2md) needs it to tell "two lines
  // the user typed one after another" from "two paragraphs the user separated".
  // Consumers that don't want it strip it themselves — see `dropEmptyParagraphs`.
  // Note the test is structural rather than "is a direct child of the root":
  // a real Zotero note is wrapped in <div data-schema-version="…">, so its
  // paragraphs are never root children and the old parent check never matched.
  // A blank line is any empty <p> that is not inside a list item, table cell or
  // block quote (where an empty <p> is layout, not a blank line).
  const blankLineExcluded = ["li", "td", "th", "blockquote"];
  visitParents(
    rehype,
    (_n: any) => _n.type === "element" && _n.tagName === "p",
    (_n: any, ancestors) => {
      if (_n.children.length || toText(_n)) {
        return;
      }
      const nested = ancestors.some(
        (ancestor: any) =>
          ancestor.type === "element" &&
          blankLineExcluded.includes(ancestor.tagName),
      );
      if (!nested) {
        _n.properties = { ..._n.properties, dataEmptyLine: "true" };
      }
    },
  );
  return rehype;
}

async function rehype2remark(rehype: HRoot) {
  return await unified()
    .use(rehypeRemark, {
      handlers: {
        span: (h, node) => {
          if (
            node.properties?.style?.includes("text-decoration: line-through")
          ) {
            return h(node, "delete", all(h, node));
          } else if (node.properties?.style?.includes("background-color")) {
            return h(node, "html", toHtml(node));
          } else if (node.properties?.style?.includes("color")) {
            return h(node, "html", toHtml(node));
          } else if (node.properties?.className?.includes("math")) {
            return h(node, "inlineMath", toText(node).slice(1, -1));
          } else {
            return h(node, "paragraph", all(h, node));
          }
        },
        // U21: an empty <p> is Zotero's deliberate blank line. rehype-remark
        // drops empty elements entirely, so the marker set in `note2rehype`
        // would vanish here; emit an explicit node instead so
        // `mergeAdjacentParagraphs` can see the paragraph boundary. It is
        // consumed (and removed) there, and never reaches the output.
        p: (h, node) => {
          if (node.properties?.dataEmptyLine) {
            return h(node, "emptyLine", "");
          }
          return rehype2remarkDefaultHandlers.p(h, node);
        },
        pre: (h, node) => {
          if (node.properties?.className?.includes("math")) {
            return h(node, "math", toText(node).slice(2, -2));
          } else {
            const ret = rehype2remarkDefaultHandlers.pre(h, node);
            return ret;
          }
        },
        u: (h, node) => {
          return h(node, "u", toText(node));
        },
        sub: (h, node) => {
          return h(node, "sub", toText(node));
        },
        sup: (h, node) => {
          return h(node, "sup", toText(node));
        },
        table: (h, node) => {
          let hasStyle = false;
          let hasHeader = false;
          visit(
            node,
            (_n) =>
              _n.type === "element" &&
              ["tr", "td", "th"].includes((_n as any).tagName),
            (node) => {
              if (node.properties.style) {
                hasStyle = true;
              }
              if (!hasHeader && node.tagName === "th") {
                hasHeader = true;
              }
            },
          );
          // if (0 && hasStyle) {
          //   return h(node, "styleTable", toHtml(node));
          // } else {
          const tableNode = rehype2remarkDefaultHandlers.table(
            h,
            node,
          ) as TableContent;
          // Remove empty thead
          if (!hasHeader) {
            if (!tableNode.data) {
              tableNode.data = {};
            }
            tableNode.data.bnRemove = true;
          }
          return tableNode;
          // }
        },
        /*
         * See https://github.com/windingwind/zotero-better-notes/issues/820
         * The text content separated by non-text content (e.g. inline math)
         * inside `li`(rehype) will be converted to `paragraph`(remark),
         * which will be turned to line with \n in MD:
         * ```rehype
         * li: [text, text, inline-math, text]
         * ```
         * to
         * ```remark
         * listitem: [paragraph, inline-math, paragraph]
         * ```
         * to
         * ```md
         *  * text text
         *    inline-math
         *    text
         * ```
         */
        li: (h, node) => {
          const mNode = rehype2remarkDefaultHandlers.li(h, node) as ListContent;
          // If no more than 1 children, skip
          if (!mNode || mNode.children.length < 2) {
            return mNode;
          }
          const children: any[] = [];
          const paragraphNodes = ["list", "code", "math", "table"];
          // Merge none-list nodes inside li into the previous paragraph node to avoid line break
          while (mNode.children.length > 0) {
            const current = mNode.children.shift();
            let cached = children[children.length - 1];
            // https://github.com/windingwind/zotero-better-notes/issues/1207
            // Create a new paragraph node
            if (cached?.type !== "paragraph") {
              cached = {
                type: "paragraph",
                children: [],
              };
              children.push(cached);
            }
            if (current?.type === "paragraph") {
              cached.children.push(...current.children);
            }
            // https://github.com/windingwind/zotero-better-notes/issues/1300
            // @ts-ignore inlineMath is not in mdast
            else if (current?.type === "inlineMath") {
              cached.children.push({
                type: "text",
                value: " ",
              });
              cached.children.push(current);
              cached.children.push({
                type: "text",
                value: " ",
              });
            } else if (
              current?.type &&
              !paragraphNodes.includes(current?.type)
            ) {
              cached.children.push(current);
            } else {
              children.push(current);
            }
          }
          mNode.children.push(...children);
          return mNode;
        },
        wrapper: (h, node) => {
          return h(node, "wrapper", toText(node));
        },
        wrapperleft: (h, node) => {
          return h(node, "wrapperleft", toText(node));
        },
        wrapperright: (h, node) => {
          return h(node, "wrapperright", toText(node));
        },
        zhighlight: (h, node) => {
          return h(node, "zhighlight", toHtml(node));
        },
        zcitation: (h, node) => {
          return h(node, "zcitation", toHtml(node));
        },
        znotelink: (h, node) => {
          return h(node, "znotelink", toHtml(node));
        },
        zimage: (h, node) => {
          return h(node, "zimage", toHtml(node));
        },
      },
    })
    .run(rehype as any);
}

/** True for a paragraph carrying no rendered content (Zotero's blank line). */
function isEmptyParagraph(node: any): boolean {
  if (node?.type === "emptyLine") {
    return true;
  }
  if (!node || node.type !== "paragraph") {
    return false;
  }
  return !(node.children ?? []).some((child: any) => {
    if (child.type === "text") {
      return Boolean(child.value?.trim());
    }
    // Any non-text child (image, inline math, html, link…) counts as content.
    return true;
  });
}

/** Remove the blank-line marker paragraphs kept by `note2rehype`. */
function dropEmptyParagraphs(remark: any) {
  remark.children = (remark.children ?? []).filter(
    (child: any) => !isEmptyParagraph(child),
  );
}

/**
 * U21: fold runs of directly-adjacent root-level paragraphs into a single
 * paragraph whose parts are separated by a soft line break, so markdown mirrors
 * Zotero's compact layout instead of double-spacing every line.
 *
 * An empty paragraph (Zotero's deliberate blank line) ends a run and is then
 * dropped, leaving exactly one blank line at that point. Any other block —
 * heading, list, table, code, thematic break — ends a run too, so structure is
 * untouched.
 */
function mergeAdjacentParagraphs(remark: any) {
  const children: any[] = remark.children ?? [];
  const merged: any[] = [];
  let run: any = null;

  const endRun = () => {
    run = null;
  };

  for (const child of children) {
    // U22: recurse into block quotes so a multi-line callout body renders as
    // consecutive `> ` lines rather than one paragraph per line separated by
    // blank `>` lines, which is how Obsidian writes them.
    if (child.type === "blockquote") {
      mergeAdjacentParagraphs(child);
      merged.push(child);
      endRun();
      continue;
    }
    if (isEmptyParagraph(child)) {
      // A deliberate blank line: close the run and drop the marker itself.
      // remark-stringify already puts a blank line between two blocks, so the
      // separation is preserved without emitting an empty paragraph.
      endRun();
      continue;
    }
    if (child.type !== "paragraph") {
      merged.push(child);
      endRun();
      continue;
    }
    if (run) {
      // "\n" inside a paragraph is a soft break: one newline in the output,
      // no trailing backslash or double space.
      run.children.push({ type: "text", value: "\n" }, ...child.children);
    } else {
      run = child;
      merged.push(child);
    }
  }

  remark.children = merged;
}

function remark2md(remark: MRoot) {
  const handlers = {
    code: (node: { value: string }) => {
      return "```\n" + node.value + "\n```";
    },
    u: (node: { value: string }) => {
      return "<u>" + node.value + "</u>";
    },
    sub: (node: { value: string }) => {
      return "<sub>" + node.value + "</sub>";
    },
    sup: (node: { value: string }) => {
      return "<sup>" + node.value + "</sup>";
    },
    inlineMath: (node: { value: string }) => {
      return "$" + node.value + "$";
    },
    styleTable: (node: { value: any }) => {
      return node.value;
    },
    // U21: consumed by mergeAdjacentParagraphs; handled here only so an
    // unmerged tree (e.g. a caller that stringifies directly) cannot throw.
    emptyLine: () => "",
    wrapper: (node: { value: string }) => {
      return "\n<!-- " + node.value + " -->\n";
    },
    wrapperleft: (node: { value: string }) => {
      return "<!-- " + node.value + " -->\n";
    },
    wrapperright: (node: { value: string }) => {
      return "\n<!-- " + node.value + " -->";
    },
    zhighlight: (node: { value: string }) => {
      return node.value.replace(/(^<zhighlight>|<\/zhighlight>$)/g, "");
    },
    zcitation: (node: { value: string }) => {
      return node.value.replace(/(^<zcitation>|<\/zcitation>$)/g, "");
    },
    znotelink: (node: { value: string }) => {
      return node.value.replace(/(^<znotelink>|<\/znotelink>$)/g, "");
    },
    zimage: (node: { value: string }) => {
      return node.value.replace(/(^<zimage>|<\/zimage>$)/g, "");
    },
  };
  const tableHandler = (node: any) => {
    const tbl = gfmTableToMarkdown();
    // table must use same handlers as rest of pipeline
    const txt = toMarkdown(node, {
      extensions: [tbl],
      // Use the same handlers as the rest of the pipeline
      handlers,
    });

    if (node.data?.bnRemove) {
      const lines = txt.split("\n");
      // Replace the first line cells from `|{multiple spaces}|{multiple spaces}|...` to `| <!-- --> | <!-- --> |...`
      lines[0] = lines[0].replace(/(\| +)+/g, (s) => {
        return s.replace(/ +/g, " <!-- --> ");
      });
      return lines.join("\n");
    }
    return txt;
  };
  // Collapse loose lists to prevent blank lines between list items in output
  visit(remark as any, "list", (node: any) => {
    node.spread = false;
  });
  visit(remark as any, "listItem", (node: any) => {
    node.spread = false;
  });
  // U21: Zotero's editor makes every visual line its own <p>, which markdown
  // then separates with a blank line — so a note that is compact in Zotero
  // comes out double-spaced in the vault. Merge runs of adjacent paragraphs
  // into one paragraph whose parts are joined by a soft line break, so the .md
  // mirrors what the note looks like in Zotero. Only *directly* adjacent
  // paragraphs are merged; anything else between them (heading, list, code,
  // table, thematic break) still ends the run, and a deliberately empty line in
  // the note survives as a paragraph boundary because the empty <p> is dropped
  // upstream and breaks adjacency here.
  mergeAdjacentParagraphs(remark as any);
  const md = String(
    unified()
      .use(remarkGfm)
      .use(remarkMath)
      .use(remarkStringify, {
        bullet: "-",
        // One space after the marker ("- text"), not tab-aligned ("-   text").
        listItemIndent: "one",
        join: [joinBlocks],
        // Prevent recursive call
        handlers: Object.assign({}, handlers, {
          table: tableHandler,
        }),
      } as any)
      .stringify(remark as any),
  );
  return useTabsForListIndent(restoreCalloutMarkers(md));
}

/**
 * U22d: indent nested list items with tabs, one per level.
 *
 * remark-stringify indents a nested list by its parent's content offset — two
 * spaces under a `-` bullet, three under `1. `. Obsidian writes a tab when you
 * press Tab, so every sync rewrote the user's tabs as spaces: the list still
 * nested correctly, but the file churned on every sync and the nesting rendered
 * shallower than natively-authored lists sitting next to it.
 *
 * The level is derived from the *sequence* of indent widths rather than by
 * dividing by a fixed number, because the width per level depends on the
 * marker ("- " is 2, "1. " is 3, and a mixed nesting gives an uneven ladder).
 *
 * Only lines that begin a list item are touched, and never inside a fenced code
 * block — where an indented `- foo` is content, not a marker. In practice list
 * items here are single-line (`rehype2remark`'s `li` handler folds an item's
 * children into one paragraph), so continuation lines do not arise.
 */
function useTabsForListIndent(md: string) {
  const lines = md.split("\n");
  const fence = /^\s*(```|~~~)/;
  // Indent width of each currently open list level.
  const openLevels: number[] = [];
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (fence.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      continue;
    }
    const match = /^([ \t]*)([-*+]|\d+[.)])(\s)/.exec(line);
    if (!match) {
      // A blank line does not close a list (a loose list keeps going), but any
      // other unindented content does.
      if (line.trim() && !/^[ \t]/.test(line)) {
        openLevels.length = 0;
      }
      continue;
    }
    const indent = match[1];
    if (indent.includes("\t")) {
      // Already tab-indented (e.g. untouched by a previous pass).
      continue;
    }
    const width = indent.length;
    while (openLevels.length && openLevels[openLevels.length - 1] > width) {
      openLevels.pop();
    }
    if (!openLevels.length || openLevels[openLevels.length - 1] < width) {
      openLevels.push(width);
    }
    const level = openLevels.length - 1;
    if (level > 0) {
      lines[i] = "\t".repeat(level) + line.slice(indent.length);
    }
  }

  return lines.join("\n");
}

/**
 * U22c: decide how many blank lines go between two blocks.
 *
 * remark-stringify separates every pair of blocks with a blank line. Zotero
 * shows a heading hard against the content under it, so that blank line is not
 * in the note and not something the user typed — but it reappears in the vault
 * file on every sync, which looks like the file "forcing" blank lines back in
 * after you delete them.
 *
 * Returning 0 removes it. This is applied only around ATX headings, where it is
 * unambiguous: a `#` heading is self-contained, cannot absorb the line after it
 * and cannot be absorbed into the block before it, so removing the blank line
 * cannot change how the markdown parses. Everywhere else keeps the default
 * spacing, because dropping it there genuinely can change meaning — a table or
 * an ordered list not starting at 1 gets swallowed by a preceding paragraph.
 *
 * `undefined` means "no opinion", which leaves the default in place.
 */
function joinBlocks(left: any, right: any): number | undefined {
  if (left?.type === "heading" || right?.type === "heading") {
    return 0;
  }
  // A list directly under a paragraph, the way it looks in the note. CommonMark
  // lets a list interrupt a paragraph, but only when it cannot be mistaken for
  // ordinary text: bullets always may, ordered lists only when they start at 1
  // ("2." after a paragraph is just a sentence). Anything else keeps its blank
  // line.
  if (left?.type === "paragraph" && right?.type === "list") {
    const startsAtOne = right.start === null || right.start === undefined || right.start === 1;
    if (!right.ordered || startsAtOne) {
      return 0;
    }
  }
  // Deliberately NOT the reverse: text after a list with no blank line is a
  // lazy continuation of the last list item, which would silently swallow the
  // paragraph into the bullet.
  return undefined;
}

/**
 * U22: un-escape an Obsidian callout marker at the start of a block quote.
 *
 * `[!note]` is ordinary text to remark, so remark-stringify escapes the
 * bracket (`> \[!note]`) to stop it being read as a link reference. Obsidian
 * then no longer recognises the callout, and the note degrades to a plain
 * quote on every sync. Only this exact shape is unescaped — a marker word in
 * brackets, immediately after the quote marker — so real link references
 * elsewhere keep their escaping.
 */
function restoreCalloutMarkers(md: string) {
  return md.replace(/^((?:[ \t]*>)+[ \t]*)\\\[!/gm, "$1[!");
}

function remark2latex(remark: MRoot) {
  // U21: the blank-line markers note2rehype now keeps are a markdown-layout
  // concern only; LaTeX gets its paragraph breaks from block structure.
  dropEmptyParagraphs(remark as any);
  return String(
    unified()
      .use(remarkGfm)
      .use(remarkMath)
      .use(remarkStringify, {
        handlers: {
          text: (node: { value: string }) => {
            return node.value;
          },
        },
      } as any)
      .stringify(remark as any),
  );
}

/**
 * Split each root-level paragraph at its line breaks, so every visual line
 * becomes its own paragraph (which `rehype2note` then renders as its own <p>,
 * matching how Zotero's editor stores lines). Breaks nested inside other
 * blocks — list items, table cells, block quotes — are left alone.
 */
function splitParagraphsOnLineBreaks(remark: any) {
  const out: any[] = [];
  let previousWasParagraph = false;
  for (const child of remark.children ?? []) {
    // U22: recurse into block quotes, so each line of a callout body becomes
    // its own <p> in the note (matching how Zotero models a visual line) and
    // the round trip back to markdown stays stable.
    if (child.type === "blockquote") {
      splitParagraphsOnLineBreaks(child);
      out.push(child);
      previousWasParagraph = false;
      continue;
    }
    if (child.type !== "paragraph") {
      out.push(child);
      previousWasParagraph = false;
      continue;
    }
    // Two markdown paragraphs in a row were separated by a blank line the user
    // meant to keep. Zotero spells that as an empty <p>, so re-create it —
    // otherwise the blank line is lost on md -> note and the next note -> md
    // would merge the two runs back together (an unstable round trip).
    if (previousWasParagraph) {
      // Emitted as raw HTML rather than an empty mdast paragraph, because
      // mdast-util-to-hast drops paragraphs with no children — the empty <p>
      // would never reach the note.
      out.push({ type: "html", value: "<p></p>" });
    }
    previousWasParagraph = true;
    // Each element is the child list of one output paragraph.
    let current: any[] = [];
    const lines: any[][] = [current];
    for (const node of child.children ?? []) {
      if (node.type === "break") {
        current = [];
        lines.push(current);
        continue;
      }
      if (node.type === "text" && node.value.includes("\n")) {
        const parts = node.value.split("\n");
        parts.forEach((part: string, index: number) => {
          if (index > 0) {
            current = [];
            lines.push(current);
          }
          if (part) {
            current.push({ ...node, value: part });
          }
        });
        continue;
      }
      current.push(node);
    }
    // A paragraph with no internal break is passed through untouched, so the
    // common case allocates nothing new.
    if (lines.length === 1) {
      out.push(child);
      continue;
    }
    for (const line of lines) {
      // Drop runs that held only the whitespace around a break.
      if (!line.length) {
        continue;
      }
      out.push({ ...child, children: line, position: undefined });
    }
  }
  remark.children = out;
}

function md2remark(str: string) {
  // Parse Obsidian-style image ![[xxx.png]]
  // Encode spaces in link, otherwise it cannot be parsed to image node
  str = str
    .replace(/!\[\[(.*)\]\]/g, (s: string) => `![](${s.slice(3, -2)})`)
    .replace(
      /!\[(.*)\]\((.*)\)/g,
      (match, altText, imageURL) =>
        `![${altText}](${encodeURI(decodeURI(imageURL))})`,
    );
  const remark = unified()
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkParse)
    .parse(str);
  // U21: the counterpart to `mergeAdjacentParagraphs`. A line break inside a
  // markdown paragraph (soft break, or an explicit two-space/backslash break)
  // is one visual line, and Zotero models a visual line as its own <p>. Without
  // this split those lines would collapse onto a single line in the note, so a
  // note -> md -> note round trip would not be stable.
  splitParagraphsOnLineBreaks(remark as any);
  // visit(
  //   remark,
  //   (_n) => _n.type === "image",
  //   (_n: any) => {
  //     _n.type = "html";
  //     _n.value = toHtml(
  //       h("img", {
  //         src: _n.url,
  //       })
  //     );
  //   }
  // );
  return remark;
}

async function remark2rehype(remark: any) {
  return await unified()
    .use(remarkRehype, {
      allowDangerousHtml: true,
      // handlers: {
      //   code: (h, node) => {
      //     return h(node, "pre", [h(node, "text", node.value)]);
      //   },
      // },
    })
    .run(remark);
}

function rehype2note(rehype: HRoot) {
  // Del node
  visit(
    rehype,
    (node: any) => node.type === "element" && (node as any).tagName === "del",
    (node: any) => {
      node.tagName = "span";
      node.properties.style = "text-decoration: line-through";
    },
  );

  // Code node
  visitParents(
    rehype,
    (node: any) => node.type === "element" && (node as any).tagName === "code",
    (node: any, ancestors) => {
      const parent = ancestors.length
        ? ancestors[ancestors.length - 1]
        : undefined;
      if (parent?.type == "element" && parent?.tagName === "pre") {
        node.value = toText(node, { whitespace: "pre-wrap" });
        // Remove \n at the end of code block, which is redundant
        if (node.value.endsWith("\n")) {
          node.value = node.value.slice(0, -1);
        }
        node.type = "text";
      }
    },
  );

  // Table node with style
  visit(
    rehype,
    (node: any) => node.type === "element" && (node as any).tagName === "table",
    (node: any) => {
      let hasStyle = false;
      let hasHeader = false;
      visit(
        node,
        (_n: any) =>
          _n.type === "element" &&
          ["tr", "td", "th"].includes((_n as any).tagName),
        (node: any) => {
          if (node.properties.style) {
            hasStyle = true;
          }
          if (
            !hasHeader &&
            node.tagName === "th" &&
            node.children[0]?.value !== "<!-- -->"
          ) {
            hasHeader = true;
          }
        },
      );
      if (hasStyle) {
        node.value = toHtml(node).replace(/[\r\n]/g, "");
        node.children = [];
        node.type = "raw";
      }
      if (!hasHeader) {
        const index = node.children.findIndex(
          (_n: any) => _n.tagName === "thead",
        );
        // Remove children before thead
        if (index > -1) {
          node.children = node.children.slice(index + 1);
        }
      }
    },
  );

  // Convert thead to tbody
  visit(
    rehype,
    (node: any) => node.type === "element" && (node as any).tagName === "thead",
    (node: any) => {
      node.value = toHtml(node).slice(7, -8);
      node.children = [];
      node.type = "raw";
    },
  );

  // Wrap lines in list with <span> (for diff)
  visitParents(rehype, "text", (node: any, ancestors) => {
    const parent = ancestors.length
      ? ancestors[ancestors.length - 1]
      : undefined;
    // U21: skip items that also carry raw inline HTML (e.g. a highlight span
    // that came from markdown). There the raw open/close tags are separate
    // siblings, so wrapping the text between them would nest a <span> inside
    // the raw one — and nest one level deeper on every sync. The item is left
    // unwrapped instead, which keeps the round trip stable; the wrapping only
    // ever existed to give the diff view finer granularity.
    const hasRawSibling = (parent?.children ?? []).some(
      (sibling: any) => sibling.type === "raw",
    );
    if (
      parent?.type == "element" &&
      ["li", "td"].includes(parent?.tagName) &&
      !hasRawSibling &&
      node.value.replace(/[\r\n]/g, "")
    ) {
      node.type = "element";
      node.tagName = "span";
      node.children = [
        { type: "text", value: node.value.replace(/[\r\n]/g, "") },
      ];
      node.value = undefined;
    }
  });

  // No empty breakline text node in list (for diff)
  visit(
    rehype,
    (node: any) =>
      node.type === "element" &&
      ((node as any).tagName === "li" || (node as any).tagName === "td"),
    (node: any) => {
      node.children = node.children.filter(
        (_n: { type: string; value: string }) =>
          _n.type === "element" ||
          // U21: `raw` nodes are the inline HTML that came from markdown
          // (e.g. `<span style="background-color: …">` around a highlight).
          // They are neither `element` nor `text`, so the old filter dropped
          // them — silently stripping every highlight/color inside a bullet on
          // each md -> note sync. Keep any raw node that carries content.
          (_n.type === "raw" && _n.value.replace(/[\r\n]/g, "")) ||
          (_n.type === "text" && _n.value.replace(/[\r\n]/g, "")),
      );

      // https://github.com/windingwind/zotero-better-notes/issues/1300
      // For all math-inline node in list, remove 1 space from its sibling text node
      if (node.tagName === "li") {
        for (const p of node.children) {
          // U21: `raw`/`text` children have no `children` array — they now
          // survive the filter above, so this loop must skip them.
          if (!Array.isArray(p.children)) {
            continue;
          }
          for (let idx = 0; idx < p.children.length; idx++) {
            const _n = p.children[idx];
            if (_n.properties?.className?.includes("math-inline")) {
              if (idx > 0) {
                const prev = p.children[idx - 1];
                if (prev.type === "text" && prev.value.endsWith(" ")) {
                  prev.value = prev.value.slice(0, -1);
                }
              }
              if (idx < p.children.length - 1) {
                const next = p.children[idx + 1];
                if (next.type === "text" && next.value.startsWith(" ")) {
                  next.value = next.value.slice(1);
                }
              }
            }
          }
        }
      }
    },
  );

  // Math node
  visit(
    rehype,
    (node: any) =>
      node.type === "element" &&
      ((node as any).properties?.className?.includes("math-inline") ||
        (node as any).properties?.className?.includes("math-display")),
    (node: any) => {
      if (node.properties.className.includes("math-inline")) {
        node.children = [
          { type: "text", value: "$" },
          ...node.children,
          { type: "text", value: "$" },
        ];
      } else if (node.properties.className.includes("math-display")) {
        node.children = [
          { type: "text", value: "$$" },
          ...node.children,
          { type: "text", value: "$$" },
        ];
        node.tagName = "pre";
      }
      node.properties.className = "math";
    },
  );

  // Ignore link rel attribute, which exists in note
  visit(
    rehype,
    (node: any) => node.type === "element" && (node as any).tagName === "a",
    (node: any) => {
      node.properties.rel = undefined;
    },
  );

  // Ignore empty lines, as they are not parsed to md
  const tempChildren: RootContent[] = [];
  const isEmptyNode = (_n: Nodes) =>
    (_n.type === "text" && !_n.value.trim()) ||
    (_n.type === "element" &&
      _n.tagName === "p" &&
      !_n.children.length &&
      !toText(_n).trim());
  for (const child of rehype.children) {
    if (
      tempChildren.length &&
      isEmptyNode(tempChildren[tempChildren.length - 1] as Nodes) &&
      isEmptyNode(child as Nodes)
    ) {
      continue;
    }
    tempChildren.push(child);
  }

  rehype.children = tempChildren;

  return unified()
    .use(rehypeStringify, {
      allowDangerousCharacters: true,
      allowDangerousHtml: true,
    })
    .stringify(rehype as any);
}

function content2diff(oldStr: string, newStr: string) {
  const diff = diffChars(oldStr, newStr);
  if (!diff) return [];
  return diff;
}

async function md2html(md: string) {
  const remark = md2remark(md);
  const rehype = await remark2rehype(remark);
  const html = rehype2note(rehype as HRoot);
  const parsedHTML = await parseKatexHTML(html);
  return parsedHTML;
}

async function parseKatexHTML(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  // https://github.com/windingwind/zotero-better-notes/issues/1356
  doc
    .querySelectorAll("span.katex, span.katex-display")
    .forEach((katexSpan) => {
      // Look for the annotation element that holds the original TeX code.
      const annotation = katexSpan.querySelector(
        'annotation[encoding="application/x-tex"]',
      );
      if (annotation) {
        const isBlock = !!katexSpan.querySelector("math[display=block]");

        let container: HTMLElement;

        if (isBlock) {
          container = doc.createElement("pre");
          container.innerHTML = `$$${annotation.textContent}$$`;
        } else {
          container = doc.createElement("span");
          container.innerHTML = `$${annotation.textContent}$`;
        }
        container.classList.add("math");
        // Replace the entire KaTeX span with the inline math string.
        katexSpan.parentNode?.replaceChild(container, katexSpan);
      }
    });
  // linkedom does not support doc.body.innerHTML
  // @ts-ignore
  return globalThis._fakeDOM ? doc.toString() : doc.body.innerHTML;
}

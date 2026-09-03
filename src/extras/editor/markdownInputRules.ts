import { Plugin } from "prosemirror-state";
import {
  InputRule,
  inputRules,
  textblockTypeInputRule,
  wrappingInputRule,
} from "prosemirror-inputrules";
import { MarkType, Schema } from "prosemirror-model";

export { initMarkdownInputRulesPlugin };

/**
 * U22: live markdown input rules.
 *
 * Typing `## ` makes a heading, `- ` a bullet, `**bold**` bolds on the closing
 * marker — the note behaves like the markdown it syncs to, instead of needing
 * the toolbar or the `/` palette for structure.
 *
 * Every rule is looked up from the *live* schema and skipped when the node or
 * mark is absent, so a Zotero version that renames or drops a type loses that
 * one rule rather than breaking the plugin. Zotero ships some input rules of
 * its own; where both match, whichever plugin handles the keystroke first
 * wins, and the conversion still happens exactly once.
 */

function initMarkdownInputRulesPlugin(plugins: readonly Plugin[]) {
  const core = (
    window as unknown as { _currentEditorInstance: { _editorCore: EditorCore } }
  )._currentEditorInstance._editorCore;
  const schema = core.view.state.schema as unknown as Schema;
  console.log("Init EN Markdown Input Rules Plugin");

  const rules: InputRule[] = [];
  const nodes = schema.nodes as Record<string, any>;
  const marks = schema.marks as Record<string, any>;

  // Blocks -------------------------------------------------------------
  const heading = nodes.heading;
  if (heading) {
    // `#` … `######` followed by a space.
    rules.push(
      textblockTypeInputRule(/^(#{1,6})\s$/, heading, (match) => ({
        level: match[1].length,
      })),
    );
  }

  const bulletList = nodes.bulletList ?? nodes.bullet_list;
  if (bulletList) {
    rules.push(wrappingInputRule(/^\s*([-+*])\s$/, bulletList));
  }

  const orderedList = nodes.orderedList ?? nodes.ordered_list;
  if (orderedList) {
    rules.push(
      wrappingInputRule(
        /^(\d+)\.\s$/,
        orderedList,
        (match) => ({ order: Number(match[1]) }),
        // Only continue an existing list when the numbers actually follow on.
        (match, node) => node.childCount + node.attrs.order === Number(match[1]),
      ),
    );
  }

  const blockquote = nodes.blockquote;
  if (blockquote) {
    rules.push(wrappingInputRule(/^\s*>\s$/, blockquote));
  }

  const codeBlock = nodes.codeBlock ?? nodes.code_block;
  if (codeBlock) {
    // ```lang — the fence carries the language through to the highlighter.
    rules.push(
      textblockTypeInputRule(/^```([a-zA-Z0-9+#-]*)\s$/, codeBlock, (match) =>
        match[1] ? { language: match[1] } : {},
      ),
    );
  }

  const horizontalRule = nodes.horizontalRule ?? nodes.horizontal_rule;
  if (horizontalRule) {
    rules.push(
      new InputRule(/^(?:---|___|\*\*\*)\s$/, (state, match, start, end) =>
        state.tr.replaceWith(start, end, horizontalRule.create()),
      ),
    );
  }

  // Inline marks -------------------------------------------------------
  // prosemirror-inputrules has no mark rule, so these use `markInputRule`.
  if (marks.strong) {
    rules.push(markInputRule(/(?:\*\*)([^*]+)(?:\*\*)$/, marks.strong));
    rules.push(markInputRule(/(?:__)([^_]+)(?:__)$/, marks.strong));
  }
  if (marks.em) {
    // Negative lookbehind on `*` so the closing `*` of `**bold**` is not read
    // as an italic marker.
    rules.push(markInputRule(/(?<!\*)\*([^*\s][^*]*)\*$/, marks.em));
    rules.push(markInputRule(/(?<!_)_([^_\s][^_]*)_$/, marks.em));
  }
  if (marks.code) {
    rules.push(markInputRule(/`([^`\s][^`]*)`$/, marks.code));
  }
  if (marks.strike) {
    rules.push(markInputRule(/(?:~~)([^~]+)(?:~~)$/, marks.strike));
  }

  if (!rules.length) {
    return plugins;
  }
  return [...plugins, inputRules({ rules })];
}

/**
 * Apply `markType` to the captured group and drop the surrounding markers.
 *
 * The mark is removed from the stored marks afterwards, so text typed straight
 * after the closing marker is not silently swept into the same mark.
 */
function markInputRule(pattern: RegExp, markType: MarkType) {
  return new InputRule(pattern, (state, match, start, end) => {
    const [full, captured] = match;
    if (!captured) {
      return null;
    }
    // Offsets of the captured text inside the whole match.
    const contentStart = start + full.indexOf(captured);
    const contentEnd = contentStart + captured.length;
    const tr = state.tr;

    // Delete the trailing marker first: removing the leading one first would
    // shift the positions of everything after it.
    if (contentEnd < end) {
      tr.delete(contentEnd, end);
    }
    if (contentStart > start) {
      tr.delete(start, contentStart);
    }
    const markTo = start + captured.length;
    tr.addMark(start, markTo, markType.create());
    tr.removeStoredMark(markType);
    return tr;
  });
}

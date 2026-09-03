import { initLinkPreviewPlugin, LinkPreviewOptions } from "./linkPreview";
import { initMagicKeyPlugin, MagicKeyOptions } from "./magicKey";
import { initMarkdownPastePlugin, MarkdownPasteOptions } from "./markdownPaste";
import { initMathPreviewPlugin } from "./mathPreview";
import { initCalloutPlugin } from "./callouts";
import { initCodeHighlightPlugin } from "./codeHighlight";
import { initHeadingCollapsePlugin } from "./headingCollapse";
import { initMarkdownInputRulesPlugin } from "./markdownInputRules";
// Use custom column resizing plugin, since the original one breaks
import { columnResizing } from "./columnResizing";
import { initNodeViews } from "./nodeViews";
import type { Plugin } from "prosemirror-state";

export { initPlugins };

declare const _currentEditorInstance: {
  _editorCore: EditorCore;
};

function initPlugins(options: {
  linkPreview: LinkPreviewOptions;
  magicKey: MagicKeyOptions;
  markdownPaste: MarkdownPasteOptions;
  headingCollapse?: boolean;
  codeHighlight?: boolean;
  callouts?: boolean;
  inputRules?: boolean;
}) {
  const core = _currentEditorInstance._editorCore;
  let plugins = core.view.state.plugins;
  if (options.linkPreview.previewType !== "disable")
    plugins = initLinkPreviewPlugin(plugins, options.linkPreview);
  if (options.markdownPaste.enable) plugins = initMarkdownPastePlugin(plugins);
  plugins = initMagicKeyPlugin(plugins, options.magicKey);
  plugins = initMathPreviewPlugin(plugins);
  // Each of these is independently switchable, and a failure in one must not
  // cost the others (or the editor) — a broken decoration plugin would
  // otherwise leave the note unusable.
  if (options.callouts !== false) {
    plugins = safePlugin(plugins, "callouts", initCalloutPlugin);
  }
  if (options.codeHighlight !== false) {
    plugins = safePlugin(plugins, "codeHighlight", initCodeHighlightPlugin);
  }
  if (options.headingCollapse !== false) {
    plugins = safePlugin(plugins, "headingCollapse", initHeadingCollapsePlugin);
  }
  if (options.inputRules !== false) {
    plugins = safePlugin(plugins, "inputRules", initMarkdownInputRulesPlugin);
  }
  // Collect all plugins and reconfigure the state only once
  const newState = core.view.state.reconfigure({
    plugins: [
      ...plugins,
      columnResizing({
        cellMinWidth: 80,
        handleWidth: 5,
      }),
    ],
  });

  initNodeViews(core.view);

  core.view.updateState(newState);
}

/** Run one plugin initializer, keeping the existing plugin list if it throws. */
function safePlugin(
  plugins: readonly Plugin[],
  label: string,
  init: (plugins: readonly Plugin[]) => readonly Plugin[],
): readonly Plugin[] {
  try {
    return init(plugins);
  } catch (e) {
    console.warn(`EN: Failed to init ${label} plugin`, e);
    return plugins;
  }
}

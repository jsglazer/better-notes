pref("__prefsPrefix__.syncNoteIds", "");
pref("__prefsPrefix__.syncPeriodSeconds", 30);
pref("__prefsPrefix__.syncAttachmentFolder", "attachments");
pref("__prefsPrefix__.sync.autoSyncLinkedNotes", false);
// Run the auto-sync timer even when Zotero is NOT focused, so external (e.g.
// Obsidian) edits to synced .md files propagate live. Conflicts are deferred
// (no modal) while unfocused. Off = old focus-only behavior.
pref("__prefsPrefix__.sync.background", true);

pref("__prefsPrefix__.autoAnnotation", false);

pref("__prefsPrefix__.insertLinkPosition", "end");

pref("__prefsPrefix__.workspace.outline.expandLevel", 2);
pref("__prefsPrefix__.workspace.outline.keepLinks", true);

pref("__prefsPrefix__.editor.noteLinkPreviewType", "hover");
pref("__prefsPrefix__.editor.useMagicKey", true);
pref("__prefsPrefix__.editor.useMagicKeyShortcut", true);
pref("__prefsPrefix__.editor.useMarkdownPaste", true);
pref("__prefsPrefix__.editor.pinTableLeft", true);
pref("__prefsPrefix__.editor.pinTableTop", true);

pref("__prefsPrefix__.exportNotes.takeover", true);

pref("__prefsPrefix__.annotationNote.enableTagSync", true);
pref("__prefsPrefix__.annotationNote.enableCreateNoteButton", true);

// Native annotation color labels (replaces the Highlight Descriptions plugin).
// Empty = no label for that color. Keyed by lowercase hex (no '#').
pref("__prefsPrefix__.annotationColorLabel.ffd400", "");
pref("__prefsPrefix__.annotationColorLabel.ff6666", "");
pref("__prefsPrefix__.annotationColorLabel.5fb236", "");
pref("__prefsPrefix__.annotationColorLabel.2ea8e5", "");
pref("__prefsPrefix__.annotationColorLabel.a28ae5", "");
pref("__prefsPrefix__.annotationColorLabel.e56eee", "");
pref("__prefsPrefix__.annotationColorLabel.f19837", "");
pref("__prefsPrefix__.annotationColorLabel.aaaaaa", "");

// Section order for `{% annotations grouped %}` — comma-separated color labels.
// Labels not listed are appended after these (in encounter order); unlabeled
// annotations go in a trailing "Other" section.
pref(
  "__prefsPrefix__.annotationSectionOrder",
  "Background,Key,Argument,Error,Source,Data,Definition,Nav",
);

// Settings sync (Update018) — carries the plugin's prefs between computers
// inside a Zotero note, replicated by Zotero's own data sync. Opt-in, because
// enabling it creates an item in the user's library.
pref("__prefsPrefix__.settingsSync.enabled", false);
// Machine-local bookkeeping; both are excluded from the synced payload.
pref("__prefsPrefix__.settingsSync.machineId", "");
pref("__prefsPrefix__.settingsSync.lastSeen", "");

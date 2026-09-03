basic-title = Basic
basic-exportNotes-takeover =
    .label = Take over exporting notes

editor-title = Note Editor
editor-expandLevel-label = Outline expand to heading level
editor-keepLinks = 
    .label = Show note links in outline
editor-noteLinkPreviewType = Show preview for note link when:
editor-noteLinkPreview-hover = 
    .label = Hover
editor-noteLinkPreview-ctrl = 
    .label = Press { PLATFORM() ->
        [macos] ⌘
       *[other] Ctrl
    }
editor-noteLinkPreview-disable = 
    .label = Never
editor-useMagicKey = 
    .label = Use magic key "/" to show command palette
editor-useMagicKeyShortcut = 
    .label = Use { PLATFORM() ->
        [macos] ⌘
       *[other] Ctrl
    } + "/" to show command palette
editor-useMarkdownPaste = 
    .label = Use enhanced markdown paste
editor-pinTable-label = Pin table's
editor-pinTableLeft =
    .label = First column
editor-pinTableTop =
    .label = First row when scrolling
editor-customCSS-label = Custom CSS for the note editor
editor-customCSS-placeholder =
    .placeholder = .primary-editor h1 { color: #7a3e9d; }
editor-customCSS-description = Applied on top of the plugin's own editor styles, so these rules win. Changes apply immediately to open notes. Affects how notes look in Zotero only — it does not change the note content or the synced Markdown file.

sync-title = Sync
sync-period-label = Auto-sync period (seconds)
sync-attachmentFolder-label = Attachment folder
sync-autoSyncLinkedNotes =
    .label = Auto-sync notes linked to / from an already-synced note
sync-background =
    .label = Sync in the background when Zotero is not focused (propagates external edits live; conflicts are deferred)
sync-manager =
    .label = Open Sync Manager
template-title = Template
template-editor =
    .label = Open Template Editor
annotation-title = PDF Annotation
annotation-autoAnnotation =
    .label = Automatically add new annotations to workspace note

annotationNote-title = Note from Annotation
annotationNote-enableCreateNoteButton =
    .label = Show the "Create note from annotation" button on annotations in the reader
annotationNote-enableTagSync =
    .label = Keep tags of note from annotation in sync with the original annotation

about-title = About
help =
    .value = { $name } VERSION { $version } Build { $time }
settingsSync-title = Settings Sync
settingsSync-enabled =
    .label = Sync plugin settings between my computers (via a note in your Zotero library)
settingsSync-push =
    .label = Send settings now
settingsSync-pull =
    .label = Check for changes
settingsSync-export =
    .label = Export settings…
settingsSync-import =
    .label = Import settings…

(() => {
  // package.json
  var config = {
    addonName: "Enhanced Notes",
    addonID: "enhanced-notes@jsglazer.com",
    addonRef: "EnhancedNotes",
    prefsPrefix: "extensions.zotero.EnhancedNotes",
    addonInstance: "EnhancedNotes",
    dataSchemaVersion: "9"
  };

  // test/utils/global.ts
  function getAddon() {
    return Zotero[config.addonRef];
  }

  // test/utils/status.ts
  async function resetData() {
    const collections = await Zotero.Collections.getAllIDs(
      Zotero.Libraries.userLibraryID
    );
    await Zotero.Collections.erase(collections);
    const items = await Zotero.Items.getAllIDs(Zotero.Libraries.userLibraryID);
    await Zotero.Items.erase(items);
  }
  async function resetTabs() {
    const win = Zotero.getMainWindow();
    const Zotero_Tabs = win.Zotero_Tabs;
    Zotero_Tabs.closeAll();
  }
  async function resetAll() {
    await resetTabs();
    await resetData();
  }

  // test/utils/io.ts
  async function getTempDirectory() {
    let path = "";
    let attempts = 3;
    const zoteroTmpDirPath = Zotero.getTempDirectory().path;
    while (attempts--) {
      path = PathUtils.join(zoteroTmpDirPath, Zotero.Utilities.randomString());
      try {
        await IOUtils.makeDirectory(path, { ignoreExisting: false });
        break;
      } catch (e) {
        if (!attempts) throw e;
      }
    }
    return path;
  }

  // test/tests/sync-autoLink.spec.ts
  var PREF_KEY = `${config.prefsPrefix}.sync.autoSyncLinkedNotes`;
  function setFeatureEnabled(enabled) {
    Zotero.Prefs.set(PREF_KEY, enabled, true);
  }
  describe("Sync - Auto-sync linked notes", function() {
    const addon = getAddon();
    this.timeout(3e4);
    const createdNoteIds = /* @__PURE__ */ new Set();
    this.beforeAll(async function() {
      await resetAll();
    });
    this.afterEach(async function() {
      setFeatureEnabled(false);
      for (const id of createdNoteIds) {
        addon.api.sync.removeSyncNote(id);
      }
      createdNoteIds.clear();
      await resetAll();
    });
    async function createNote(innerHTML = "") {
      const note = new Zotero.Item("note");
      note.setNote(`<div data-schema-version="9">${innerHTML}</div>`);
      await note.saveTx();
      createdNoteIds.add(note.id);
      return note;
    }
    function linkTo(target) {
      return `<p><a href="zotero://note/u/${target.key}/">link</a></p>`;
    }
    function markSynced(note, dir) {
      addon.api.sync.updateSyncStatus(note.id, {
        itemID: note.id,
        path: dir,
        filename: `${note.key}.md`,
        md5: "",
        noteMd5: Zotero.Utilities.Internal.md5(note.getNote(), false),
        lastsync: (/* @__PURE__ */ new Date()).getTime()
      });
      createdNoteIds.add(note.id);
    }
    async function ensureLink(fromNote, toNote) {
      const start = Date.now();
      while (Date.now() - start < 2e4) {
        await addon.api.relation.updateNoteLinkRelation(fromNote.id);
        await Zotero.Promise.delay(300);
        const outbound = await addon.api.relation.getNoteLinkOutboundRelation(
          fromNote.id
        );
        if (outbound.some((link) => link.toKey === toNote.key)) {
          return;
        }
      }
      throw new Error(
        `Link relation ${fromNote.key} -> ${toNote.key} was not built in time`
      );
    }
    it("syncs an unsynced note that links to a synced note", async function() {
      const dir = await getTempDirectory();
      const synced = await createNote();
      const edited = await createNote(linkTo(synced));
      markSynced(synced, dir);
      await ensureLink(edited, synced);
      setFeatureEnabled(true);
      await addon.api.sync.syncLinkedNoteOnEdit(edited.id);
      expect(addon.api.sync.isSyncNote(edited.id)).to.be.true;
      expect(addon.api.sync.getSyncStatus(edited.id).path).to.equal(
        addon.api.sync.getSyncStatus(synced.id).path
      );
      const status = addon.api.sync.getSyncStatus(edited.id);
      const filePath = PathUtils.join(status.path, status.filename);
      expect(await IOUtils.exists(filePath)).to.be.true;
    });
    it("syncs an unsynced note that is linked from a synced note", async function() {
      const dir = await getTempDirectory();
      const edited = await createNote();
      const synced = await createNote(linkTo(edited));
      markSynced(synced, dir);
      await ensureLink(synced, edited);
      setFeatureEnabled(true);
      await addon.api.sync.syncLinkedNoteOnEdit(edited.id);
      expect(addon.api.sync.isSyncNote(edited.id)).to.be.true;
      expect(addon.api.sync.getSyncStatus(edited.id).path).to.equal(
        addon.api.sync.getSyncStatus(synced.id).path
      );
    });
    it("propagates sync from a synced note to its unsynced linked note", async function() {
      const dir = await getTempDirectory();
      const neighbor = await createNote();
      const edited = await createNote(linkTo(neighbor));
      markSynced(edited, dir);
      await ensureLink(edited, neighbor);
      expect(addon.api.sync.isSyncNote(neighbor.id)).to.be.false;
      setFeatureEnabled(true);
      await addon.api.sync.syncLinkedNoteOnEdit(edited.id);
      expect(addon.api.sync.isSyncNote(neighbor.id)).to.be.true;
      expect(addon.api.sync.getSyncStatus(neighbor.id).path).to.equal(
        addon.api.sync.getSyncStatus(edited.id).path
      );
    });
    it("does nothing when no linked note is synced", async function() {
      const synced = await createNote();
      const edited = await createNote(linkTo(synced));
      await ensureLink(edited, synced);
      setFeatureEnabled(true);
      await addon.api.sync.syncLinkedNoteOnEdit(edited.id);
      expect(addon.api.sync.isSyncNote(edited.id)).to.be.false;
      expect(addon.api.sync.isSyncNote(synced.id)).to.be.false;
    });
    it("does nothing when the preference is disabled", async function() {
      const dir = await getTempDirectory();
      const synced = await createNote();
      const edited = await createNote(linkTo(synced));
      markSynced(synced, dir);
      await ensureLink(edited, synced);
      setFeatureEnabled(false);
      await addon.api.sync.syncLinkedNoteOnEdit(edited.id);
      expect(addon.api.sync.isSyncNote(edited.id)).to.be.false;
    });
    it("prompts to choose a folder when synced neighbors are in different folders", async function() {
      const dir1 = await getTempDirectory();
      const dir2 = await getTempDirectory();
      const syncedA = await createNote();
      const syncedB = await createNote();
      const edited = await createNote(`${linkTo(syncedA)}${linkTo(syncedB)}`);
      markSynced(syncedA, dir1);
      markSynced(syncedB, dir2);
      await ensureLink(edited, syncedA);
      await ensureLink(edited, syncedB);
      const wantPath = addon.api.sync.getSyncStatus(syncedB.id).path;
      const promptService = Services.prompt;
      let promptShown = false;
      Services.prompt = {
        select: (_parent, _title, _text, folders, selection) => {
          promptShown = true;
          const idx = folders.indexOf(wantPath);
          selection.value = idx < 0 ? 0 : idx;
          return true;
        }
      };
      try {
        setFeatureEnabled(true);
        await addon.api.sync.syncLinkedNoteOnEdit(edited.id);
      } finally {
        Services.prompt = promptService;
      }
      expect(promptShown).to.be.true;
      expect(addon.api.sync.isSyncNote(edited.id)).to.be.true;
      expect(addon.api.sync.getSyncStatus(edited.id).path).to.equal(wantPath);
    });
  });
})();

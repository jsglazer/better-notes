(() => {
  // package.json
  var config = {
    addonName: "Better Notes",
    addonID: "Knowledge4Zotero@windingwind.com",
    addonRef: "BetterNotes",
    prefsPrefix: "extensions.zotero.Knowledge4Zotero",
    addonInstance: "BetterNotes",
    dataSchemaVersion: "9"
  };

  // test/utils/global.ts
  function getAddon() {
    return Zotero[config.addonRef];
  }

  // test/tests/startup.spec.ts
  describe("Startup", function() {
    it("should have plugin instance defined", function() {
      assert.isNotEmpty(getAddon());
    });
  });
})();

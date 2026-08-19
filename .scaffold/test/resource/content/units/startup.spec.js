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

  // test/tests/startup.spec.ts
  describe("Startup", function() {
    it("should have plugin instance defined", function() {
      assert.isNotEmpty(getAddon());
    });
  });
})();

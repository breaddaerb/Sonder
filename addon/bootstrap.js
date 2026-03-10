/**
 * Most of this code is from Zotero team's official Make It Red example[1]
 * or the Zotero 7 documentation[2].
 * [1] https://github.com/zotero/make-it-red
 * [2] https://www.zotero.org/support/dev/zotero_7_for_developers
 */

var chromeHandle;

function install(data, reason) {}

function writeMarker(message) {
  try {
    const file = Services.dirsvc.get("TmpD", Components.interfaces.nsIFile);
    file.append("sonder-bootstrap.log");
    const stream = Components.classes[
      "@mozilla.org/network/file-output-stream;1"
    ].createInstance(Components.interfaces.nsIFileOutputStream);
    stream.init(file, 0x02 | 0x08 | 0x10, 0o644, 0);
    const converter = Components.classes[
      "@mozilla.org/intl/converter-output-stream;1"
    ].createInstance(Components.interfaces.nsIConverterOutputStream);
    converter.init(stream, "UTF-8", 0, 0);
    converter.writeString(`${new Date().toISOString()} ${message}\n`);
    converter.close();
  } catch (e) {
    try {
      dump(`sonder marker failed: ${e}\n`);
    } catch {}
  }
}

async function startup({ id, version, resourceURI, rootURI }, reason) {
  try {
    writeMarker(`startup begin reason=${reason} rootURI=${rootURI}`);
    var aomStartup = Components.classes[
      "@mozilla.org/addons/addon-manager-startup;1"
    ].getService(Components.interfaces.amIAddonManagerStartup);
    var manifestURI = Services.io.newURI(rootURI + "manifest.json");
    chromeHandle = aomStartup.registerChrome(manifestURI, [
      ["content", "__addonRef__", rootURI + "content/"],
      ["locale", "__addonRef__", "en-US", rootURI + "locale/en-US/"],
      ["locale", "__addonRef__", "zh-CN", rootURI + "locale/zh-CN/"],
    ]);
    writeMarker("registerChrome ok");

    const ctx = { rootURI };
    ctx._globalThis = ctx;

    Services.scriptloader.loadSubScript(
      `${rootURI}/content/scripts/__addonRef__.js`,
      ctx,
    );
    writeMarker(`loadSubScript ok addonInstance=${!!Zotero.__addonInstance__}`);
    await Zotero.__addonInstance__.hooks.onStartup();
    writeMarker("hooks.onStartup ok");
  } catch (e) {
    writeMarker(`startup error ${e && e.stack ? e.stack : e}`);
    throw e;
  }
}

async function onMainWindowLoad({ window }, reason) {
  writeMarker("onMainWindowLoad");
  await Zotero.__addonInstance__?.hooks.onMainWindowLoad?.(window);
}

async function onMainWindowUnload({ window }, reason) {
  writeMarker("onMainWindowUnload");
  await Zotero.__addonInstance__?.hooks.onMainWindowUnload?.(window);
}

async function shutdown({ id, version, resourceURI, rootURI }, reason) {
  if (reason === APP_SHUTDOWN) {
    writeMarker("shutdown app_shutdown");
    return;
  }

  writeMarker(`shutdown begin reason=${reason}`);
  await Zotero.__addonInstance__?.hooks.onShutdown();

  Cu.unload(`${rootURI}/content/scripts/__addonRef__.js`);

  if (chromeHandle) {
    chromeHandle.destruct();
    chromeHandle = null;
  }
  writeMarker("shutdown done");
}

async function uninstall(data, reason) {
  writeMarker(`uninstall reason=${reason}`);
}

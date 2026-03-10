import { config } from "../package.json";
import ContextChatFeature from "./context-chat";
import { initLocale } from "./modules/locale";
import Views from "./modules/views";
import Utils from "./modules/utils";

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);
  try {
    initLocale();
  } catch (error: any) {
    Zotero.logError(error);
  }
  ztoolkit.ProgressWindow.setIconURI(
    "default",
    `chrome://${config.addonRef}/content/icons/favicon.png`
  );

  Zotero[config.addonInstance].views = new Views();
  Zotero[config.addonInstance].utils = new Utils();

  const contextChat = new ContextChatFeature();
  addon.api.contextChat = contextChat;
  await contextChat.start();

  Zotero.debug(`${config.addonRef}: startup ready`)

  if (addon.data.env === "development") {
    Zotero.Promise.delay(1200).then(() => {
      try {
        Zotero[config.addonInstance].views.show()
      } catch (error: any) {
        Zotero.logError(error)
      }
    })
  }
}

async function onMainWindowLoad(window: Window) {
  await addon.api.contextChat?.installWindow?.(window);
}

function onMainWindowUnload(window: Window) {
  addon.api.contextChat?.uninstallWindow?.(window);
}

async function onShutdown() {
  await addon.api.contextChat?.shutdown?.();
  ztoolkit.unregisterAll();
  addon.data.alive = false;
  delete Zotero[config.addonInstance];
  // @ts-ignore
  delete Zotero.__addonInstance__;
}

export default {
  onStartup,
  onMainWindowLoad,
  onMainWindowUnload,
  onShutdown,
};

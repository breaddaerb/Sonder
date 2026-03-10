import { config } from "../package.json";
import { getString, initLocale } from "./modules/locale";
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
  } catch (error) {
    Zotero.logError(error);
  }
  ztoolkit.ProgressWindow.setIconURI(
    "default",
    `chrome://${config.addonRef}/content/icons/favicon.png`
  );

  Zotero[config.addonInstance].views = new Views();

  Zotero[config.addonInstance].utils = new Utils();
  Zotero.debug(`${config.addonRef}: startup ready`)

  if (addon.data.env === "development") {
    Zotero.Promise.delay(1200).then(() => {
      try {
        Zotero[config.addonInstance].views.show()
      } catch (error) {
        Zotero.logError(error)
      }
    })
  }
}

function onShutdown(): void {
  ztoolkit.unregisterAll();
  addon.data.alive = false;
  delete Zotero[config.addonInstance];
  // @ts-ignore
  delete Zotero.__addonInstance__;
}

export default {
  onStartup,
  onShutdown,
};

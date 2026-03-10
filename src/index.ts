import { BasicTool } from "zotero-plugin-toolkit/dist/basic";
import Addon from "./addon";
import { config } from "../package.json";

const basicTool = new BasicTool();

if (!basicTool.getGlobal("Zotero")[config.addonInstance]) {
  _globalThis.addon = new Addon();
  configureAddon();
  defineGlobal("ztoolkit", () => {
    return _globalThis.addon.data.ztoolkit;
  });
  // @ts-ignore
  basicTool.getGlobal("Zotero")[config.addonInstance] = addon;
  // @ts-ignore
  basicTool.getGlobal("Zotero").__addonInstance__ = addon;
}

function configureAddon() {
  const ztoolkit = _globalThis.addon.data.ztoolkit;
  ztoolkit.basicOptions.log.prefix = `[${config.addonName}]`;
  ztoolkit.basicOptions.log.disableConsole = addon.data.env === "production";
  ztoolkit.UI.basicOptions.ui.enableElementJSONLog = false;
  ztoolkit.UI.basicOptions.ui.enableElementDOMLog = false;
  ztoolkit.basicOptions.debug.disableDebugBridgePassword = addon.data.env === "development";
}

function defineGlobal(name: Parameters<BasicTool["getGlobal"]>[0]): void;
function defineGlobal(name: string, getter: () => any): void;
function defineGlobal(name: string, getter?: () => any) {
  Object.defineProperty(_globalThis, name, {
    configurable: true,
    get() {
      return getter ? getter() : basicTool.getGlobal(name as any);
    },
  });
}

defineGlobal("ZoteroPane");
defineGlobal("Zotero_Tabs");
defineGlobal("window");
defineGlobal("document");
defineGlobal("URL", () => basicTool.getGlobal("window").URL);
defineGlobal("setTimeout", () => basicTool.getGlobal("window").setTimeout);
defineGlobal("URLSearchParams", () => basicTool.getGlobal("window").URLSearchParams);
defineGlobal("Headers", () => basicTool.getGlobal("window").Headers);
defineGlobal("AbortSignal", () => {
  const win = basicTool.getGlobal("window");
  const AbortSignal = win.AbortSignal;
  if (!AbortSignal.timeout) {
    AbortSignal.timeout = (ms: number) => {
      const controller = new win.AbortController();
      const timer = win.setTimeout(() => controller.abort(), ms);
      controller.signal.addEventListener("abort", () => {
        win.clearTimeout(timer);
      });
      return controller.signal;
    };
  }
  return AbortSignal;
});
defineGlobal("Request", () => basicTool.getGlobal("window").Request);

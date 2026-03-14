import { config } from "../../package.json";

class LocalStorage {
  public filename!: string;
  public cache: any;
  public lock: any;
  constructor(filename: string) {
    this.lock = Zotero.Promise.defer()
    this.init(filename)
  }

  private getOS() {
    const mainWindow = Zotero.getMainWindow() as any;
    if (mainWindow?.OS) {
      return mainWindow.OS;
    }
    const globalOS = (globalThis as any).OS;
    if (globalOS?.File && globalOS?.Path) {
      return globalOS;
    }
    try {
      const imported = (globalThis as any).ChromeUtils?.import?.("resource://gre/modules/osfile.jsm");
      if (imported?.OS?.File && imported?.OS?.Path) {
        return imported.OS;
      }
    } catch {
      // fall through
    }
    throw new Error("OS.File is unavailable in current Zotero runtime.");
  }

  async init(filename: string) {
    const OS = this.getOS();
    if (!(await OS.File.exists(filename))) {
      const temp = Zotero.getTempDirectory();
      this.filename = OS.Path.join(temp.path.replace(temp.leafName, ""), `${filename}.json`);
    } else {
      this.filename = filename
    }
    try {
      const rawString = await Zotero.File.getContentsAsync(this.filename) as string
      this.cache = JSON.parse(rawString)
    } catch {
      this.cache = {}
    }
    this.lock.resolve()
  }

  get(item: Zotero.Item | { key: string }, key: string) {
    if (this.cache == undefined) { return }
    return (this.cache[item.key] ??= {})[key]
  }

  async set(item: Zotero.Item | { key: string }, key: string, value: any) {
    await this.lock.promise;
    (this.cache[item.key] ??= {})[key] = value
    window.setTimeout(async () => {
      await Zotero.File.putContentsAsync(this.filename, JSON.stringify(this.cache));
    })
  }
}

export default LocalStorage


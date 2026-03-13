import Meet from "./Meet/api";

export interface LegacyViewsCompat {
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  _ids: Array<{ type: string; id: number }>;
  show: (...args: any[]) => void;
  setText: (text: string, isFinal?: boolean) => void;
  insertAuxiliary: (docs: any[]) => void;
  stopAlloutput: () => void;
}

export class LegacyViewsShim implements LegacyViewsCompat {
  public messages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [];
  public _ids: Array<{ type: string; id: number }> = [];

  public show() {
    try {
      addon.api.contextChat?.openInWindow?.(Zotero.getMainWindow());
    } catch (error: any) {
      Zotero.logError(error);
    }
  }

  public setText(_text: string, _isFinal?: boolean) {
    // Legacy popup output is retired from primary UX.
    // Keep no-op compatibility to avoid crashing old code paths.
  }

  public insertAuxiliary(_docs: any[]) {
    // Legacy auxiliary rendering is retired with popup UI.
  }

  public stopAlloutput() {
    this._ids.forEach((item) => {
      try {
        if (item?.id) {
          window.clearInterval(item.id);
        }
      } catch {
        // ignore
      }
    });
    this._ids = [];
  }

  public clear() {
    this.stopAlloutput();
    this.messages = [];
    Meet.Global.views = this as any;
  }
}

export default LegacyViewsShim;

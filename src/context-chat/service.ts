import ContextChatPanel from "./panel";
import ContextChatStore from "./storage";

export class ContextChatFeature {
  private readonly store = new ContextChatStore();
  private readonly panels = new Map<Window, ContextChatPanel>();

  public async start() {
    const mainWindow = Zotero.getMainWindow();
    if (mainWindow) {
      await this.installWindow(mainWindow);
    }
  }

  public async installWindow(window: Window) {
    if (this.panels.has(window)) {
      return;
    }
    await this.store.ready();
    const panel = new ContextChatPanel(window, this.store);
    panel.install();
    this.panels.set(window, panel);
  }

  public uninstallWindow(window: Window) {
    const panel = this.panels.get(window);
    panel?.destroy();
    this.panels.delete(window);
  }

  public async shutdown() {
    this.panels.forEach((panel) => panel.destroy());
    this.panels.clear();
    await this.store.ready();
  }
}

export default ContextChatFeature;

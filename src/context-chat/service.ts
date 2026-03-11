import ContextChatPanel from "./panel";
import ContextChatService from "./chatService";
import ContextChatStore from "./storage";

export class ContextChatFeature {
  private readonly store = new ContextChatStore();
  private readonly chatService = new ContextChatService(this.store);
  private readonly panels = new Map<Window, ContextChatPanel>();
  private readonly menuItems = new Map<Window, Element>();

  public async start() {
    const mainWindow = Zotero.getMainWindow();
    if (mainWindow) {
      await this.installWindow(mainWindow);
    }
  }

  private installMenuEntry(window: Window, panel: ContextChatPanel) {
    const doc = window.document as any;
    const parent = doc.getElementById("menu_ToolsPopup")
      || doc.getElementById("menuToolsPopup")
      || doc.getElementById("menu_AddonsPopup");
    if (!parent || this.menuItems.has(window)) {
      return;
    }

    const menuItem = doc.createXULElement
      ? doc.createXULElement("menuitem")
      : doc.createElement("menuitem");
    menuItem.id = "sonder-context-chat-menuitem";
    menuItem.setAttribute("label", "Sonder Chat Panel");
    menuItem.addEventListener("command", () => panel.open());
    parent.appendChild(menuItem);
    this.menuItems.set(window, menuItem);
  }

  public async installWindow(window: Window) {
    if (this.panels.has(window)) {
      return;
    }
    await this.store.ready();
    const panel = new ContextChatPanel(window, this.store, this.chatService);
    panel.install();
    this.panels.set(window, panel);
    this.installMenuEntry(window, panel);
  }

  public uninstallWindow(window: Window) {
    const panel = this.panels.get(window);
    panel?.destroy();
    this.panels.delete(window);
    const menuItem = this.menuItems.get(window);
    menuItem?.remove();
    this.menuItems.delete(window);
  }

  public async shutdown() {
    this.panels.forEach((panel) => panel.destroy());
    this.panels.clear();
    this.menuItems.forEach((menuItem) => menuItem.remove());
    this.menuItems.clear();
    await this.store.ready();
  }
}

export default ContextChatFeature;

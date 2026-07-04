import { app, BrowserWindow } from "electron";
import { registerIpcHandlers } from "./ipc";
import { closeOAuthCallbackServer, handleNotionOAuthCallback, setOAuthEventSender } from "./notion/oauth";
import { findProtocolUrl, registerAppProtocol } from "./protocol";
import { createMainWindow } from "./window";

let mainWindow: BrowserWindow | null = null;

setOAuthEventSender((event) => {
  mainWindow?.webContents.send("notion:oauth-event", event);
});

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
}

app.on("open-url", (event, url) => {
  event.preventDefault();
  void handleNotionOAuthCallback(url);
});

app.on("second-instance", (_event, argv) => {
  const callbackUrl = findProtocolUrl(argv);

  if (callbackUrl) {
    void handleNotionOAuthCallback(callbackUrl);
  }

  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  registerAppProtocol();
  registerIpcHandlers();
  mainWindow = createMainWindow();

  const launchCallbackUrl = findProtocolUrl(process.argv);

  if (launchCallbackUrl) {
    void handleNotionOAuthCallback(launchCallbackUrl);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  closeOAuthCallbackServer();

  if (process.platform !== "darwin") {
    app.quit();
  }
});

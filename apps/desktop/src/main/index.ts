import { app, BrowserWindow, ipcMain, shell } from "electron";
import { config as loadEnv } from "dotenv";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

loadEnv({ path: join(process.cwd(), ".env") });

const APP_NAME = "SamovarNotes MCP";
const APP_SUBTITLE = "AI Research-to-Notion Assistant";
const NOTION_OAUTH_AUTHORIZE_URL = "https://api.notion.com/v1/oauth/authorize";

function createNotionOAuthUrl(): string | null {
  const clientId = process.env.NOTION_OAUTH_CLIENT_ID;

  if (!clientId) {
    return null;
  }

  const redirectUri = process.env.NOTION_OAUTH_REDIRECT_URI ?? "samovar-notes-mcp://notion/callback";
  const authorizationUrl = new URL(NOTION_OAUTH_AUTHORIZE_URL);

  authorizationUrl.searchParams.set("client_id", clientId);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("owner", "user");
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("state", randomUUID());

  return authorizationUrl.toString();
}

function registerIpcHandlers(): void {
  ipcMain.handle("app:get-info", () => ({
    name: APP_NAME,
    subtitle: APP_SUBTITLE,
    version: app.getVersion(),
    platform: process.platform,
    packaged: app.isPackaged
  }));

  ipcMain.handle("app:open-external", async (_event, url: string) => {
    const parsedUrl = new URL(url);

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error("Only HTTP and HTTPS URLs can be opened externally.");
    }

    await shell.openExternal(parsedUrl.toString());

    return { ok: true };
  });

  ipcMain.handle("notion:start-oauth", async () => {
    const authorizationUrl = createNotionOAuthUrl();

    if (!authorizationUrl) {
      return {
        ok: false,
        reason: "missing-client-id"
      };
    }

    await shell.openExternal(authorizationUrl);

    return {
      ok: true
    };
  });
}

function createMainWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 960,
    minHeight: 640,
    title: APP_NAME,
    backgroundColor: "#f4f1ea",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, "../preload/index.mjs"),
      sandbox: true
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    return;
  }

  void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

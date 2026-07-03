import { app, BrowserWindow, ipcMain, safeStorage, shell } from "electron";
import { config as loadEnv } from "dotenv";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

function loadDesktopEnv(): void {
  const candidatePaths = [
    join(process.cwd(), ".env"),
    join(process.cwd(), "../..", ".env"),
    join(__dirname, "../../../..", ".env")
  ];
  const envPath = [...new Set(candidatePaths.map((candidatePath) => resolve(candidatePath)))].find((candidatePath) =>
    existsSync(candidatePath)
  );

  if (envPath) {
    loadEnv({ path: envPath });
  }
}

loadDesktopEnv();

const APP_NAME = "SamovarNotes MCP";
const APP_SUBTITLE = "AI Research-to-Notion Assistant";
const APP_PROTOCOL = "samovar-notes-mcp";
const NOTION_OAUTH_AUTHORIZE_URL = "https://api.notion.com/v1/oauth/authorize";
const NOTION_OAUTH_TOKEN_EXCHANGE_URL = process.env.NOTION_OAUTH_TOKEN_EXCHANGE_URL;

type NotionOAuthStatus =
  | "idle"
  | "opened"
  | "connected"
  | "needs-token-exchange"
  | "cancelled"
  | "error";

type StoredNotionWorkspace = {
  workspaceId: string;
  workspaceName?: string;
  workspaceIcon?: string;
  botId?: string;
  accessTokenCiphertext: string;
  refreshTokenCiphertext?: string;
  connectedAt: string;
  updatedAt: string;
};

type PublicNotionWorkspace = Omit<StoredNotionWorkspace, "accessTokenCiphertext" | "refreshTokenCiphertext">;

type NotionWorkspaceStore = {
  activeWorkspaceId?: string;
  workspaces: StoredNotionWorkspace[];
};

type NotionOAuthEvent = {
  status: NotionOAuthStatus;
  message: string;
  workspace?: PublicNotionWorkspace;
  error?: string;
};

type NotionTokenExchangeResponse = {
  access_token?: string;
  accessToken?: string;
  refresh_token?: string;
  refreshToken?: string;
  bot_id?: string;
  botId?: string;
  workspace_id?: string;
  workspaceId?: string;
  workspace_icon?: string;
  workspaceIcon?: string;
  workspace_name?: string;
  workspaceName?: string;
};

let mainWindow: BrowserWindow | null = null;
let latestOAuthEvent: NotionOAuthEvent = {
  status: "idle",
  message: "Notion OAuth has not started."
};

const pendingOAuthStates = new Map<string, number>();

function getWorkspaceStorePath(): string {
  return join(app.getPath("userData"), "notion-oauth-workspaces.json");
}

function toPublicWorkspace(workspace: StoredNotionWorkspace): PublicNotionWorkspace {
  const {
    accessTokenCiphertext: _accessTokenCiphertext,
    refreshTokenCiphertext: _refreshTokenCiphertext,
    ...publicWorkspace
  } = workspace;

  return publicWorkspace;
}

function protectSecret(secret: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return `safe:${safeStorage.encryptString(secret).toString("base64")}`;
  }

  return `base64:${Buffer.from(secret, "utf8").toString("base64")}`;
}

function createWorkspaceStore(
  workspaces: StoredNotionWorkspace[],
  activeWorkspaceId?: string
): NotionWorkspaceStore {
  const store: NotionWorkspaceStore = {
    workspaces
  };

  if (activeWorkspaceId) {
    store.activeWorkspaceId = activeWorkspaceId;
  }

  return store;
}

async function loadWorkspaceStore(): Promise<NotionWorkspaceStore> {
  try {
    const rawStore = await readFile(getWorkspaceStorePath(), "utf8");
    const parsed = JSON.parse(rawStore) as Partial<NotionWorkspaceStore>;

    return createWorkspaceStore(
      Array.isArray(parsed.workspaces) ? parsed.workspaces : [],
      parsed.activeWorkspaceId
    );
  } catch {
    return {
      workspaces: []
    };
  }
}

async function saveWorkspaceStore(store: NotionWorkspaceStore): Promise<void> {
  const storePath = getWorkspaceStorePath();

  await mkdir(dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(store, null, 2), "utf8");
}

async function upsertWorkspace(workspace: StoredNotionWorkspace): Promise<PublicNotionWorkspace> {
  const store = await loadWorkspaceStore();
  const nextWorkspaces = store.workspaces.filter((item) => item.workspaceId !== workspace.workspaceId);
  const nextStore = createWorkspaceStore([workspace, ...nextWorkspaces], workspace.workspaceId);

  await saveWorkspaceStore(nextStore);

  return toPublicWorkspace(workspace);
}

function setLatestOAuthEvent(event: NotionOAuthEvent): void {
  latestOAuthEvent = event;
  mainWindow?.webContents.send("notion:oauth-event", event);
}

function createNotionOAuthUrl(): { state: string; url: string } | null {
  const clientId = process.env.NOTION_OAUTH_CLIENT_ID;

  if (!clientId) {
    return null;
  }

  const redirectUri = process.env.NOTION_OAUTH_REDIRECT_URI ?? "samovar-notes-mcp://notion/callback";
  const authorizationUrl = new URL(NOTION_OAUTH_AUTHORIZE_URL);
  const state = randomUUID();

  pendingOAuthStates.set(state, Date.now());

  authorizationUrl.searchParams.set("client_id", clientId);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("owner", "user");
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("state", state);

  return {
    state,
    url: authorizationUrl.toString()
  };
}

function consumeOAuthState(state: string | null): boolean {
  if (!state || !pendingOAuthStates.has(state)) {
    return false;
  }

  pendingOAuthStates.delete(state);

  return true;
}

async function exchangeNotionOAuthCode(input: {
  code: string;
  redirectUri: string;
  state: string;
}): Promise<StoredNotionWorkspace> {
  if (!NOTION_OAUTH_TOKEN_EXCHANGE_URL) {
    throw new Error("missing-token-exchange-url");
  }

  const response = await fetch(NOTION_OAUTH_TOKEN_EXCHANGE_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(`token-exchange-failed:${response.status}`);
  }

  const body = (await response.json()) as NotionTokenExchangeResponse;
  const accessToken = body.access_token ?? body.accessToken;
  const workspaceId = body.workspace_id ?? body.workspaceId;

  if (!accessToken || !workspaceId) {
    throw new Error("invalid-token-exchange-response");
  }

  const now = new Date().toISOString();
  const workspace: StoredNotionWorkspace = {
    workspaceId,
    accessTokenCiphertext: protectSecret(accessToken),
    connectedAt: now,
    updatedAt: now
  };
  const workspaceName = body.workspace_name ?? body.workspaceName;
  const workspaceIcon = body.workspace_icon ?? body.workspaceIcon;
  const botId = body.bot_id ?? body.botId;
  const refreshToken = body.refresh_token ?? body.refreshToken;

  if (workspaceName) {
    workspace.workspaceName = workspaceName;
  }

  if (workspaceIcon) {
    workspace.workspaceIcon = workspaceIcon;
  }

  if (botId) {
    workspace.botId = botId;
  }

  if (refreshToken) {
    workspace.refreshTokenCiphertext = protectSecret(refreshToken);
  }

  return workspace;
}

async function handleNotionOAuthCallback(callbackUrl: string): Promise<void> {
  const parsedUrl = new URL(callbackUrl);

  if (parsedUrl.protocol !== `${APP_PROTOCOL}:` || parsedUrl.hostname !== "notion") {
    return;
  }

  const state = parsedUrl.searchParams.get("state");
  const error = parsedUrl.searchParams.get("error");

  if (error) {
    consumeOAuthState(state);
    setLatestOAuthEvent({
      status: "cancelled",
      message: "Notion authorization was cancelled.",
      error
    });
    return;
  }

  const code = parsedUrl.searchParams.get("code");

  if (!consumeOAuthState(state)) {
    setLatestOAuthEvent({
      status: "error",
      message: "Notion OAuth callback state did not match the current login attempt.",
      error: "invalid-state"
    });
    return;
  }

  if (!code || !state) {
    setLatestOAuthEvent({
      status: "error",
      message: "Notion OAuth callback did not include an authorization code.",
      error: "missing-code"
    });
    return;
  }

  const redirectUri = process.env.NOTION_OAUTH_REDIRECT_URI ?? "samovar-notes-mcp://notion/callback";

  try {
    const workspace = await exchangeNotionOAuthCode({
      code,
      redirectUri,
      state
    });
    const publicWorkspace = await upsertWorkspace(workspace);

    setLatestOAuthEvent({
      status: "connected",
      message: "Notion workspace connected.",
      workspace: publicWorkspace
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "unknown-error";

    setLatestOAuthEvent({
      status: errorMessage === "missing-token-exchange-url" ? "needs-token-exchange" : "error",
      message:
        errorMessage === "missing-token-exchange-url"
          ? "Notion returned an OAuth code. Configure a backend token exchange URL to finish connecting."
          : "Notion OAuth token exchange failed.",
      error: errorMessage
    });
  }
}

function findProtocolUrl(argv: string[]): string | undefined {
  return argv.find((value) => value.startsWith(`${APP_PROTOCOL}://`));
}

function registerAppProtocol(): void {
  if (process.defaultApp) {
    const scriptPath = process.argv[1];

    if (scriptPath) {
      app.setAsDefaultProtocolClient(APP_PROTOCOL, process.execPath, [scriptPath]);
      return;
    }
  }

  app.setAsDefaultProtocolClient(APP_PROTOCOL);
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
    const authorization = createNotionOAuthUrl();

    if (!authorization) {
      return {
        ok: false,
        reason: "missing-client-id"
      };
    }

    await shell.openExternal(authorization.url);

    setLatestOAuthEvent({
      status: "opened",
      message: "Notion sign-in opened in the browser."
    });

    return {
      ok: true
    };
  });

  ipcMain.handle("notion:list-workspaces", async () => {
    const store = await loadWorkspaceStore();

    return {
      activeWorkspaceId: store.activeWorkspaceId,
      workspaces: store.workspaces.map(toPublicWorkspace),
      latestOAuthEvent
    };
  });

  ipcMain.handle("notion:set-active-workspace", async (_event, workspaceId: string) => {
    const store = await loadWorkspaceStore();

    if (!store.workspaces.some((workspace) => workspace.workspaceId === workspaceId)) {
      throw new Error("Unknown Notion workspace.");
    }

    await saveWorkspaceStore({
      ...store,
      activeWorkspaceId: workspaceId
    });

    return { ok: true };
  });

  ipcMain.handle("notion:remove-workspace", async (_event, workspaceId: string) => {
    const store = await loadWorkspaceStore();
    const nextWorkspaces = store.workspaces.filter((workspace) => workspace.workspaceId !== workspaceId);
    const nextActiveWorkspaceId =
      store.activeWorkspaceId === workspaceId ? nextWorkspaces[0]?.workspaceId : store.activeWorkspaceId;

    await saveWorkspaceStore(createWorkspaceStore(nextWorkspaces, nextActiveWorkspaceId));

    return { ok: true };
  });
}

function createMainWindow(): void {
  const browserWindow = new BrowserWindow({
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
      preload: join(__dirname, "../preload/index.cjs"),
      sandbox: true
    }
  });

  mainWindow = browserWindow;

  browserWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
    console.error(`[renderer] Failed to load ${validatedUrl}: ${errorCode} ${errorDescription}`);
  });

  browserWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error(`[renderer] Process gone: ${details.reason}`);
  });

  browserWindow.once("ready-to-show", () => {
    browserWindow.show();
  });

  browserWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void browserWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    return;
  }

  void browserWindow.loadFile(join(__dirname, "../renderer/index.html"));
}

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
  createMainWindow();

  const launchCallbackUrl = findProtocolUrl(process.argv);

  if (launchCallbackUrl) {
    void handleNotionOAuthCallback(launchCallbackUrl);
  }

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

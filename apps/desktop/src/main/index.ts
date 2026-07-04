import { app, BrowserWindow, ipcMain, safeStorage, shell } from "electron";
import { config as loadEnv } from "dotenv";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
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
const NOTION_OAUTH_CALLBACK_HOST = "127.0.0.1";
const NOTION_OAUTH_CALLBACK_PORT = Number(process.env.NOTION_OAUTH_CALLBACK_PORT ?? "47837");
const NOTION_OAUTH_CALLBACK_PATH = "/notion/callback";
const NOTION_OAUTH_AUTHORIZE_URL = "https://api.notion.com/v1/oauth/authorize";
const NOTION_OAUTH_TOKEN_URL = "https://api.notion.com/v1/oauth/token";
const NOTION_OAUTH_TOKEN_EXCHANGE_URL = process.env.NOTION_OAUTH_TOKEN_EXCHANGE_URL;
const NOTION_API_BASE_URL = "https://api.notion.com/v1";
const NOTION_API_VERSION = process.env.NOTION_API_VERSION ?? "2026-03-11";
const NOTION_LEGACY_DATABASE_VERSION = "2022-06-28";

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
  authStatus?: "connected" | "token-exchange-pending";
  accessTokenCiphertext?: string;
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

type NotionChatCommandInput = {
  message: string;
  workspaceId?: string;
};

type NotionChatCommandResult = {
  ok: boolean;
  message: string;
  url?: string;
};

type NotionObjectResponse = {
  id: string;
  url?: string;
};

type ParsedNotionCommand = {
  kind: "page" | "table" | "database";
  title: string;
  rowCount: number;
  columnCount: number;
  columns: string[];
};

let mainWindow: BrowserWindow | null = null;
let oauthCallbackServer: Server | null = null;
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

function revealSecret(secretCiphertext: string): string {
  if (secretCiphertext.startsWith("safe:")) {
    return safeStorage.decryptString(Buffer.from(secretCiphertext.slice("safe:".length), "base64"));
  }

  if (secretCiphertext.startsWith("base64:")) {
    return Buffer.from(secretCiphertext.slice("base64:".length), "base64").toString("utf8");
  }

  throw new Error("unsupported-secret-format");
}

function textRichText(content: string) {
  return [
    {
      type: "text",
      text: {
        content
      }
    }
  ];
}

function titleProperty(title: string) {
  return {
    title: textRichText(title)
  };
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

function createPendingTokenExchangeWorkspace(state: string): StoredNotionWorkspace {
  const now = new Date().toISOString();

  return {
    workspaceId: `pending-${state}`,
    workspaceName: "Authorized Notion workspace",
    authStatus: "token-exchange-pending",
    connectedAt: now,
    updatedAt: now
  };
}

function setLatestOAuthEvent(event: NotionOAuthEvent): void {
  latestOAuthEvent = event;
  mainWindow?.webContents.send("notion:oauth-event", event);
}

function getDefaultNotionOAuthRedirectUri(): string {
  return `http://${NOTION_OAUTH_CALLBACK_HOST}:${NOTION_OAUTH_CALLBACK_PORT}${NOTION_OAUTH_CALLBACK_PATH}`;
}

function createNotionOAuthUrl(): { state: string; url: string } | null {
  const clientId = process.env.NOTION_OAUTH_CLIENT_ID;

  if (!clientId) {
    return null;
  }

  const redirectUri = process.env.NOTION_OAUTH_REDIRECT_URI ?? getDefaultNotionOAuthRedirectUri();
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

function isNotionOAuthCallbackUrl(parsedUrl: URL): boolean {
  const isCustomProtocolCallback =
    parsedUrl.protocol === `${APP_PROTOCOL}:` && parsedUrl.hostname === "notion";
  const isLoopbackCallback =
    parsedUrl.protocol === "http:" &&
    ["127.0.0.1", "localhost"].includes(parsedUrl.hostname) &&
    parsedUrl.port === String(NOTION_OAUTH_CALLBACK_PORT) &&
    parsedUrl.pathname === NOTION_OAUTH_CALLBACK_PATH;

  return isCustomProtocolCallback || isLoopbackCallback;
}

async function exchangeNotionOAuthCode(input: {
  code: string;
  redirectUri: string;
  state: string;
}): Promise<StoredNotionWorkspace> {
  const clientId = process.env.NOTION_OAUTH_CLIENT_ID;
  const clientSecret = process.env.NOTION_OAUTH_CLIENT_SECRET;

  if (!NOTION_OAUTH_TOKEN_EXCHANGE_URL && (!clientId || !clientSecret)) {
    throw new Error("missing-token-exchange-url");
  }

  const tokenExchangeUrl = NOTION_OAUTH_TOKEN_EXCHANGE_URL ?? NOTION_OAUTH_TOKEN_URL;
  const tokenExchangePayload: Record<string, string> = NOTION_OAUTH_TOKEN_EXCHANGE_URL
    ? input
    : {
        client_id: clientId ?? "",
        client_secret: clientSecret ?? "",
        grant_type: "authorization_code",
        code: input.code,
        redirect_uri: input.redirectUri
      };

  const response = await fetch(tokenExchangeUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(tokenExchangePayload)
  });

  if (!response.ok) {
    throw new Error(`token-exchange-failed:${response.status}`);
  }

  const tokenBody = (await response.json()) as NotionTokenExchangeResponse;
  const accessToken = tokenBody.access_token ?? tokenBody.accessToken;
  const workspaceId = tokenBody.workspace_id ?? tokenBody.workspaceId;

  if (!accessToken || !workspaceId) {
    throw new Error("invalid-token-exchange-response");
  }

  const now = new Date().toISOString();
  const workspace: StoredNotionWorkspace = {
    workspaceId,
    authStatus: "connected",
    accessTokenCiphertext: protectSecret(accessToken),
    connectedAt: now,
    updatedAt: now
  };
  const workspaceName = tokenBody.workspace_name ?? tokenBody.workspaceName;
  const workspaceIcon = tokenBody.workspace_icon ?? tokenBody.workspaceIcon;
  const botId = tokenBody.bot_id ?? tokenBody.botId;
  const refreshToken = tokenBody.refresh_token ?? tokenBody.refreshToken;

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

  if (!isNotionOAuthCallbackUrl(parsedUrl)) {
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

  const redirectUri = process.env.NOTION_OAUTH_REDIRECT_URI ?? getDefaultNotionOAuthRedirectUri();

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

    if (errorMessage === "missing-token-exchange-url") {
      const publicWorkspace = await upsertWorkspace(createPendingTokenExchangeWorkspace(state));

      setLatestOAuthEvent({
        status: "connected",
        message: "Notion authorization received. Token exchange can be connected next.",
        workspace: publicWorkspace
      });
      return;
    }

    setLatestOAuthEvent({
      status: "error",
      message: "Notion OAuth token exchange failed.",
      error: errorMessage
    });
  }
}

async function handleOAuthHttpRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const callbackUrl = new URL(request.url ?? "/", getDefaultNotionOAuthRedirectUri());

  if (!isNotionOAuthCallbackUrl(callbackUrl)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  await handleNotionOAuthCallback(callbackUrl.toString());

  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>SamovarNotes MCP</title></head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 48px;">
    <h1>Notion callback received</h1>
    <p>You can return to SamovarNotes MCP.</p>
  </body>
</html>`);
}

async function ensureOAuthCallbackServer(): Promise<void> {
  if (oauthCallbackServer) {
    return;
  }

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const server = createServer((request, response) => {
      void handleOAuthHttpRequest(request, response).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Unknown callback error";

        response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        response.end(message);
      });
    });

    server.once("error", rejectPromise);
    server.listen(NOTION_OAUTH_CALLBACK_PORT, NOTION_OAUTH_CALLBACK_HOST, () => {
      oauthCallbackServer = server;
      resolvePromise();
    });
  });
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

function mapNotionError(error: unknown): string {
  const message = error instanceof Error ? error.message : "unknown-error";

  if (message === "missing-notion-workspace") {
    return "Connect Notion first, then send the command again.";
  }

  if (message === "token-exchange-required") {
    return "Notion is authorized, but this workspace has no access token yet. Add NOTION_OAUTH_CLIENT_SECRET to .env, restart the app, and reconnect Notion.";
  }

  if (message.includes("notion-api-failed:403")) {
    return "Notion refused the request. Check that the OAuth connection has Insert Content permissions and access to the target workspace.";
  }

  if (message.includes("notion-api-failed:401")) {
    return "Notion access token is invalid or expired. Reconnect the Notion workspace.";
  }

  return `Notion command failed: ${message}`;
}

function createNotionSuccess(message: string, url?: string): NotionChatCommandResult {
  return url
    ? {
        ok: true,
        message,
        url
      }
    : {
        ok: true,
        message
      };
}

function parsePositiveCount(message: string, patterns: RegExp[], fallback: number): number {
  for (const pattern of patterns) {
    const match = message.match(pattern);
    const parsed = Number(match?.[1]);

    if (Number.isInteger(parsed) && parsed > 0) {
      return Math.min(parsed, 50);
    }
  }

  return fallback;
}

function parseCommandTitle(message: string, kind: ParsedNotionCommand["kind"]): string {
  const quotedTitle = message.match(/["“](.+?)["”]/)?.[1]?.trim();

  if (quotedTitle) {
    return quotedTitle.slice(0, 100);
  }

  const withoutCounts = message
    .replace(/\b\d+\s*(?:rows?|columns?|cols?)\b/gi, "")
    .replace(/\b(?:create|make|build|add|please|empty|with|where|you|need|to|and|just|do|what|i|said)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (withoutCounts.length > 12) {
    return withoutCounts.slice(0, 100);
  }

  if (kind === "database") {
    return "Samovar Database";
  }

  if (kind === "table") {
    return "Samovar Table";
  }

  return "Samovar Page";
}

function parseColumnNames(message: string, columnCount: number): string[] {
  const explicitColumns = message.match(/(?:columns?|cols?)\s*:\s*([a-z0-9а-яё,\s_-]+)/i)?.[1];

  if (explicitColumns) {
    const columns = explicitColumns
      .split(",")
      .map((column) => column.trim())
      .filter(Boolean)
      .slice(0, columnCount);

    if (columns.length > 0) {
      return [
        ...columns,
        ...Array.from({ length: Math.max(0, columnCount - columns.length) }, (_item, index) => `Column ${columns.length + index + 1}`)
      ];
    }
  }

  return Array.from({ length: columnCount }, (_item, index) => `Column ${index + 1}`);
}

function parseNotionCommand(message: string): ParsedNotionCommand {
  const normalizedMessage = message.toLowerCase();
  const kind: ParsedNotionCommand["kind"] = /database|db|баз[ауы]|датаб/.test(normalizedMessage)
    ? "database"
    : /table|таблиц/.test(normalizedMessage)
      ? "table"
      : "page";
  const defaultRows = kind === "page" ? 0 : 3;
  const defaultColumns = kind === "page" ? 0 : 3;
  const rowCount = parsePositiveCount(
    message,
    [/(\d+)\s*(?:rows?|row|строк|строки|строка|рядов|ряда)/i],
    defaultRows
  );
  const columnCount = parsePositiveCount(
    message,
    [/(\d+)\s*(?:columns?|cols?|column|колонок|колонки|колонка|столбцов|столбца)/i],
    defaultColumns
  );

  return {
    kind,
    title: parseCommandTitle(message, kind),
    rowCount,
    columnCount,
    columns: parseColumnNames(message, columnCount)
  };
}

function createParagraphBlock(content: string): Record<string, unknown> {
  return {
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: textRichText(content)
    }
  };
}

function createTableRowBlock(values: string[]): Record<string, unknown> {
  return {
    object: "block",
    type: "table_row",
    table_row: {
      cells: values.map((value) => textRichText(value || " "))
    }
  };
}

function createTableBlock(command: ParsedNotionCommand): Record<string, unknown> {
  const rows = Array.from({ length: command.rowCount }, (_item, rowIndex) =>
    createTableRowBlock(command.columns.map(() => `Row ${rowIndex + 1}`))
  );

  return {
    object: "block",
    type: "table",
    table: {
      table_width: command.columnCount,
      has_column_header: true,
      has_row_header: false,
      children: [createTableRowBlock(command.columns), ...rows]
    }
  };
}

async function readActiveWorkspace(workspaceId?: string): Promise<StoredNotionWorkspace> {
  const store = await loadWorkspaceStore();
  const activeWorkspace =
    store.workspaces.find((workspace) => workspace.workspaceId === workspaceId) ??
    store.workspaces.find((workspace) => workspace.workspaceId === store.activeWorkspaceId) ??
    store.workspaces[0];

  if (!activeWorkspace) {
    throw new Error("missing-notion-workspace");
  }

  return activeWorkspace;
}

async function getWorkspaceAccessToken(workspaceId?: string): Promise<string> {
  const envToken = process.env.NOTION_ACCESS_TOKEN ?? process.env.NOTION_API_KEY;
  const workspace = await readActiveWorkspace(workspaceId);

  if (workspace.accessTokenCiphertext) {
    return revealSecret(workspace.accessTokenCiphertext);
  }

  if (envToken) {
    return envToken;
  }

  throw new Error("token-exchange-required");
}

async function notionRequest<T>(
  accessToken: string,
  path: string,
  body: Record<string, unknown>,
  notionVersion = NOTION_API_VERSION
): Promise<T> {
  const response = await fetch(`${NOTION_API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Notion-Version": notionVersion
    },
    body: JSON.stringify(body)
  });

  const responseBody = await response.text();

  if (!response.ok) {
    throw new Error(`notion-api-failed:${response.status}:${responseBody}`);
  }

  return JSON.parse(responseBody) as T;
}

async function createNotionPage(
  accessToken: string,
  title: string,
  children: Record<string, unknown>[] = []
): Promise<NotionObjectResponse> {
  return notionRequest<NotionObjectResponse>(accessToken, "/pages", {
    parent: {
      type: "workspace",
      workspace: true
    },
    properties: {
      title: titleProperty(title)
    },
    children
  });
}

function createLegacyDatabaseProperties(columns: string[]): Record<string, unknown> {
  return columns.reduce<Record<string, unknown>>((properties, column, index) => {
    properties[column] = index === 0 ? { title: {} } : { rich_text: {} };
    return properties;
  }, {});
}

function createLegacyDatabaseRowProperties(columns: string[], rowIndex: number): Record<string, unknown> {
  return columns.reduce<Record<string, unknown>>((properties, column, columnIndex) => {
    properties[column] =
      columnIndex === 0
        ? titleProperty(`Row ${rowIndex + 1}`)
        : {
            rich_text: textRichText(" ")
          };

    return properties;
  }, {});
}

async function createNotionDatabase(
  accessToken: string,
  command: ParsedNotionCommand
): Promise<NotionObjectResponse> {
  const parentPage = await createNotionPage(accessToken, command.title, [
    createParagraphBlock("SamovarNotes created this page as a parent for the requested database.")
  ]);

  const database = await notionRequest<NotionObjectResponse>(
    accessToken,
    "/databases",
    {
      parent: {
        type: "page_id",
        page_id: parentPage.id
      },
      title: textRichText(command.title),
      properties: createLegacyDatabaseProperties(command.columns)
    },
    NOTION_LEGACY_DATABASE_VERSION
  );

  for (let rowIndex = 0; rowIndex < command.rowCount; rowIndex += 1) {
    await notionRequest<NotionObjectResponse>(
      accessToken,
      "/pages",
      {
        parent: {
          database_id: database.id
        },
        properties: createLegacyDatabaseRowProperties(command.columns, rowIndex)
      },
      NOTION_LEGACY_DATABASE_VERSION
    );
  }

  return database;
}

async function executeNotionChatCommand(input: NotionChatCommandInput): Promise<NotionChatCommandResult> {
  const message = input.message.trim();

  if (!message) {
    return {
      ok: false,
      message: "Type what you want SamovarNotes to create in Notion."
    };
  }

  try {
    const accessToken = await getWorkspaceAccessToken(input.workspaceId);
    const command = parseNotionCommand(message);

    if (command.kind === "database") {
      const database = await createNotionDatabase(accessToken, command);

      return createNotionSuccess(
        `Created a Notion database with ${command.columnCount} columns and ${command.rowCount} rows.${database.url ? `\n${database.url}` : ""}`,
        database.url
      );
    }

    if (command.kind === "table") {
      const page = await createNotionPage(accessToken, command.title, [
        createParagraphBlock("SamovarNotes created this table from your chat command."),
        createTableBlock(command)
      ]);

      return createNotionSuccess(
        `Created a Notion page with a ${command.columnCount}-column table and ${command.rowCount} rows.${page.url ? `\n${page.url}` : ""}`,
        page.url
      );
    }

    const page = await createNotionPage(accessToken, command.title);

    return createNotionSuccess(`Created an empty Notion page.${page.url ? `\n${page.url}` : ""}`, page.url);
  } catch (error) {
    return {
      ok: false,
      message: mapNotionError(error)
    };
  }
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

    try {
      await ensureOAuthCallbackServer();
    } catch {
      return {
        ok: false,
        reason: "callback-server-failed"
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

  ipcMain.handle("notion:execute-chat-command", async (_event, input: NotionChatCommandInput) =>
    executeNotionChatCommand(input)
  );
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
  oauthCallbackServer?.close();

  if (process.platform !== "darwin") {
    app.quit();
  }
});

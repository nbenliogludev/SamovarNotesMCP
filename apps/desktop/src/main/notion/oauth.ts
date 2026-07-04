import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  APP_PROTOCOL,
  getOptionalEnv,
  NOTION_OAUTH_AUTHORIZE_URL,
  NOTION_OAUTH_CALLBACK_HOST,
  NOTION_OAUTH_CALLBACK_PATH,
  NOTION_OAUTH_CALLBACK_PORT,
  NOTION_OAUTH_TOKEN_EXCHANGE_URL,
  NOTION_OAUTH_TOKEN_URL
} from "../config";
import type { NotionOAuthEvent, NotionTokenExchangeResponse, StoredNotionWorkspace } from "../types";
import { protectSecret } from "./secretStorage";
import { createPendingTokenExchangeWorkspace, upsertWorkspace } from "./workspaces";

let oauthCallbackServer: Server | null = null;
let latestOAuthEvent: NotionOAuthEvent = {
  status: "idle",
  message: "Notion OAuth has not started."
};
let oauthEventSender: ((event: NotionOAuthEvent) => void) | undefined;

const pendingOAuthStates = new Map<string, number>();

export function getLatestOAuthEvent(): NotionOAuthEvent {
  return latestOAuthEvent;
}

export function setOAuthEventSender(sender: (event: NotionOAuthEvent) => void): void {
  oauthEventSender = sender;
}

export function setLatestOAuthEvent(event: NotionOAuthEvent): void {
  latestOAuthEvent = event;
  oauthEventSender?.(event);
}

function formatTokenExchangeError(errorMessage: string): string {
  if (!errorMessage.startsWith("token-exchange-failed:")) {
    return `Notion OAuth token exchange failed: ${errorMessage}`;
  }

  const [status, ...bodyParts] = errorMessage.slice("token-exchange-failed:".length).split(":");
  const body = bodyParts.join(":");

  if (!status) {
    return "Notion OAuth token exchange failed.";
  }

  try {
    const parsed = JSON.parse(body) as {
      code?: string;
      error?: string;
      error_description?: string;
      message?: string;
      request_id?: string;
    };
    const details = parsed.error_description ?? parsed.message ?? parsed.error ?? parsed.code;
    const requestId = parsed.request_id ? ` Request id: ${parsed.request_id}` : "";

    return details
      ? `Notion OAuth token exchange failed (${status}): ${details}${requestId}`
      : `Notion OAuth token exchange failed (${status}).`;
  } catch {
    return body
      ? `Notion OAuth token exchange failed (${status}): ${body.slice(0, 180)}`
      : `Notion OAuth token exchange failed (${status}).`;
  }
}

export function getDefaultNotionOAuthRedirectUri(): string {
  return `http://${NOTION_OAUTH_CALLBACK_HOST}:${NOTION_OAUTH_CALLBACK_PORT}${NOTION_OAUTH_CALLBACK_PATH}`;
}

export function createNotionOAuthUrl(): { state: string; url: string } | null {
  const clientId = getOptionalEnv("NOTION_OAUTH_CLIENT_ID");

  if (!clientId) {
    return null;
  }

  const redirectUri = getOptionalEnv("NOTION_OAUTH_REDIRECT_URI") ?? getDefaultNotionOAuthRedirectUri();
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
  const clientId = getOptionalEnv("NOTION_OAUTH_CLIENT_ID");
  const clientSecret = getOptionalEnv("NOTION_OAUTH_CLIENT_SECRET");

  if (!NOTION_OAUTH_TOKEN_EXCHANGE_URL && (!clientId || !clientSecret)) {
    throw new Error("missing-token-exchange-url");
  }

  const tokenExchangeUrl = NOTION_OAUTH_TOKEN_EXCHANGE_URL ?? NOTION_OAUTH_TOKEN_URL;
  const tokenExchangePayload: Record<string, string> = NOTION_OAUTH_TOKEN_EXCHANGE_URL
    ? input
    : {
        grant_type: "authorization_code",
        code: input.code,
        redirect_uri: input.redirectUri
      };
  const tokenExchangeHeaders: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json"
  };

  if (!NOTION_OAUTH_TOKEN_EXCHANGE_URL) {
    tokenExchangeHeaders.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
  }

  const response = await fetch(tokenExchangeUrl, {
    method: "POST",
    headers: tokenExchangeHeaders,
    body: JSON.stringify(tokenExchangePayload)
  });

  if (!response.ok) {
    throw new Error(`token-exchange-failed:${response.status}:${await response.text()}`);
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

export async function handleNotionOAuthCallback(callbackUrl: string): Promise<void> {
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

  const redirectUri = getOptionalEnv("NOTION_OAUTH_REDIRECT_URI") ?? getDefaultNotionOAuthRedirectUri();

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

    console.error("Notion OAuth token exchange failed", error);

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
      message: formatTokenExchangeError(errorMessage),
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

export async function ensureOAuthCallbackServer(): Promise<void> {
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

export function closeOAuthCallbackServer(): void {
  oauthCallbackServer?.close();
  oauthCallbackServer = null;
}

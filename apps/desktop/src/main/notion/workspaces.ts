import { app } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getOptionalEnv, NOTION_OAUTH_TOKEN_EXCHANGE_URL } from "../config";
import type { NotionWorkspaceStore, PublicNotionWorkspace, StoredNotionWorkspace } from "../types";
import { revealSecret } from "./secretStorage";

function getWorkspaceStorePath(): string {
  return join(app.getPath("userData"), "notion-oauth-workspaces.json");
}

export function toPublicWorkspace(workspace: StoredNotionWorkspace): PublicNotionWorkspace {
  const {
    accessTokenCiphertext: _accessTokenCiphertext,
    refreshTokenCiphertext: _refreshTokenCiphertext,
    ...publicWorkspace
  } = workspace;

  return publicWorkspace;
}

export function createWorkspaceStore(
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

export async function loadWorkspaceStore(): Promise<NotionWorkspaceStore> {
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

export async function saveWorkspaceStore(store: NotionWorkspaceStore): Promise<void> {
  const storePath = getWorkspaceStorePath();

  await mkdir(dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(store, null, 2), "utf8");
}

export async function upsertWorkspace(workspace: StoredNotionWorkspace): Promise<PublicNotionWorkspace> {
  const store = await loadWorkspaceStore();
  const nextWorkspaces = store.workspaces.filter((item) => item.workspaceId !== workspace.workspaceId);
  const nextStore = createWorkspaceStore([workspace, ...nextWorkspaces], workspace.workspaceId);

  await saveWorkspaceStore(nextStore);

  return toPublicWorkspace(workspace);
}

export function createPendingTokenExchangeWorkspace(state: string): StoredNotionWorkspace {
  const now = new Date().toISOString();

  return {
    workspaceId: `pending-${state}`,
    workspaceName: "Authorized Notion workspace",
    authStatus: "token-exchange-pending",
    connectedAt: now,
    updatedAt: now
  };
}

export async function readActiveWorkspace(workspaceId?: string): Promise<StoredNotionWorkspace> {
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

export async function getWorkspaceAccessToken(workspaceId?: string): Promise<string> {
  const envToken = getOptionalEnv("NOTION_ACCESS_TOKEN") ?? getOptionalEnv("NOTION_API_KEY");
  const workspace = await readActiveWorkspace(workspaceId);

  if (workspace.accessTokenCiphertext) {
    return revealSecret(workspace.accessTokenCiphertext);
  }

  if (envToken) {
    return envToken;
  }

  throw new Error("token-exchange-required");
}

export function hasTokenExchangeConfiguration(): boolean {
  return Boolean(getOptionalEnv("NOTION_OAUTH_CLIENT_SECRET") || NOTION_OAUTH_TOKEN_EXCHANGE_URL);
}

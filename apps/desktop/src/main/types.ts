export type NotionOAuthStatus =
  | "idle"
  | "opened"
  | "connected"
  | "needs-token-exchange"
  | "cancelled"
  | "error";

export type StoredNotionWorkspace = {
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

export type PublicNotionWorkspace = Omit<StoredNotionWorkspace, "accessTokenCiphertext" | "refreshTokenCiphertext">;

export type NotionWorkspaceStore = {
  activeWorkspaceId?: string;
  workspaces: StoredNotionWorkspace[];
};

export type NotionOAuthEvent = {
  status: NotionOAuthStatus;
  message: string;
  workspace?: PublicNotionWorkspace;
  error?: string;
};

export type NotionTokenExchangeResponse = {
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

export type NotionChatCommandInput = {
  message: string;
  workspaceId?: string;
};

export type NotionChatCommandResult = {
  ok: boolean;
  message: string;
  url?: string;
};

export type NotionObjectResponse = {
  id: string;
  url?: string;
};

export type ParsedNotionCommand = {
  kind: "page" | "table" | "database";
  title: string;
  rowCount: number;
  columnCount: number;
  columns: string[];
};

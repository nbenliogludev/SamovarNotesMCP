export type NotionWorkspaceToken = {
  workspaceId: string;
  workspaceName?: string;
  accessToken: string;
  botId?: string;
};

export type NotionOAuthCallbackInput = {
  code: string;
  state?: string;
};

export interface NotionAuthService {
  generateAuthorizationUrl(input?: { state?: string }): Promise<string>;
  handleCallback(input: NotionOAuthCallbackInput): Promise<NotionWorkspaceToken>;
  exchangeCodeForAccessToken(code: string): Promise<NotionWorkspaceToken>;
  getWorkspaceToken(workspaceId: string): Promise<NotionWorkspaceToken | null>;
}

export class MvpTokenNotionAuthService {
  constructor(private readonly token: string) {}

  async generateAuthorizationUrl(): Promise<string> {
    throw new Error("Notion OAuth is not implemented in the MVP token mode.");
  }

  async handleCallback(): Promise<NotionWorkspaceToken> {
    throw new Error("Notion OAuth callbacks are not implemented in the MVP token mode.");
  }

  async exchangeCodeForAccessToken(): Promise<NotionWorkspaceToken> {
    throw new Error("Notion OAuth token exchange must happen on a backend service.");
  }

  async getWorkspaceToken(workspaceId: string): Promise<NotionWorkspaceToken> {
    return {
      workspaceId,
      accessToken: this.token
    };
  }
}

export type NotionTokenConnection = {
  accessToken: string;
  parentPageId?: string;
};

export interface NotionTokenConnectionService {
  getConnection(): Promise<NotionTokenConnection | null>;
}

export class StaticNotionTokenConnectionService implements NotionTokenConnectionService {
  constructor(
    private readonly token: string,
    private readonly parentPageId?: string
  ) {}

  async getConnection(): Promise<NotionTokenConnection> {
    return {
      accessToken: this.token,
      ...(this.parentPageId ? { parentPageId: this.parentPageId } : {})
    };
  }
}

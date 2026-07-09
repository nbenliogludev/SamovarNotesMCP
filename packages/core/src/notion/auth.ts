export type NotionTokenConnection = {
  accessToken: string;
};

export interface NotionTokenConnectionService {
  getConnection(): Promise<NotionTokenConnection | null>;
}

export class StaticNotionTokenConnectionService implements NotionTokenConnectionService {
  constructor(private readonly token: string) {}

  async getConnection(): Promise<NotionTokenConnection> {
    return {
      accessToken: this.token
    };
  }
}

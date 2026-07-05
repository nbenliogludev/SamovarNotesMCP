export type StoredConnectionSettings = {
  openAiApiKeyCiphertext?: string;
  openAiModel: string;
  notionTokenCiphertext?: string;
  notionParentPageId?: string;
  updatedAt?: string;
};

export type PublicConnectionSettings = {
  hasOpenAiApiKey: boolean;
  hasNotionToken: boolean;
  isConfigured: boolean;
  openAiModel: string;
  notionParentPageId?: string;
  updatedAt?: string;
};

export type SaveConnectionSettingsInput = {
  openAiApiKey?: string;
  openAiModel?: string;
  notionToken?: string;
  notionParentPageId?: string;
  clearOpenAiApiKey?: boolean;
  clearNotionToken?: boolean;
};

export type ConnectionTestResult = {
  ok: boolean;
  openAi: {
    ok: boolean;
    message: string;
  };
  notion: {
    ok: boolean;
    message: string;
  };
};

export type NotionChatCommandInput = {
  message: string;
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

import {
  NOTION_API_BASE_URL,
  NOTION_API_VERSION,
  NOTION_LEGACY_DATABASE_VERSION
} from "../config";
import type { NotionChatCommandInput, NotionChatCommandResult, NotionObjectResponse, ParsedNotionCommand } from "../types";
import { runNotionAgent, type NotionAgentFunctionCall } from "../openai/notionAgent";
import { getNotionAccessToken } from "../settingsStore";
import { createParagraphBlock, createTableBlockFromRows, createTextBlock, type NotionTextBlockType } from "./blocks";
import { textRichText, titleProperty } from "./richText";

type NotionSearchResult = NotionObjectResponse & {
  object?: string;
  properties?: Record<string, unknown>;
  title?: Array<{ plain_text?: string; text?: { content?: string } }>;
  archived?: boolean;
};

type NotionSearchResponse = {
  results?: NotionSearchResult[];
};

type NotionBlockResponse = {
  id?: string;
  type?: string;
  has_children?: boolean;
  [key: string]: unknown;
};

type NotionBlockChildrenResponse = {
  results?: NotionBlockResponse[];
};

type NotionDatabaseResponse = NotionObjectResponse & {
  title?: Array<{ plain_text?: string; text?: { content?: string } }>;
  properties?: Record<string, unknown>;
};

type NotionDatabaseQueryResponse = {
  results?: NotionSearchResult[];
};

type NotionPageReference = {
  id: string;
  title: string;
  url?: string;
};

type NotionDatabaseReference = {
  id: string;
  title: string;
  url?: string;
};

type NotionPageParent =
  | {
      type: "workspace";
      workspace: true;
    }
  | {
      type: "page_id";
      page_id: string;
    };

function mapExecutionError(error: unknown): string {
  const message = error instanceof Error ? error.message : "unknown-error";

  if (message === "missing-openai-api-key") {
    return "Add an OpenAI API key in Settings, then send the command again.";
  }

  if (message === "openai-agent-empty-response") {
    return "OpenAI returned an empty answer. Try sending the request again.";
  }

  if (message === "openai-agent-tool-round-limit") {
    return "OpenAI kept calling tools for too long. Try a smaller Notion request.";
  }

  if (message.startsWith("openai-agent-failed:")) {
    return "OpenAI could not run the tool-calling agent. Check that the selected model supports Responses API function calling and web search.";
  }

  if (message === "missing-notion-token") {
    return "Add a Notion Personal access token in Settings, then send the command again.";
  }

  if (message.includes("notion-api-failed:400")) {
    return "Notion accepted the token, but refused the request. Check that the target page exists and your token can insert content.";
  }

  if (message.includes("notion-api-failed:403")) {
    return "Notion refused the request. Check that your Personal access token has Insert Content permissions.";
  }

  if (message.includes("notion-api-failed:401")) {
    return "Notion access token is invalid or expired. Reconnect the Notion workspace.";
  }

  if (message.includes("notion-api-failed:404")) {
    return "Notion could not find the requested page or database. Check the title/id and token access.";
  }

  return `Command failed: ${message}`;
}

function createNotionResult(message: string, url?: string): NotionChatCommandResult {
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

async function notionRequest<T>(
  accessToken: string,
  path: string,
  body?: Record<string, unknown>,
  notionVersion = NOTION_API_VERSION,
  method = "POST"
): Promise<T> {
  const requestInit: RequestInit = {
    method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Notion-Version": notionVersion
    }
  };

  if (body) {
    requestInit.body = JSON.stringify(body);
  }

  const response = await fetch(`${NOTION_API_BASE_URL}${path}`, requestInit);
  const responseBody = await response.text();

  if (!response.ok) {
    throw new Error(`notion-api-failed:${response.status}:${responseBody}`);
  }

  if (!responseBody.trim()) {
    return undefined as T;
  }

  return JSON.parse(responseBody) as T;
}

function getStringArgument(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];

  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getStringArrayArgument(args: Record<string, unknown>, key: string): string[] {
  const value = args[key];

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 25);
}

function getRowsArgument(args: Record<string, unknown>): string[][] {
  const value = args.rows;

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(Array.isArray)
    .map((row) => row.map((cell) => (typeof cell === "string" ? cell.trim() : String(cell ?? "").trim())).slice(0, 8))
    .filter((row) => row.some(Boolean))
    .slice(0, 25);
}

function getNumberArgument(args: Record<string, unknown>, key: string, defaultValue: number, min: number, max: number): number {
  const value = args[key];
  const parsed = typeof value === "number" && Number.isFinite(value) ? value : defaultValue;

  return Math.min(Math.max(Math.floor(parsed), min), max);
}

function isNotionTextBlockType(value: string): value is NotionTextBlockType {
  return [
    "paragraph",
    "heading_1",
    "heading_2",
    "heading_3",
    "bulleted_list_item",
    "numbered_list_item",
    "to_do"
  ].includes(value);
}

function getBlocksArgument(args: Record<string, unknown>): Record<string, unknown>[] {
  const value = args.blocks;

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return [];
      }

      const block = item as Record<string, unknown>;
      const type = typeof block.type === "string" && isNotionTextBlockType(block.type) ? block.type : "paragraph";
      const text = typeof block.text === "string" ? block.text.trim() : "";

      return text ? [createTextBlock(type, text)] : [];
    })
    .slice(0, 50);
}

function normalizeColumns(columns: string[]): string[] {
  const safeColumns = columns
    .map((column, index) => column.trim() || `Column ${index + 1}`)
    .filter(Boolean)
    .slice(0, 8);

  return safeColumns.length > 0 ? safeColumns : ["Column 1", "Column 2", "Column 3"];
}

function normalizeRows(rows: string[][], columns: string[]): string[][] {
  if (rows.length === 0) {
    return [];
  }

  return rows.map((row) => columns.map((_column, index) => row[index]?.trim() || " "));
}

function createContentBlocks(paragraphs: string[] = []): Record<string, unknown>[] {
  return paragraphs.map(createParagraphBlock);
}

function createTableContentBlocks(
  paragraphs: string[],
  columns: string[],
  rows: string[][],
  tableTitle?: string
): Record<string, unknown>[] {
  const blocks = createContentBlocks(paragraphs);

  if (tableTitle) {
    blocks.push(createParagraphBlock(tableTitle));
  }

  blocks.push(createTableBlockFromRows(columns, rows));

  return blocks;
}

function getRichTextPlainText(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }

  return value
    .map((item) => {
      const richText = item as { plain_text?: string; text?: { content?: string } };

      return richText.plain_text ?? richText.text?.content ?? "";
    })
    .join("")
    .trim();
}

function getNotionPropertyTitle(property: unknown): string | undefined {
  const title = getRichTextPlainText((property as { title?: unknown }).title);

  return title || undefined;
}

function getNotionPageTitle(result: NotionSearchResult): string | undefined {
  return Object.values(result.properties ?? {})
    .map(getNotionPropertyTitle)
    .find((title): title is string => Boolean(title));
}

function getNotionDatabaseTitle(result: NotionDatabaseResponse | NotionSearchResult): string | undefined {
  return getRichTextPlainText(result.title) || undefined;
}

function summarizeNotionPage(page: NotionSearchResult): NotionPageReference & { archived?: boolean } {
  return {
    id: page.id,
    title: getNotionPageTitle(page) ?? "Untitled",
    ...(page.url ? { url: page.url } : {}),
    ...(typeof page.archived === "boolean" ? { archived: page.archived } : {})
  };
}

function summarizeNotionDatabase(database: NotionDatabaseResponse | NotionSearchResult): NotionDatabaseReference {
  return {
    id: database.id,
    title: getNotionDatabaseTitle(database) ?? "Untitled",
    ...(database.url ? { url: database.url } : {})
  };
}

function summarizeNotionBlock(block: NotionBlockResponse): Record<string, unknown> {
  const type = block.type ?? "unknown";
  const typedBlock = block[type] as { rich_text?: unknown } | undefined;
  const text = getRichTextPlainText(typedBlock?.rich_text);

  return {
    id: block.id,
    type,
    text,
    hasChildren: Boolean(block.has_children)
  };
}

function summarizeNotionPropertyValue(property: unknown): string {
  const typedProperty = property as {
    type?: string;
    title?: unknown;
    rich_text?: unknown;
    number?: number | null;
    select?: { name?: string } | null;
    multi_select?: Array<{ name?: string }>;
    date?: { start?: string; end?: string } | null;
    checkbox?: boolean;
    url?: string | null;
    email?: string | null;
    phone_number?: string | null;
    status?: { name?: string } | null;
  };

  if (typedProperty.type === "title") {
    return getRichTextPlainText(typedProperty.title);
  }

  if (typedProperty.type === "rich_text") {
    return getRichTextPlainText(typedProperty.rich_text);
  }

  if (typedProperty.type === "number" && typeof typedProperty.number === "number") {
    return String(typedProperty.number);
  }

  if (typedProperty.type === "select") {
    return typedProperty.select?.name ?? "";
  }

  if (typedProperty.type === "multi_select") {
    return typedProperty.multi_select?.map((item) => item.name).filter(Boolean).join(", ") ?? "";
  }

  if (typedProperty.type === "date") {
    return [typedProperty.date?.start, typedProperty.date?.end].filter(Boolean).join(" - ");
  }

  if (typedProperty.type === "checkbox") {
    return typedProperty.checkbox ? "true" : "false";
  }

  if (typedProperty.type === "url") {
    return typedProperty.url ?? "";
  }

  if (typedProperty.type === "email") {
    return typedProperty.email ?? "";
  }

  if (typedProperty.type === "phone_number") {
    return typedProperty.phone_number ?? "";
  }

  if (typedProperty.type === "status") {
    return typedProperty.status?.name ?? "";
  }

  return "";
}

function summarizeDatabaseRow(row: NotionSearchResult): Record<string, unknown> {
  const properties = Object.fromEntries(
    Object.entries(row.properties ?? {}).map(([key, value]) => [key, summarizeNotionPropertyValue(value)])
  );

  return {
    id: row.id,
    ...(row.url ? { url: row.url } : {}),
    properties
  };
}

function normalizePageTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function searchNotionPages(
  accessToken: string,
  query: string,
  pageSize = 10
): Promise<NotionPageReference[]> {
  const searchResult = await notionRequest<NotionSearchResponse>(accessToken, "/search", {
    query,
    filter: {
      value: "page",
      property: "object"
    },
    page_size: Math.min(Math.max(pageSize, 1), 10)
  });

  return (searchResult.results ?? [])
    .filter((result) => result.object === "page")
    .map(summarizeNotionPage);
}

async function searchNotionDatabases(
  accessToken: string,
  query: string,
  pageSize = 10
): Promise<NotionDatabaseReference[]> {
  const searchResult = await notionRequest<NotionSearchResponse>(accessToken, "/search", {
    query,
    filter: {
      value: "database",
      property: "object"
    },
    page_size: Math.min(Math.max(pageSize, 1), 10)
  });

  return (searchResult.results ?? [])
    .filter((result) => result.object === "database")
    .map(summarizeNotionDatabase);
}

async function readNotionPage(accessToken: string, pageId: string): Promise<NotionPageReference & { archived?: boolean }> {
  const page = await notionRequest<NotionSearchResult>(
    accessToken,
    `/pages/${encodeURIComponent(pageId)}`,
    undefined,
    NOTION_API_VERSION,
    "GET"
  );

  return summarizeNotionPage(page);
}

async function readNotionDatabase(accessToken: string, databaseId: string): Promise<NotionDatabaseResponse> {
  return notionRequest<NotionDatabaseResponse>(
    accessToken,
    `/databases/${encodeURIComponent(databaseId)}`,
    undefined,
    NOTION_LEGACY_DATABASE_VERSION,
    "GET"
  );
}

async function findNotionPageByTitle(accessToken: string, title: string): Promise<NotionPageReference | undefined> {
  const normalizedTitle = normalizePageTitle(title);

  if (!normalizedTitle) {
    return undefined;
  }

  const pages = await searchNotionPages(accessToken, title, 10);

  return pages.find((page) => normalizePageTitle(page.title) === normalizedTitle) ?? pages[0];
}

async function findNotionDatabaseByTitle(accessToken: string, title: string): Promise<NotionDatabaseReference | undefined> {
  const normalizedTitle = normalizePageTitle(title);

  if (!normalizedTitle) {
    return undefined;
  }

  const databases = await searchNotionDatabases(accessToken, title, 10);

  return databases.find((database) => normalizePageTitle(database.title) === normalizedTitle) ?? databases[0];
}

async function resolveNotionPage(
  accessToken: string,
  args: Record<string, unknown>,
  idKey = "pageId",
  titleKey = "pageTitle"
): Promise<NotionPageReference | undefined> {
  const explicitPageId = getStringArgument(args, idKey);
  const pageTitle = getStringArgument(args, titleKey);

  if (explicitPageId) {
    try {
      return await readNotionPage(accessToken, explicitPageId);
    } catch {
      return {
        id: explicitPageId,
        title: pageTitle ?? "selected page"
      };
    }
  }

  return pageTitle ? findNotionPageByTitle(accessToken, pageTitle) : undefined;
}

async function resolveNotionDatabase(
  accessToken: string,
  args: Record<string, unknown>
): Promise<NotionDatabaseReference | undefined> {
  const explicitDatabaseId = getStringArgument(args, "databaseId");
  const databaseTitle = getStringArgument(args, "databaseTitle");

  if (explicitDatabaseId) {
    try {
      return summarizeNotionDatabase(await readNotionDatabase(accessToken, explicitDatabaseId));
    } catch {
      return {
        id: explicitDatabaseId,
        title: databaseTitle ?? "selected database"
      };
    }
  }

  return databaseTitle ? findNotionDatabaseByTitle(accessToken, databaseTitle) : undefined;
}

async function appendBlocksToPage(
  accessToken: string,
  pageId: string,
  children: Record<string, unknown>[]
): Promise<void> {
  await notionRequest<unknown>(
    accessToken,
    `/blocks/${pageId}/children`,
    {
      children
    },
    NOTION_API_VERSION,
    "PATCH"
  );
}

async function createNotionPage(
  accessToken: string,
  title: string,
  children: Record<string, unknown>[] = [],
  parent: NotionPageParent = {
    type: "workspace",
    workspace: true
  }
): Promise<NotionObjectResponse> {
  return notionRequest<NotionObjectResponse>(accessToken, "/pages", {
    parent,
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

function createLegacyDatabaseRowProperties(
  columns: string[],
  rowIndex: number,
  values: string[] = []
): Record<string, unknown> {
  return columns.reduce<Record<string, unknown>>((properties, column, columnIndex) => {
    const cellValue = values[columnIndex]?.trim();

    properties[column] =
      columnIndex === 0
        ? titleProperty(cellValue || `Row ${rowIndex + 1}`)
        : {
            rich_text: textRichText(cellValue || " ")
          };

    return properties;
  }, {});
}

async function createNotionDatabase(
  accessToken: string,
  command: ParsedNotionCommand,
  rows: string[][]
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
  const rowValues = rows.length > 0
    ? rows
    : Array.from({ length: command.rowCount }, (_item, rowIndex) => command.columns.map(() => `Row ${rowIndex + 1}`));

  for (let rowIndex = 0; rowIndex < rowValues.length; rowIndex += 1) {
    await notionRequest<NotionObjectResponse>(
      accessToken,
      "/pages",
      {
        parent: {
          database_id: database.id
        },
        properties: createLegacyDatabaseRowProperties(command.columns, rowIndex, rowValues[rowIndex] ?? [])
      },
      NOTION_LEGACY_DATABASE_VERSION
    );
  }

  return database;
}

async function listNotionPageBlocks(
  accessToken: string,
  pageId: string,
  limit: number
): Promise<Array<Record<string, unknown>>> {
  const children = await notionRequest<NotionBlockChildrenResponse>(
    accessToken,
    `/blocks/${encodeURIComponent(pageId)}/children?page_size=${limit}`,
    undefined,
    NOTION_API_VERSION,
    "GET"
  );

  return (children.results ?? []).map(summarizeNotionBlock);
}

async function queryNotionDatabaseRows(
  accessToken: string,
  databaseId: string,
  limit: number
): Promise<Array<Record<string, unknown>>> {
  const queryResult = await notionRequest<NotionDatabaseQueryResponse>(
    accessToken,
    `/databases/${encodeURIComponent(databaseId)}/query`,
    {
      page_size: limit
    },
    NOTION_LEGACY_DATABASE_VERSION
  );

  return (queryResult.results ?? []).map(summarizeDatabaseRow);
}

async function addRowsToDatabase(
  accessToken: string,
  databaseId: string,
  columns: string[],
  rows: string[][]
): Promise<NotionObjectResponse[]> {
  const createdRows: NotionObjectResponse[] = [];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = await notionRequest<NotionObjectResponse>(
      accessToken,
      "/pages",
      {
        parent: {
          database_id: databaseId
        },
        properties: createLegacyDatabaseRowProperties(columns, rowIndex, rows[rowIndex] ?? [])
      },
      NOTION_LEGACY_DATABASE_VERSION
    );
    createdRows.push(row);
  }

  return createdRows;
}

async function executeNotionTool(
  accessToken: string,
  toolCall: NotionAgentFunctionCall
): Promise<Record<string, unknown>> {
  const args = toolCall.arguments;

  if (toolCall.name === "search_notion_pages") {
    const query = getStringArgument(args, "query");

    if (!query) {
      return {
        ok: false,
        message: "Search query is required."
      };
    }

    const pages = await searchNotionPages(accessToken, query);

    return {
      ok: true,
      pages,
      message: pages.length > 0
        ? `Found ${pages.length} matching Notion page(s).`
        : `No Notion pages matched "${query}".`
    };
  }

  if (toolCall.name === "search_notion_databases") {
    const query = getStringArgument(args, "query");

    if (!query) {
      return {
        ok: false,
        message: "Database search query is required."
      };
    }

    const databases = await searchNotionDatabases(accessToken, query);

    return {
      ok: true,
      databases,
      message: databases.length > 0
        ? `Found ${databases.length} matching Notion database(s).`
        : `No Notion databases matched "${query}".`
    };
  }

  if (toolCall.name === "read_notion_page") {
    const targetPage = await resolveNotionPage(accessToken, args);

    if (!targetPage) {
      return {
        ok: false,
        message: "Provide either pageId or pageTitle before reading a page."
      };
    }

    const page = await readNotionPage(accessToken, targetPage.id);

    return {
      ok: true,
      page,
      message: `Read Notion page "${page.title}".`
    };
  }

  if (toolCall.name === "list_notion_page_blocks") {
    const targetPage = await resolveNotionPage(accessToken, args);

    if (!targetPage) {
      return {
        ok: false,
        message: "Provide either pageId or pageTitle before reading page blocks."
      };
    }

    const limit = getNumberArgument(args, "limit", 25, 1, 100);
    const blocks = await listNotionPageBlocks(accessToken, targetPage.id, limit);

    return {
      ok: true,
      page: targetPage,
      blocks,
      message: `Read ${blocks.length} block(s) from "${targetPage.title}".`
    };
  }

  if (toolCall.name === "read_notion_database") {
    const targetDatabase = await resolveNotionDatabase(accessToken, args);

    if (!targetDatabase) {
      return {
        ok: false,
        message: "Provide either databaseId or databaseTitle before reading a database."
      };
    }

    const database = await readNotionDatabase(accessToken, targetDatabase.id);
    const properties = Object.fromEntries(
      Object.entries(database.properties ?? {}).map(([key, value]) => [key, (value as { type?: string }).type ?? "unknown"])
    );

    return {
      ok: true,
      database: {
        ...summarizeNotionDatabase(database),
        properties
      },
      message: `Read Notion database "${getNotionDatabaseTitle(database) ?? targetDatabase.title}".`
    };
  }

  if (toolCall.name === "query_notion_database") {
    const targetDatabase = await resolveNotionDatabase(accessToken, args);

    if (!targetDatabase) {
      return {
        ok: false,
        message: "Provide either databaseId or databaseTitle before querying a database."
      };
    }

    const limit = getNumberArgument(args, "limit", 10, 1, 100);
    const rows = await queryNotionDatabaseRows(accessToken, targetDatabase.id, limit);

    return {
      ok: true,
      database: targetDatabase,
      rows,
      message: `Read ${rows.length} row(s) from "${targetDatabase.title}".`
    };
  }

  if (toolCall.name === "create_notion_page") {
    const title = getStringArgument(args, "title") ?? "Samovar Page";
    const paragraphs = getStringArrayArgument(args, "paragraphs");
    const page = await createNotionPage(accessToken, title, createContentBlocks(paragraphs));

    return {
      ok: true,
      id: page.id,
      url: page.url,
      message: `Created Notion page "${title}".${page.url ? `\n${page.url}` : ""}`
    };
  }

  if (toolCall.name === "create_child_page") {
    const parentPage = await resolveNotionPage(accessToken, args, "parentPageId", "parentPageTitle");

    if (!parentPage) {
      return {
        ok: false,
        message: "Provide either parentPageId or parentPageTitle before creating a child page."
      };
    }

    const title = getStringArgument(args, "title") ?? "Samovar Page";
    const paragraphs = getStringArrayArgument(args, "paragraphs");
    const page = await createNotionPage(
      accessToken,
      title,
      createContentBlocks(paragraphs),
      {
        type: "page_id",
        page_id: parentPage.id
      }
    );

    return {
      ok: true,
      id: page.id,
      url: page.url,
      parentPage,
      message: `Created child Notion page "${title}" under "${parentPage.title}".${page.url ? `\n${page.url}` : ""}`
    };
  }

  if (toolCall.name === "create_notion_table_page") {
    const title = getStringArgument(args, "title") ?? "Samovar Table";
    const paragraphs = getStringArrayArgument(args, "paragraphs");
    const columns = normalizeColumns(getStringArrayArgument(args, "columns"));
    const rows = normalizeRows(getRowsArgument(args), columns);
    const page = await createNotionPage(accessToken, title, createTableContentBlocks(paragraphs, columns, rows));

    return {
      ok: true,
      id: page.id,
      url: page.url,
      message: `Created Notion table page "${title}".${page.url ? `\n${page.url}` : ""}`
    };
  }

  if (toolCall.name === "append_blocks_to_page") {
    const targetPage = await resolveNotionPage(accessToken, args);

    if (!targetPage) {
      return {
        ok: false,
        message: "Provide either pageId or pageTitle before appending blocks."
      };
    }

    const blocks = getBlocksArgument(args);

    if (blocks.length === 0) {
      return {
        ok: false,
        message: "Provide at least one block to append."
      };
    }

    await appendBlocksToPage(accessToken, targetPage.id, blocks);

    return {
      ok: true,
      page: targetPage,
      appendedBlocks: blocks.length,
      message: `Appended ${blocks.length} block(s) to "${targetPage.title}".${targetPage.url ? `\n${targetPage.url}` : ""}`
    };
  }

  if (toolCall.name === "append_table_to_page") {
    const pageTitle = getStringArgument(args, "pageTitle");
    const targetPage = await resolveNotionPage(accessToken, args);

    if (!targetPage) {
      return {
        ok: false,
        message: pageTitle
          ? `Could not find a Notion page named "${pageTitle}".`
          : "Provide either pageId or pageTitle before appending a table."
      };
    }

    const paragraphs = getStringArrayArgument(args, "paragraphs");
    const columns = normalizeColumns(getStringArrayArgument(args, "columns"));
    const rows = normalizeRows(getRowsArgument(args), columns);
    const tableTitle = getStringArgument(args, "tableTitle");

    await appendBlocksToPage(accessToken, targetPage.id, createTableContentBlocks(paragraphs, columns, rows, tableTitle));

    return {
      ok: true,
      id: targetPage.id,
      title: targetPage.title,
      ...(targetPage.url ? { url: targetPage.url } : {}),
      message: `Updated Notion page "${targetPage.title}".${targetPage.url ? `\n${targetPage.url}` : ""}`
    };
  }

  if (toolCall.name === "update_notion_block_text") {
    const blockId = getStringArgument(args, "blockId");
    const requestedType = getStringArgument(args, "type") ?? "paragraph";
    const type = isNotionTextBlockType(requestedType) ? requestedType : "paragraph";
    const text = getStringArgument(args, "text");

    if (!blockId || !text) {
      return {
        ok: false,
        message: "Provide blockId and replacement text before updating a block."
      };
    }

    const blockBody = type === "to_do"
      ? {
          to_do: {
            rich_text: textRichText(text)
          }
        }
      : {
          [type]: {
            rich_text: textRichText(text)
          }
        };
    const block = await notionRequest<NotionBlockResponse>(
      accessToken,
      `/blocks/${encodeURIComponent(blockId)}`,
      blockBody,
      NOTION_API_VERSION,
      "PATCH"
    );

    return {
      ok: true,
      id: block.id ?? blockId,
      type,
      message: `Updated Notion block ${block.id ?? blockId}.`
    };
  }

  if (toolCall.name === "archive_notion_block") {
    const blockId = getStringArgument(args, "blockId");

    if (!blockId) {
      return {
        ok: false,
        message: "Provide blockId before archiving a block."
      };
    }

    const block = await notionRequest<NotionBlockResponse>(
      accessToken,
      `/blocks/${encodeURIComponent(blockId)}`,
      {
        archived: true
      },
      NOTION_API_VERSION,
      "PATCH"
    );

    return {
      ok: true,
      id: block.id ?? blockId,
      message: `Archived Notion block ${block.id ?? blockId}.`
    };
  }

  if (toolCall.name === "create_notion_database") {
    const title = getStringArgument(args, "title") ?? "Samovar Database";
    const columns = normalizeColumns(getStringArrayArgument(args, "columns"));
    const rows = normalizeRows(getRowsArgument(args), columns);
    const command: ParsedNotionCommand = {
      kind: "database",
      title,
      rowCount: Math.max(rows.length, 1),
      columnCount: columns.length,
      columns
    };
    const database = await createNotionDatabase(accessToken, command, rows);

    return {
      ok: true,
      id: database.id,
      url: database.url,
      message: `Created Notion database "${title}".${database.url ? `\n${database.url}` : ""}`
    };
  }

  if (toolCall.name === "add_database_rows") {
    const targetDatabase = await resolveNotionDatabase(accessToken, args);

    if (!targetDatabase) {
      return {
        ok: false,
        message: "Provide either databaseId or databaseTitle before adding rows."
      };
    }

    const columns = normalizeColumns(getStringArrayArgument(args, "columns"));
    const rows = normalizeRows(getRowsArgument(args), columns);

    if (rows.length === 0) {
      return {
        ok: false,
        message: "Provide at least one database row to add."
      };
    }

    const createdRows = await addRowsToDatabase(accessToken, targetDatabase.id, columns, rows);

    return {
      ok: true,
      database: targetDatabase,
      rowCount: createdRows.length,
      rows: createdRows.map((row) => ({
        id: row.id,
        ...(row.url ? { url: row.url } : {})
      })),
      message: `Added ${createdRows.length} row(s) to "${targetDatabase.title}".${targetDatabase.url ? `\n${targetDatabase.url}` : ""}`
    };
  }

  if (toolCall.name === "update_database_row") {
    const rowPageId = getStringArgument(args, "rowPageId");
    const columns = normalizeColumns(getStringArrayArgument(args, "columns"));
    const values = getStringArrayArgument(args, "values");

    if (!rowPageId || values.length === 0) {
      return {
        ok: false,
        message: "Provide rowPageId, columns, and replacement values before updating a database row."
      };
    }

    const row = await notionRequest<NotionObjectResponse>(
      accessToken,
      `/pages/${encodeURIComponent(rowPageId)}`,
      {
        properties: createLegacyDatabaseRowProperties(columns, 0, values)
      },
      NOTION_LEGACY_DATABASE_VERSION,
      "PATCH"
    );

    return {
      ok: true,
      id: row.id,
      ...(row.url ? { url: row.url } : {}),
      message: `Updated Notion database row.${row.url ? `\n${row.url}` : ""}`
    };
  }

  if (toolCall.name === "archive_database_row") {
    const rowPageId = getStringArgument(args, "rowPageId");

    if (!rowPageId) {
      return {
        ok: false,
        message: "Provide rowPageId before archiving a database row."
      };
    }

    const row = await notionRequest<NotionObjectResponse>(
      accessToken,
      `/pages/${encodeURIComponent(rowPageId)}`,
      {
        archived: true
      },
      NOTION_LEGACY_DATABASE_VERSION,
      "PATCH"
    );

    return {
      ok: true,
      id: row.id,
      ...(row.url ? { url: row.url } : {}),
      message: "Archived Notion database row."
    };
  }

  if (toolCall.name === "update_notion_page_title") {
    const targetPage = await resolveNotionPage(accessToken, args);
    const title = getStringArgument(args, "title");

    if (!targetPage || !title) {
      return {
        ok: false,
        message: "Provide pageId/pageTitle and a new title before renaming a page."
      };
    }

    const page = await notionRequest<NotionObjectResponse>(
      accessToken,
      `/pages/${encodeURIComponent(targetPage.id)}`,
      {
        properties: {
          title: titleProperty(title)
        }
      },
      NOTION_API_VERSION,
      "PATCH"
    );

    return {
      ok: true,
      id: page.id,
      url: page.url ?? targetPage.url,
      previousTitle: targetPage.title,
      title,
      message: `Renamed Notion page "${targetPage.title}" to "${title}".${(page.url ?? targetPage.url) ? `\n${page.url ?? targetPage.url}` : ""}`
    };
  }

  if (toolCall.name === "archive_notion_page") {
    const targetPage = await resolveNotionPage(accessToken, args);

    if (!targetPage) {
      return {
        ok: false,
        message: "Provide either pageId or pageTitle before archiving a page."
      };
    }

    const page = await notionRequest<NotionObjectResponse>(
      accessToken,
      `/pages/${encodeURIComponent(targetPage.id)}`,
      {
        archived: true
      },
      NOTION_API_VERSION,
      "PATCH"
    );

    return {
      ok: true,
      id: page.id,
      url: page.url ?? targetPage.url,
      title: targetPage.title,
      message: `Archived Notion page "${targetPage.title}".`
    };
  }

  return {
    ok: false,
    message: `Unsupported tool: ${toolCall.name}`
  };
}

export async function executeNotionChatCommand(input: NotionChatCommandInput): Promise<NotionChatCommandResult> {
  const message = input.message.trim();

  if (!message) {
    return {
      ok: false,
      message: "Type what you want SamovarNotes to create in Notion."
    };
  }

  try {
    const accessToken = await getNotionAccessToken();
    const agentMessage = await runNotionAgent(message, (toolCall) => executeNotionTool(accessToken, toolCall));

    return createNotionResult(agentMessage);
  } catch (error) {
    return {
      ok: false,
      message: mapExecutionError(error)
    };
  }
}

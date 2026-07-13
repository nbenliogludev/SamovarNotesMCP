import {
  NOTION_API_BASE_URL,
  NOTION_API_VERSION,
  NOTION_LEGACY_DATABASE_VERSION
} from "../config";
import type { NotionChatCommandInput, NotionChatCommandResult, NotionObjectResponse, ParsedNotionCommand } from "../types";
import { runNotionAgent, type NotionAgentFunctionCall } from "../openai/notionAgent";
import { getNotionAccessToken } from "../settingsStore";
import { createParagraphBlock, createTableBlockFromRows } from "./blocks";
import { textRichText, titleProperty } from "./richText";

type NotionSearchResult = NotionObjectResponse & {
  object?: string;
  properties?: Record<string, unknown>;
};

type NotionSearchResponse = {
  results?: NotionSearchResult[];
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
  body: Record<string, unknown>,
  notionVersion = NOTION_API_VERSION,
  method = "POST"
): Promise<T> {
  const response = await fetch(`${NOTION_API_BASE_URL}${path}`, {
    method,
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

function getNotionPropertyTitle(property: unknown): string | undefined {
  const titleItems = (property as { title?: Array<{ plain_text?: string; text?: { content?: string } }> }).title;

  if (!Array.isArray(titleItems)) {
    return undefined;
  }

  return titleItems
    .map((item) => item.plain_text ?? item.text?.content ?? "")
    .join("")
    .trim();
}

function getNotionPageTitle(result: NotionSearchResult): string | undefined {
  return Object.values(result.properties ?? {})
    .map(getNotionPropertyTitle)
    .find((title): title is string => Boolean(title));
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
): Promise<Array<{ id: string; title: string; url?: string }>> {
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
    .map((result) => ({
      id: result.id,
      title: getNotionPageTitle(result) ?? "Untitled",
      ...(result.url ? { url: result.url } : {})
    }));
}

async function findNotionPageByTitle(accessToken: string, title: string): Promise<{ id: string; title: string; url?: string } | undefined> {
  const normalizedTitle = normalizePageTitle(title);

  if (!normalizedTitle) {
    return undefined;
  }

  const pages = await searchNotionPages(accessToken, title, 10);

  return pages.find((page) => normalizePageTitle(page.title) === normalizedTitle) ?? pages[0];
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

  if (toolCall.name === "append_table_to_page") {
    const explicitPageId = getStringArgument(args, "pageId");
    const pageTitle = getStringArgument(args, "pageTitle");
    const targetPage = explicitPageId
      ? { id: explicitPageId, title: pageTitle ?? "selected page" }
      : pageTitle
        ? await findNotionPageByTitle(accessToken, pageTitle)
        : undefined;

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

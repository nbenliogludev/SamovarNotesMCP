import {
  NOTION_API_BASE_URL,
  NOTION_API_VERSION,
  NOTION_LEGACY_DATABASE_VERSION,
  NOTION_OAUTH_TOKEN_EXCHANGE_URL
} from "../config";
import type { NotionChatCommandInput, NotionChatCommandResult, NotionObjectResponse, ParsedNotionCommand } from "../types";
import { createParagraphBlock, createTableBlock } from "./blocks";
import { textRichText, titleProperty } from "./richText";
import { getWorkspaceAccessToken, hasTokenExchangeConfiguration } from "./workspaces";

function mapNotionError(error: unknown): string {
  const message = error instanceof Error ? error.message : "unknown-error";

  if (message === "missing-notion-workspace") {
    return "Connect Notion first, then send the command again.";
  }

  if (message === "token-exchange-required") {
    return hasTokenExchangeConfiguration() || NOTION_OAUTH_TOKEN_EXCHANGE_URL
      ? "This Notion workspace was connected before token exchange was available. Open settings and click Add Notion workspace to reconnect it."
      : "Notion is authorized, but this workspace has no access token yet. Add NOTION_OAUTH_CLIENT_SECRET to .env, restart the app, and reconnect Notion.";
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

export async function executeNotionChatCommand(input: NotionChatCommandInput): Promise<NotionChatCommandResult> {
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

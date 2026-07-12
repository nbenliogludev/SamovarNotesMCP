import {
  NOTION_API_BASE_URL,
  NOTION_API_VERSION,
  NOTION_LEGACY_DATABASE_VERSION
} from "../config";
import type { NotionChatCommandInput, NotionChatCommandResult, NotionObjectResponse, ParsedNotionCommand } from "../types";
import { planNotionCommand, type PlannedNotionCommand } from "../openai/notionPlanner";
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

  if (message === "openai-planning-empty-response") {
    return "OpenAI returned an empty plan. Try sending the request again.";
  }

  if (message.startsWith("openai-planning-failed:")) {
    return "OpenAI could not plan or research this request. Check that the selected model supports the Responses API with web search, then try again.";
  }

  if (message === "missing-notion-token") {
    return "Add a Notion Personal access token in Settings, then send the command again.";
  }

  if (message.includes("notion-api-failed:400")) {
    return "Notion accepted the token, but refused workspace-level page creation. Try creating inside an existing page, or switch to hosted OAuth later.";
  }

  if (message.includes("notion-api-failed:403")) {
    return "Notion refused the request. Check that your Personal access token has Insert Content permissions.";
  }

  if (message.includes("notion-api-failed:401")) {
    return "Notion access token is invalid or expired. Reconnect the Notion workspace.";
  }

  return `Command failed: ${message}`;
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

function createPlanBlocks(plan: PlannedNotionCommand): Record<string, unknown>[] {
  const blocks = plan.paragraphs.map(createParagraphBlock);

  if (plan.table.rows.length > 0 || plan.action === "create_table_page" || plan.action === "append_table_to_page") {
    blocks.push(createTableBlockFromRows(plan.table.columns, plan.table.rows));
  }

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

async function findNotionPageByTitle(accessToken: string, title: string): Promise<NotionSearchResult | undefined> {
  const normalizedTitle = normalizePageTitle(title);

  if (!normalizedTitle) {
    return undefined;
  }

  const searchResult = await notionRequest<NotionSearchResponse>(accessToken, "/search", {
    query: title,
    filter: {
      value: "page",
      property: "object"
    },
    page_size: 10
  });
  const results = (searchResult.results ?? []).filter((result) => result.object === "page");

  return (
    results.find((result) => normalizePageTitle(getNotionPageTitle(result) ?? "") === normalizedTitle) ??
    results[0]
  );
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
  rows: string[][] = []
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
    const plan = await planNotionCommand(message);

    if (plan.action === "answer") {
      return {
        ok: false,
        message: plan.assistantMessage || "I need a little more detail before writing to Notion."
      };
    }

    if (plan.action === "append_table_to_page") {
      const targetPage = await findNotionPageByTitle(accessToken, plan.targetPageTitle);

      if (!targetPage) {
        return {
          ok: false,
          message: `I could not find a Notion page named "${plan.targetPageTitle}". Check the page name and that your Notion token can access it.`
        };
      }

      await appendBlocksToPage(accessToken, targetPage.id, createPlanBlocks(plan));

      return createNotionSuccess(
        `${plan.assistantMessage || `Updated "${plan.targetPageTitle}" in Notion.`}${targetPage.url ? `\n${targetPage.url}` : ""}`,
        targetPage.url
      );
    }

    if (plan.action === "create_database") {
      const command: ParsedNotionCommand = {
        kind: "database",
        title: plan.title || "Samovar Database",
        rowCount: Math.max(plan.table.rows.length, 1),
        columnCount: plan.table.columns.length,
        columns: plan.table.columns
      };
      const database = await createNotionDatabase(accessToken, command, plan.table.rows);

      return createNotionSuccess(
        `${plan.assistantMessage || `Created a Notion database with ${command.columnCount} columns and ${command.rowCount} rows.`}${database.url ? `\n${database.url}` : ""}`,
        database.url
      );
    }

    if (plan.action === "create_table_page") {
      const page = await createNotionPage(accessToken, plan.title || "Samovar Table", createPlanBlocks(plan));

      return createNotionSuccess(
        `${plan.assistantMessage || `Created a Notion page with a ${plan.table.columns.length}-column table and ${plan.table.rows.length} rows.`}${page.url ? `\n${page.url}` : ""}`,
        page.url
      );
    }

    const page = await createNotionPage(accessToken, plan.title || "Samovar Page", plan.paragraphs.map(createParagraphBlock));

    return createNotionSuccess(`${plan.assistantMessage || "Created a Notion page."}${page.url ? `\n${page.url}` : ""}`, page.url);
  } catch (error) {
    return {
      ok: false,
      message: mapExecutionError(error)
    };
  }
}

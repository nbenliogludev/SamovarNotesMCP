import { OPENAI_API_BASE_URL } from "../config";
import { getOpenAiApiKey, getOpenAiModel } from "../settingsStore";

export type PlannedNotionAction =
  | "create_page"
  | "create_table_page"
  | "append_table_to_page"
  | "create_database"
  | "answer";

export type PlannedNotionCommand = {
  action: PlannedNotionAction;
  title: string;
  targetPageTitle: string;
  assistantMessage: string;
  paragraphs: string[];
  table: {
    columns: string[];
    rows: string[][];
  };
};

type OpenAiResponseContent = {
  type?: string;
  text?: string;
};

type OpenAiResponseOutput = {
  type?: string;
  content?: OpenAiResponseContent[];
};

type OpenAiResponsesApiResponse = {
  output_text?: string;
  output?: OpenAiResponseOutput[];
};

const notionPlanSchema = {
  type: "object",
  additionalProperties: false,
  required: ["action", "title", "targetPageTitle", "assistantMessage", "paragraphs", "table"],
  properties: {
    action: {
      type: "string",
      enum: ["create_page", "create_table_page", "append_table_to_page", "create_database", "answer"]
    },
    title: {
      type: "string",
      maxLength: 120
    },
    targetPageTitle: {
      type: "string",
      maxLength: 120
    },
    assistantMessage: {
      type: "string",
      maxLength: 700
    },
    paragraphs: {
      type: "array",
      maxItems: 8,
      items: {
        type: "string",
        maxLength: 1800
      }
    },
    table: {
      type: "object",
      additionalProperties: false,
      required: ["columns", "rows"],
      properties: {
        columns: {
          type: "array",
          maxItems: 8,
          items: {
            type: "string",
            maxLength: 80
          }
        },
        rows: {
          type: "array",
          maxItems: 25,
          items: {
            type: "array",
            maxItems: 8,
            items: {
              type: "string",
              maxLength: 500
            }
          }
        }
      }
    }
  }
};

const plannerInstructions = `
You are the planning and research layer for SamovarNotes MCP, an Electron app that writes to Notion.

Your job:
- Understand the user's natural-language request in English, Russian, or Turkish.
- If the request needs current facts, "research", "find", "best/top", prices, places, or recommendations, use web search before planning.
- Return a concrete Notion execution plan in the required JSON schema.

Actions:
- create_page: create one new empty/content page.
- create_table_page: create one new Notion page containing a table.
- append_table_to_page: find an existing Notion page by title and append a table to it.
- create_database: create a Notion database when the user explicitly asks for a database.
- answer: no Notion write should happen; explain what is missing or ask one concise clarification.

Important interpretation rules:
- Never use the full user prompt as a Notion page title.
- If the user says "named", "called", "titled", "под названием", "с названием", "называется", "adı", or similar, use only the following name as the page or target title.
- If the user says there is an existing page, or says to create something "there", "inside that page", "на странице", "там", or "в странице", choose append_table_to_page and put that existing page name in targetPageTitle.
- For append_table_to_page, title should be a short table heading, while targetPageTitle must be the existing page title.
- If the user asks for research, table rows must contain real researched content, not placeholders like Row 1.
- Add a "Source" column when research results depend on web sources.
- Keep titles short and useful. For "страница под названием, допустим Стамбул 35", the title is "Стамбул 35".
- Keep the user's language where practical.
- If the request is too vague to safely write to Notion, choose answer.

Today is ${new Date().toISOString().slice(0, 10)}.
`;

function isPlannedAction(value: string): value is PlannedNotionAction {
  return ["create_page", "create_table_page", "append_table_to_page", "create_database", "answer"].includes(value);
}

function extractResponseText(response: OpenAiResponsesApiResponse): string {
  if (response.output_text?.trim()) {
    return response.output_text.trim();
  }

  const text = response.output
    ?.flatMap((outputItem) => outputItem.content ?? [])
    .map((content) => content.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("openai-planning-empty-response");
  }

  return text;
}

function parseJsonResponse(text: string): unknown {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  return JSON.parse(cleaned) as unknown;
}

function cleanText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 1800) : fallback;
}

function normalizePlan(rawPlan: unknown): PlannedNotionCommand {
  const plan = rawPlan as Partial<PlannedNotionCommand>;
  const rawAction = typeof plan.action === "string" ? plan.action : "answer";
  const action = isPlannedAction(rawAction) ? rawAction : "answer";
  const columns = Array.isArray(plan.table?.columns)
    ? plan.table.columns.map((column, index) => cleanText(column, `Column ${index + 1}`).slice(0, 80)).filter(Boolean).slice(0, 8)
    : [];
  const normalizedColumns = columns.length > 0 ? columns : ["Column 1", "Column 2", "Column 3"];
  const rows = Array.isArray(plan.table?.rows)
    ? plan.table.rows
        .filter(Array.isArray)
        .map((row) => normalizedColumns.map((_column, index) => cleanText(row[index], " ")))
        .filter((row) => row.some((cell) => cell.trim()))
        .slice(0, 25)
    : [];

  return {
    action,
    title: cleanText(plan.title, action === "create_database" ? "Samovar Database" : "Samovar Page").slice(0, 120),
    targetPageTitle: cleanText(plan.targetPageTitle).slice(0, 120),
    assistantMessage: cleanText(plan.assistantMessage, "I prepared the Notion update."),
    paragraphs: Array.isArray(plan.paragraphs)
      ? plan.paragraphs.map((paragraph) => cleanText(paragraph)).filter(Boolean).slice(0, 8)
      : [],
    table: {
      columns: normalizedColumns,
      rows
    }
  };
}

export async function planNotionCommand(message: string): Promise<PlannedNotionCommand> {
  const apiKey = await getOpenAiApiKey();
  const model = await getOpenAiModel();
  const response = await fetch(`${OPENAI_API_BASE_URL}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      instructions: plannerInstructions,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: message
            }
          ]
        }
      ],
      tools: [
        {
          type: "web_search_preview"
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "samovar_notion_plan",
          strict: true,
          schema: notionPlanSchema
        }
      }
    })
  });
  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(`openai-planning-failed:${response.status}:${responseText}`);
  }

  return normalizePlan(parseJsonResponse(extractResponseText(JSON.parse(responseText) as OpenAiResponsesApiResponse)));
}

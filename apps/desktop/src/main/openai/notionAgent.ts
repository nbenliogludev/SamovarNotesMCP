import { OPENAI_API_BASE_URL } from "../config";
import { getOpenAiApiKey, getOpenAiModel } from "../settingsStore";

export type NotionAgentToolName =
  | "search_notion_pages"
  | "create_notion_page"
  | "create_notion_table_page"
  | "append_table_to_page"
  | "create_notion_database";

export type NotionAgentFunctionCall = {
  callId: string;
  name: NotionAgentToolName;
  arguments: Record<string, unknown>;
};

export type NotionAgentToolExecutor = (toolCall: NotionAgentFunctionCall) => Promise<Record<string, unknown>>;

type OpenAiResponseContent = {
  type?: string;
  text?: string;
};

type OpenAiOutputItem = {
  type?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  content?: OpenAiResponseContent[];
};

type OpenAiResponsesApiResponse = {
  id?: string;
  output_text?: string;
  output?: OpenAiOutputItem[];
};

const MAX_TOOL_ROUNDS = 8;

const notionAgentInstructions = `
You are SamovarNotes MCP, an agent that helps a user create and update Notion content.

Use the provided tools to perform Notion actions. Do not invent Notion URLs or pretend a write happened.

Important behavior:
- For current facts, recommendations, best/top lists, places, prices, or research requests, use web search before writing to Notion.
- To update an existing page, search for the page first unless the user already provided a page id.
- If the user says a page is named/called/titled, use only that name as the target page title.
- Keep Notion page and table titles short. Never use the full user prompt as a title.
- Fill researched tables with real content, not placeholders like Row 1.
- Include a Source column for researched tables when useful.
- If a request is unsafe or too ambiguous, do not call a Notion write tool; ask one concise clarification.
- Return a concise final user-facing answer after tools finish, including the Notion URL returned by the tool when available.

Today is ${new Date().toISOString().slice(0, 10)}.
`;

const stringArraySchema = {
  type: "array",
  items: {
    type: "string"
  }
};

const tableRowsSchema = {
  type: "array",
  maxItems: 25,
  items: {
    type: "array",
    maxItems: 8,
    items: {
      type: "string"
    }
  }
};

const functionTools = [
  {
    type: "function",
    name: "search_notion_pages",
    description: "Search accessible Notion pages by title or query before updating an existing page.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        query: {
          type: "string",
          description: "The page title or search query."
        }
      }
    }
  },
  {
    type: "function",
    name: "create_notion_page",
    description: "Create a new Notion page at workspace level with optional paragraph blocks.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["title", "paragraphs"],
      properties: {
        title: {
          type: "string",
          description: "Short Notion page title."
        },
        paragraphs: {
          ...stringArraySchema,
          description: "Paragraphs to add to the page. Use an empty array for a blank page."
        }
      }
    }
  },
  {
    type: "function",
    name: "create_notion_table_page",
    description: "Create a new Notion page containing paragraphs and a simple table block.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["title", "paragraphs", "columns", "rows"],
      properties: {
        title: {
          type: "string",
          description: "Short Notion page title."
        },
        paragraphs: {
          ...stringArraySchema,
          description: "Introductory paragraphs before the table."
        },
        columns: {
          ...stringArraySchema,
          minItems: 1,
          maxItems: 8,
          description: "Table column names."
        },
        rows: {
          ...tableRowsSchema,
          description: "Table rows. Each row should align with columns."
        }
      }
    }
  },
  {
    type: "function",
    name: "append_table_to_page",
    description: "Append paragraphs and a simple table block to an existing Notion page.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["pageId", "pageTitle", "tableTitle", "paragraphs", "columns", "rows"],
      properties: {
        pageId: {
          type: ["string", "null"],
          description: "Known Notion page id. Use null if only pageTitle is known."
        },
        pageTitle: {
          type: ["string", "null"],
          description: "Existing Notion page title to search for when pageId is null."
        },
        tableTitle: {
          type: ["string", "null"],
          description: "Optional short heading to insert before the table."
        },
        paragraphs: {
          ...stringArraySchema,
          description: "Paragraphs to append before the table."
        },
        columns: {
          ...stringArraySchema,
          minItems: 1,
          maxItems: 8,
          description: "Table column names."
        },
        rows: {
          ...tableRowsSchema,
          description: "Table rows. Each row should align with columns."
        }
      }
    }
  },
  {
    type: "function",
    name: "create_notion_database",
    description: "Create a new Notion database with text columns and rows.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["title", "columns", "rows"],
      properties: {
        title: {
          type: "string",
          description: "Short database title."
        },
        columns: {
          ...stringArraySchema,
          minItems: 1,
          maxItems: 8,
          description: "Database property names. The first column becomes the title property."
        },
        rows: {
          ...tableRowsSchema,
          description: "Database rows. Each row should align with columns."
        }
      }
    }
  }
] as const;

const openAiTools = [
  {
    type: "web_search_preview"
  },
  ...functionTools
];

function parseToolArguments(rawArguments: string | undefined): Record<string, unknown> {
  if (!rawArguments?.trim()) {
    return {};
  }

  const parsed = JSON.parse(rawArguments) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("openai-tool-arguments-invalid");
  }

  return parsed as Record<string, unknown>;
}

function isNotionToolName(value: string | undefined): value is NotionAgentToolName {
  return functionTools.some((tool) => tool.name === value);
}

function extractFunctionCalls(response: OpenAiResponsesApiResponse): NotionAgentFunctionCall[] {
  return (response.output ?? [])
    .filter((item) => item.type === "function_call")
    .map((item) => {
      if (!item.call_id || !isNotionToolName(item.name)) {
        throw new Error(`openai-unsupported-tool-call:${item.name ?? "unknown"}`);
      }

      return {
        callId: item.call_id,
        name: item.name,
        arguments: parseToolArguments(item.arguments)
      };
    });
}

function extractResponseText(response: OpenAiResponsesApiResponse): string {
  if (response.output_text?.trim()) {
    return response.output_text.trim();
  }

  return (
    response.output
      ?.flatMap((outputItem) => outputItem.content ?? [])
      .map((content) => content.text ?? "")
      .join("")
      .trim() ?? ""
  );
}

async function createOpenAiResponse(
  apiKey: string,
  body: Record<string, unknown>
): Promise<OpenAiResponsesApiResponse> {
  const response = await fetch(`${OPENAI_API_BASE_URL}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(`openai-agent-failed:${response.status}:${responseText}`);
  }

  return JSON.parse(responseText) as OpenAiResponsesApiResponse;
}

function stringifyToolOutput(output: Record<string, unknown>): string {
  return JSON.stringify(output);
}

export async function runNotionAgent(
  userMessage: string,
  executeTool: NotionAgentToolExecutor
): Promise<string> {
  const apiKey = await getOpenAiApiKey();
  const model = await getOpenAiModel();
  let response = await createOpenAiResponse(apiKey, {
    model,
    instructions: notionAgentInstructions,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: userMessage
          }
        ]
      }
    ],
    tools: openAiTools
  });
  let lastToolOutput: Record<string, unknown> | undefined;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const functionCalls = extractFunctionCalls(response);
    const finalText = extractResponseText(response);

    if (functionCalls.length === 0) {
      if (finalText) {
        return finalText;
      }

      if (lastToolOutput) {
        return typeof lastToolOutput.message === "string"
          ? lastToolOutput.message
          : "Done.";
      }

      throw new Error("openai-agent-empty-response");
    }

    const toolOutputs = await Promise.all(
      functionCalls.map(async (functionCall) => {
        try {
          const output = await executeTool(functionCall);
          lastToolOutput = output;

          return {
            type: "function_call_output",
            call_id: functionCall.callId,
            output: stringifyToolOutput(output)
          };
        } catch (error) {
          const output = {
            ok: false,
            error: error instanceof Error ? error.message : "unknown-tool-error"
          };
          lastToolOutput = output;

          return {
            type: "function_call_output",
            call_id: functionCall.callId,
            output: stringifyToolOutput(output)
          };
        }
      })
    );

    response = await createOpenAiResponse(apiKey, {
      model,
      previous_response_id: response.id,
      input: toolOutputs,
      tools: openAiTools
    });
  }

  throw new Error("openai-agent-tool-round-limit");
}

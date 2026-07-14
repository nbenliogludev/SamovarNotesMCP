import { OPENAI_API_BASE_URL } from "../config";
import { getOpenAiApiKey, getOpenAiModel } from "../settingsStore";

export type NotionAgentToolName =
  | "search_notion_pages"
  | "search_notion_databases"
  | "read_notion_page"
  | "list_notion_page_blocks"
  | "read_notion_database"
  | "query_notion_database"
  | "create_notion_page"
  | "create_child_page"
  | "create_notion_table_page"
  | "append_blocks_to_page"
  | "append_table_to_page"
  | "update_notion_block_text"
  | "archive_notion_block"
  | "create_notion_database"
  | "add_database_rows"
  | "update_database_row"
  | "archive_database_row"
  | "update_notion_page_title"
  | "archive_notion_page";

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

const MAX_TOOL_ROUNDS = 12;

const notionAgentInstructions = `
You are SamovarNotes MCP, an agent that helps a user create and update Notion content.

Use the provided tools to perform Notion actions. Do not invent Notion URLs or pretend a write happened.

Important behavior:
- For current facts, recommendations, best/top lists, places, prices, or research requests, use web search before writing to Notion.
- To update an existing page, database, or table, search/read the target first unless the user already provided an exact id.
- If you need existing context before changing Notion, call read/list/query tools first, then call write tools after you have the tool output.
- If the user says a page is named/called/titled, use only that name as the target page title.
- Keep Notion page and table titles short. Never use the full user prompt as a title.
- Fill researched tables with real content, not placeholders like Row 1.
- Include a Source column for researched tables when useful.
- Only archive a page, block, or database row when the user explicitly asks to delete/archive/remove it. If the destructive intent is unclear, ask for confirmation instead of calling archive tools.
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

const valueArraySchema = {
  type: "array",
  maxItems: 8,
  items: {
    type: "string"
  }
};

const pageReferenceProperties = {
  pageId: {
    type: ["string", "null"],
    description: "Known Notion page id. Use null if only pageTitle is known."
  },
  pageTitle: {
    type: ["string", "null"],
    description: "Existing Notion page title to search for when pageId is null."
  }
};

const databaseReferenceProperties = {
  databaseId: {
    type: ["string", "null"],
    description: "Known Notion database id. Use null if only databaseTitle is known."
  },
  databaseTitle: {
    type: ["string", "null"],
    description: "Existing Notion database title to search for when databaseId is null."
  }
};

const blockListSchema = {
  type: "array",
  maxItems: 50,
  items: {
    type: "object",
    additionalProperties: false,
    required: ["type", "text"],
    properties: {
      type: {
        type: "string",
        enum: ["paragraph", "heading_1", "heading_2", "heading_3", "bulleted_list_item", "numbered_list_item", "to_do"]
      },
      text: {
        type: "string",
        description: "Text content for the block."
      }
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
    name: "search_notion_databases",
    description: "Search accessible Notion databases by title or query before reading or adding rows.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        query: {
          type: "string",
          description: "The database title or search query."
        }
      }
    }
  },
  {
    type: "function",
    name: "read_notion_page",
    description: "Retrieve metadata for an existing Notion page by id or title.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["pageId", "pageTitle"],
      properties: pageReferenceProperties
    }
  },
  {
    type: "function",
    name: "list_notion_page_blocks",
    description: "Read child blocks from an existing Notion page so the agent can understand current content before appending or editing.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["pageId", "pageTitle", "limit"],
      properties: {
        ...pageReferenceProperties,
        limit: {
          type: "number",
          description: "Maximum number of child blocks to return. Use 25 unless the user needs more."
        }
      }
    }
  },
  {
    type: "function",
    name: "read_notion_database",
    description: "Retrieve database metadata and columns by id or title.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["databaseId", "databaseTitle"],
      properties: databaseReferenceProperties
    }
  },
  {
    type: "function",
    name: "query_notion_database",
    description: "Read rows from an existing Notion database before adding or updating data.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["databaseId", "databaseTitle", "limit"],
      properties: {
        ...databaseReferenceProperties,
        limit: {
          type: "number",
          description: "Maximum rows to return. Use 10 by default."
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
    name: "create_child_page",
    description: "Create a child page under an existing Notion page by id or title.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["parentPageId", "parentPageTitle", "title", "paragraphs"],
      properties: {
        parentPageId: {
          type: ["string", "null"],
          description: "Known parent page id. Use null if only parentPageTitle is known."
        },
        parentPageTitle: {
          type: ["string", "null"],
          description: "Existing parent page title to search for when parentPageId is null."
        },
        title: {
          type: "string",
          description: "Short child page title."
        },
        paragraphs: {
          ...stringArraySchema,
          description: "Paragraphs to add to the child page. Use an empty array for a blank page."
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
    name: "append_blocks_to_page",
    description: "Append paragraph, heading, list, or todo blocks to an existing Notion page.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["pageId", "pageTitle", "blocks"],
      properties: {
        ...pageReferenceProperties,
        blocks: {
          ...blockListSchema,
          description: "Blocks to append in order."
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
        ...pageReferenceProperties,
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
    name: "update_notion_block_text",
    description: "Update the text of an existing Notion text block. Use list_notion_page_blocks first unless the block id is already known.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["blockId", "type", "text"],
      properties: {
        blockId: {
          type: "string",
          description: "Existing Notion block id."
        },
        type: {
          type: "string",
          enum: ["paragraph", "heading_1", "heading_2", "heading_3", "bulleted_list_item", "numbered_list_item", "to_do"],
          description: "Existing text block type."
        },
        text: {
          type: "string",
          description: "Replacement block text."
        }
      }
    }
  },
  {
    type: "function",
    name: "archive_notion_block",
    description: "Archive/delete an existing Notion block. Use only when the user explicitly requests deletion/removal/archive.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["blockId"],
      properties: {
        blockId: {
          type: "string",
          description: "Existing Notion block id."
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
  },
  {
    type: "function",
    name: "update_database_row",
    description: "Update text properties on an existing Notion database row. Query the database first unless rowPageId is already known.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["rowPageId", "columns", "values"],
      properties: {
        rowPageId: {
          type: "string",
          description: "The Notion page id for the database row."
        },
        columns: {
          ...stringArraySchema,
          minItems: 1,
          maxItems: 8,
          description: "Database property names to update. The first column is treated as title."
        },
        values: {
          ...valueArraySchema,
          description: "Replacement values aligned with columns."
        }
      }
    }
  },
  {
    type: "function",
    name: "archive_database_row",
    description: "Archive/delete an existing Notion database row by its row page id. Use only when explicitly requested.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["rowPageId"],
      properties: {
        rowPageId: {
          type: "string",
          description: "The Notion page id for the database row."
        }
      }
    }
  },
  {
    type: "function",
    name: "add_database_rows",
    description: "Add rows to an existing Notion database. Search/read the database first if only a title is known.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["databaseId", "databaseTitle", "columns", "rows"],
      properties: {
        ...databaseReferenceProperties,
        columns: {
          ...stringArraySchema,
          minItems: 1,
          maxItems: 8,
          description: "Database property names. The first column is treated as the title property."
        },
        rows: {
          ...tableRowsSchema,
          description: "Rows to add. Each row should align with columns."
        }
      }
    }
  },
  {
    type: "function",
    name: "update_notion_page_title",
    description: "Rename an existing Notion page by id or title.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["pageId", "pageTitle", "title"],
      properties: {
        ...pageReferenceProperties,
        title: {
          type: "string",
          description: "New short page title."
        }
      }
    }
  },
  {
    type: "function",
    name: "archive_notion_page",
    description: "Archive an existing Notion page. Use only when the user explicitly requests deletion/removal/archive.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["pageId", "pageTitle"],
      properties: pageReferenceProperties
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

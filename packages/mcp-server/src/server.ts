import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SAMOVAR_MCP_TOOL_NAMES } from "@samovar-notes-mcp/core";

export function createSamovarMcpServer(): McpServer {
  const server = new McpServer({
    name: "samovar-notes-mcp",
    version: "0.1.0"
  });

  for (const toolName of SAMOVAR_MCP_TOOL_NAMES) {
    server.tool(toolName, `Scaffold handler for ${toolName}.`, {}, async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              tool: toolName,
              status: "scaffold",
              message: "Tool contract is registered. Notion/OpenAI implementation will be added in the next branch."
            },
            null,
            2
          )
        }
      ]
    }));
  }

  return server;
}

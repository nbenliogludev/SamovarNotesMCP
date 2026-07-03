import "dotenv/config";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createSamovarMcpServer } from "./server";

async function main(): Promise<void> {
  const server = createSamovarMcpServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);
}

main().catch((error: unknown) => {
  console.error("SamovarNotes MCP server failed to start.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

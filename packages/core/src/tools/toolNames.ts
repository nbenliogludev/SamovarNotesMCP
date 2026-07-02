export const SAMOVAR_MCP_TOOL_NAMES = [
  "notion_create_page",
  "notion_create_database",
  "notion_add_database_rows",
  "notion_append_blocks",
  "notion_search_pages",
  "research_to_notion_database"
] as const;

export type SamovarMcpToolName = (typeof SAMOVAR_MCP_TOOL_NAMES)[number];

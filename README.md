# SamovarNotes MCP

**AI Research-to-Notion Assistant powered by MCP, OpenAI, and Notion API.**

SamovarNotes MCP turns raw research prompts into structured Notion pages, tables, and databases. The product idea is simple: write a messy research request, let the app brew it into clean structured data, and publish the result into Notion.

## Status

This repository is currently in the bootstrap stage. This README defines the MVP scope, architecture, commands, security expectations, and tool contracts. Implementation will follow in focused branches.

## Product

- Display name: `SamovarNotes MCP`
- Package name: `samovar-notes-mcp`
- Subtitle: `AI Research-to-Notion Assistant`
- Description: `SamovarNotes MCP turns raw research into structured Notion pages, tables, and databases.`

## Features

- Electron desktop app with React and Vite
- OpenAI-powered structured research generation
- Notion page, database, and row creation
- Local MCP server exposing reusable Notion tools
- Shared core package for desktop and MCP flows
- Safe local settings with no hardcoded secrets
- MVP support for Notion Internal Integration Tokens
- OAuth-ready architecture for future Notion workspace auth

## MVP User Flow

1. Open the Electron desktop app.
2. Enter an OpenAI API key.
3. Enter a Notion Internal Integration Token.
4. Enter a target Notion parent page ID.
5. Write a research prompt.
6. Generate structured research data with OpenAI.
7. Create a Notion database or page through shared tool handlers.
8. Show the created Notion URL in the app.

Example prompt:

```txt
Research the 10 best places to visit in Italy in summer and create a ranked Notion table with place, region, best season, budget, short description, and why it is worth visiting.
```

## Target Architecture

```txt
samovar-notes-mcp/
  apps/
    desktop/
      src/
        main/
        preload/
        renderer/
  packages/
    core/
      src/
        openai/
        notion/
        research/
        tools/
        storage/
        types/
    mcp-server/
      src/
        index.ts
        server.ts
  examples/
    demo-research-table.json
  package.json
  README.md
  .env.example
  tsconfig.base.json
```

## Planned Tech Stack

- TypeScript
- Electron
- React
- Vite
- Node.js
- `@modelcontextprotocol/sdk`
- `@notionhq/client`
- `openai`
- `zod`
- `dotenv`
- Local safe settings storage, with OS keychain encryption planned

## Setup

These are the intended MVP commands once the project scaffold is implemented.

```bash
npm install
cp .env.example .env
npm run desktop:dev
```

To run the local MCP server separately:

```bash
npm run mcp:dev
```

Quality commands:

```bash
npm run typecheck
npm run lint
npm run build
```

## Notion Setup

For the MVP, use a Notion Internal Integration Token.

1. Create a Notion integration in the Notion developer dashboard.
2. Copy the internal integration token.
3. Open the Notion parent page where generated pages/databases should be created.
4. Share that parent page with the integration.
5. Copy the parent page ID from the Notion page URL.
6. Add the token and parent page ID to `.env` or to the desktop app settings screen.

Production OAuth should use a backend token exchange service. Do not store a Notion OAuth client secret in Electron.

## Environment

Create `.env` from `.env.example`:

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
NOTION_TOKEN=
NOTION_PARENT_PAGE_ID=
```

The MCP server will read configuration from environment variables. The desktop app will store user settings locally and safely.

## Desktop App

The Electron app should include:

- `SettingsScreen`
  - OpenAI API key input
  - Notion token input
  - Parent Notion page ID input
  - Save settings action
  - Test Notion connection action
  - Test OpenAI connection action
- `PromptScreen`
  - Prompt textarea
  - `Create Notion Research Table` action
  - Loading and error states
- `ResultScreen`
  - Generated title
  - Summary
  - Notion URL
  - Open in browser action
- `Layout`
  - Title: `SamovarNotes MCP`
  - Subtitle: `AI Research-to-Notion Assistant`

Electron security requirements:

- `contextIsolation: true`
- `nodeIntegration: false`
- Expose only a safe preload API
- Do not expose raw Node.js or filesystem APIs to the renderer
- Do not log API keys or tokens
- Do not hardcode secrets
- Add a TODO for encrypted OS keychain storage after MVP local JSON settings

## MCP Tools

The MCP server should expose tools from `packages/core/src/tools` through `packages/mcp-server`.

### `notion_create_page`

Creates a Notion page under a parent page.

```json
{
  "parentPageId": "notion-parent-page-id",
  "title": "Italy Summer Travel Research",
  "markdownContent": "A short summary of the research."
}
```

### `notion_create_database`

Creates a Notion database with dynamic properties.

```json
{
  "parentPageId": "notion-parent-page-id",
  "title": "Best Places in Italy",
  "properties": [
    { "name": "Place", "type": "title" },
    { "name": "Region", "type": "rich_text" },
    { "name": "Budget", "type": "select" },
    { "name": "Worth Visiting", "type": "checkbox" }
  ]
}
```

Supported property types:

- `title`
- `rich_text`
- `number`
- `select`
- `multi_select`
- `url`
- `date`
- `checkbox`

### `notion_add_database_rows`

Adds rows to an existing Notion database.

```json
{
  "databaseId": "notion-database-id",
  "rows": [
    {
      "Place": "Florence",
      "Region": "Tuscany",
      "Budget": "Medium",
      "Worth Visiting": true
    }
  ]
}
```

### `notion_append_blocks`

Appends structured blocks to an existing Notion page.

```json
{
  "pageId": "notion-page-id",
  "blocks": [
    { "type": "heading_2", "text": "Summary" },
    { "type": "paragraph", "text": "Italy is ideal for summer culture, food, and coastlines." },
    { "type": "bulleted_list_item", "text": "Book popular cities early." }
  ]
}
```

### `notion_search_pages`

Searches pages and databases available to the integration.

```json
{
  "query": "Italy"
}
```

### `research_to_notion_database`

Generates structured research data with OpenAI, creates a Notion database, inserts rows, and returns the created Notion URL.

```json
{
  "prompt": "Research the 10 best places to visit in Italy in summer.",
  "parentPageId": "notion-parent-page-id",
  "title": "Italy Summer Travel Research"
}
```

Expected result:

```json
{
  "title": "Italy Summer Travel Research",
  "summary": "A concise overview of the generated research.",
  "databaseId": "notion-database-id",
  "notionUrl": "https://www.notion.so/...",
  "rowCount": 10
}
```

## OpenAI Research Service

The core package should expose:

```ts
class OpenAIResearchService {
  constructor(apiKey: string);

  async generateResearchTable(input: {
    prompt: string;
  }): Promise<{
    title: string;
    summary: string;
    columns: Array<{
      name: string;
      type: "title" | "rich_text" | "number" | "select" | "url" | "date" | "checkbox";
    }>;
    rows: Array<Record<string, string | number | boolean | null>>;
  }>;
}
```

The service should request strict JSON only. If the installed OpenAI SDK supports web search through the Responses API, web research can be added as an optional mode. If not, the first MVP should clearly document that generated research does not perform live web search.

## Notion OAuth Path

The MVP starts with a user-provided Notion Internal Integration Token. OAuth support should be added behind a `NotionAuthService` interface with placeholders for:

- Generate authorization URL
- Handle callback
- Exchange code for access token
- Store workspace token

The OAuth client secret must live on a backend token exchange service, not in the Electron app.

## Demo Fixture

`examples/demo-research-table.json` contains static OpenAI-like output that can be used to test Notion database creation without calling OpenAI.

The implementation branch should add a demo command similar to:

```bash
npm run notion:demo -- --input examples/demo-research-table.json
```

## Error Handling

The app and MCP server should return user-friendly errors for:

- Missing OpenAI API key
- Missing Notion token
- Missing Notion parent page ID
- Invalid Notion parent page ID
- Notion permission errors
- OpenAI invalid API key errors
- OpenAI invalid JSON responses
- Notion API rate limits
- Unknown network errors

## Security Notes

- Never commit real API keys or tokens.
- Keep `.env` out of git.
- Do not log OpenAI or Notion credentials.
- Do not hardcode secrets in Electron, preload, renderer, or MCP code.
- Production Notion OAuth must use a backend token exchange service.
- Upgrade MVP local settings storage to encrypted OS keychain storage.

## Future Improvements

- Full Notion OAuth
- Encrypted OS keychain storage
- Better web research with citations
- Template gallery
- History of generated pages
- Export to Markdown
- Multi-workspace support

# SamovarNotes MCP

**AI Research-to-Notion Assistant powered by MCP, OpenAI, and Notion API.**

SamovarNotes MCP turns raw research prompts into structured Notion pages, tables, and databases. The product idea is simple: write a messy research request, let the app brew it into clean structured data, and publish the result into Notion.

## Status

This repository now contains the first runnable scaffold:

- npm workspace monorepo
- Electron + React + Vite desktop app shell
- Notion connection screen with OAuth-required UI
- Multi-Notion workspace list with active workspace selection
- Electron local callback handling for `http://127.0.0.1:47837/notion/callback`
- Chat-style workspace after Notion sign-in
- Basic Notion command execution for pages, tables, and databases
- shared `packages/core` contracts and schemas
- local `packages/mcp-server` scaffold with registered MCP tool names

OpenAI research generation is still intentionally placeholder-only. The desktop MVP can execute basic deterministic Notion commands such as creating an empty page, a table page, or a database with placeholder rows.

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
- Required Notion OAuth workspace connection
- Multi-workspace Notion OAuth state in the desktop app
- OAuth architecture for backend token exchange

## MVP User Flow

1. Open the Electron desktop app.
2. Connect a Notion workspace through OAuth.
3. Add more Notion workspaces if needed.
4. Select the active Notion workspace.
5. Write a Notion creation command in the chat box.
6. The Electron main process executes the command through Notion API.
7. Show the created Notion URL in the chat.

Example prompt:

```txt
Create empty page with table where you need to create 5 rows and 10 columns.
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

Install dependencies:

```bash
npm install
cp .env.example .env
```

Run the desktop app in development mode:

```bash
npm run desktop:dev
```

In development this opens a real Electron desktop window. You do not get an `.exe` or `.dmg` at this stage; the app is launched by npm while the local Vite dev server is running.

Build the desktop app bundle:

```bash
npm run desktop:build
```

Packaging into installers such as `.exe`, `.dmg`, or `.AppImage` will be added later with an Electron packaging tool.

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

Notion OAuth is the required workspace connection path.

1. Create a public Notion integration in the Notion developer dashboard.
2. Configure the OAuth redirect URI from `.env.example`.
3. Add the OAuth client ID to `.env`.
4. For local MVP development, add `NOTION_OAUTH_CLIENT_SECRET` to `.env` so the app can exchange OAuth codes for workspace tokens.
5. For production, prefer `NOTION_OAUTH_TOKEN_EXCHANGE_URL` and move the client secret to a backend endpoint.
6. Give the Notion integration Insert Content capability.

Do not commit `.env` or hardcode Notion secrets. The desktop app stores OAuth access tokens locally using Electron `safeStorage` when available.

## Environment

Create `.env` from `.env.example`:

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
NOTION_PARENT_PAGE_ID=
NOTION_OAUTH_CLIENT_ID=
NOTION_OAUTH_CLIENT_SECRET=
NOTION_OAUTH_REDIRECT_URI=http://127.0.0.1:47837/notion/callback
NOTION_OAUTH_TOKEN_EXCHANGE_URL=
```

The MCP server will read configuration from environment variables. The desktop app will store user settings locally and safely.

## Desktop App

The Electron app should include:

- `SettingsScreen`
  - Required Notion OAuth sign-in entry point
  - Connected Notion workspace list
  - Active Notion workspace selector
  - OpenAI API key input
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

The MVP treats Notion OAuth as the required workspace connection. The Electron app opens Notion OAuth, receives `http://127.0.0.1:47837/notion/callback`, verifies OAuth state, and stores connected workspace metadata.

The token exchange must happen behind `NOTION_OAUTH_TOKEN_EXCHANGE_URL`. That backend endpoint should accept:

```json
{
  "code": "temporary-notion-code",
  "state": "oauth-state",
  "redirectUri": "http://127.0.0.1:47837/notion/callback"
}
```

It should return the Notion OAuth token payload, including `access_token`, `refresh_token`, `workspace_id`, `workspace_name`, `workspace_icon`, and `bot_id`.

The renderer receives workspace metadata only. Token values are kept in the Electron main process store and encrypted with Electron `safeStorage` when the OS keychain backend is available.

OAuth support lives behind a `NotionAuthService` interface with placeholders for:

- Generate authorization URL
- Handle callback
- Exchange code for access token
- Store multiple workspace tokens

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
- Missing Notion OAuth connection
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

- Complete backend OAuth callback and token exchange
- Encrypted OS keychain storage
- Better web research with citations
- Template gallery
- History of generated pages
- Export to Markdown
- Multi-workspace support

# SamovarNotes MCP

Open-source Electron desktop app for turning prompts into Notion pages, tables, and databases.

## Current MVP

- macOS desktop app built with Electron, Vite, React, and TypeScript.
- Bring-your-own-keys setup screen.
- Local encrypted storage for user tokens through Electron `safeStorage` when available.
- No hosted auth service, browser sign-in, or manual tunnel setup.
- Basic deterministic Notion commands:
  - create an empty page
  - create a page with a table
  - create a database with placeholder rows

OpenAI-powered live research is not wired into the app yet. The app stores and tests the OpenAI key so the next branch can add the research pipeline cleanly.

## User Setup

For the packaged DMG flow, users only need:

1. An OpenAI API key.
2. A Notion internal integration token.
3. Optionally, a Notion parent page ID.

The Notion integration must have access to the page where SamovarNotes should create content. In Notion, open the target page, use `Share`, and invite the integration.

## Developer Setup

```bash
npm install
npm run start:dev
```

Optional development overrides can be placed in `.env`, using `.env.example` as a template. The packaged app does not require `.env`.

## Build

Build all workspaces:

```bash
npm run build
```

Build the macOS DMG:

```bash
npm run desktop:dist
```

The DMG is written to:

```text
apps/desktop/release/
```

## Security Model

- Do not commit real OpenAI or Notion tokens.
- User-provided tokens are stored in the app data directory, encrypted with Electron `safeStorage` where supported.
- The open-source DMG uses token mode only. There is no client secret in the app.
- Hosted account login can be added later as a separate product mode, but the open-source app does not need it.

## Useful Scripts

```bash
npm run typecheck
npm run build
npm run desktop:dist
```

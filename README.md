# SamovarNotes MCP

Open-source Electron desktop app for turning prompts into Notion pages, tables, and databases.

## Current MVP

- macOS desktop app built with Electron, Vite, React, and TypeScript.
- Bring-your-own-keys setup screen.
- Local encrypted storage for user tokens through Electron `safeStorage` when available.
- No hosted auth service, browser sign-in, or manual tunnel setup.
- OpenAI tool-calling agent for Notion commands:
  - understand natural-language prompts instead of static keyword parsing
  - call app-owned Notion tools through the Responses API function-calling loop
  - create an empty page
  - create a page with a table
  - find an existing page by title and append a researched table
  - create a database
- Voice input in the chat composer: record a short prompt, transcribe it with OpenAI, and insert the text before sending.
- OpenAI web research through the Responses API for prompts that ask for current facts, best/top lists, places, prices, or external information.

## User Setup

For the packaged DMG flow, users only need:

1. An OpenAI API key.
2. A Notion Personal access token.

In the app setup screen:

- OpenAI API key: create it in OpenAI Platform > API keys.
- Notion Personal access token: create it in Notion Developers > Personal access tokens. Do not use an OAuth client ID, client secret, or Access token connection.

Personal access tokens act with the access of the Notion user who created them. SamovarNotes uses that token to create requested pages, tables, and databases without asking the user to create a dedicated SamovarNotes page first.

## Developer Setup

```bash
npm install
npm run start:dev
```

Optional development overrides can be placed in `.env`, using `.env.example` as a template. The packaged app does not require `.env`.

Chat execution and web research use the saved OpenAI model. Pick a model that supports the Responses API with function calling and web search. Voice input uses the saved OpenAI API key and the `gpt-4o-mini-transcribe` model by default. Developers can override it with `OPENAI_TRANSCRIPTION_MODEL`.

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

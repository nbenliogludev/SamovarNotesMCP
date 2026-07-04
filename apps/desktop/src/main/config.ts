import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

function loadDesktopEnv(): void {
  const candidatePaths = [
    join(process.cwd(), ".env"),
    join(process.cwd(), "../..", ".env"),
    join(__dirname, "../../../..", ".env")
  ];
  const envPath = [...new Set(candidatePaths.map((candidatePath) => resolve(candidatePath)))].find((candidatePath) =>
    existsSync(candidatePath)
  );

  if (envPath) {
    loadEnv({ path: envPath });
  }
}

loadDesktopEnv();

export function getOptionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();

  return value ? value : undefined;
}

export const APP_NAME = "SamovarNotes MCP";
export const APP_SUBTITLE = "AI Research-to-Notion Assistant";
export const APP_PROTOCOL = "samovar-notes-mcp";

export const NOTION_OAUTH_CALLBACK_HOST = "127.0.0.1";
export const NOTION_OAUTH_CALLBACK_PORT = Number(process.env.NOTION_OAUTH_CALLBACK_PORT ?? "47837");
export const NOTION_OAUTH_CALLBACK_PATH = "/notion/callback";
export const NOTION_OAUTH_AUTHORIZE_URL = "https://api.notion.com/v1/oauth/authorize";
export const NOTION_OAUTH_TOKEN_URL = "https://api.notion.com/v1/oauth/token";
export const NOTION_OAUTH_TOKEN_EXCHANGE_URL = getOptionalEnv("NOTION_OAUTH_TOKEN_EXCHANGE_URL");

export const NOTION_API_BASE_URL = "https://api.notion.com/v1";
export const NOTION_API_VERSION = process.env.NOTION_API_VERSION ?? "2026-03-11";
export const NOTION_LEGACY_DATABASE_VERSION = "2022-06-28";

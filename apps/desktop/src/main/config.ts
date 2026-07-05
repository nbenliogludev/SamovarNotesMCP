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

export const NOTION_API_BASE_URL = "https://api.notion.com/v1";
export const NOTION_API_VERSION = process.env.NOTION_API_VERSION ?? "2026-03-11";
export const NOTION_LEGACY_DATABASE_VERSION = "2022-06-28";

export const OPENAI_API_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";

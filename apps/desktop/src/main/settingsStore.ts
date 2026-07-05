import { app } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DEFAULT_OPENAI_MODEL, getOptionalEnv } from "./config";
import type { PublicConnectionSettings, SaveConnectionSettingsInput, StoredConnectionSettings } from "./types";
import { protectSecret, revealSecret } from "./notion/secretStorage";

function getSettingsStorePath(): string {
  return join(app.getPath("userData"), "connection-settings.json");
}

function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}

function createDefaultSettings(): StoredConnectionSettings {
  return {
    openAiModel: getOptionalEnv("OPENAI_MODEL") ?? DEFAULT_OPENAI_MODEL
  };
}

export function toPublicSettings(settings: StoredConnectionSettings): PublicConnectionSettings {
  const publicSettings: PublicConnectionSettings = {
    hasOpenAiApiKey: Boolean(settings.openAiApiKeyCiphertext || getOptionalEnv("OPENAI_API_KEY")),
    hasNotionToken: Boolean(settings.notionTokenCiphertext || getOptionalEnv("NOTION_ACCESS_TOKEN") || getOptionalEnv("NOTION_API_KEY")),
    isConfigured: false,
    openAiModel: settings.openAiModel || DEFAULT_OPENAI_MODEL
  };

  publicSettings.isConfigured = publicSettings.hasOpenAiApiKey && publicSettings.hasNotionToken;

  if (settings.notionParentPageId) {
    publicSettings.notionParentPageId = settings.notionParentPageId;
  }

  if (settings.updatedAt) {
    publicSettings.updatedAt = settings.updatedAt;
  }

  return publicSettings;
}

export async function loadConnectionSettings(): Promise<StoredConnectionSettings> {
  try {
    const rawSettings = await readFile(getSettingsStorePath(), "utf8");
    const parsed = JSON.parse(rawSettings) as Partial<StoredConnectionSettings>;

    return {
      ...createDefaultSettings(),
      ...parsed,
      openAiModel: trimOptional(parsed.openAiModel) ?? getOptionalEnv("OPENAI_MODEL") ?? DEFAULT_OPENAI_MODEL
    };
  } catch {
    return createDefaultSettings();
  }
}

async function saveConnectionSettings(settings: StoredConnectionSettings): Promise<void> {
  const settingsPath = getSettingsStorePath();

  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf8");
}

export async function getPublicConnectionSettings(): Promise<PublicConnectionSettings> {
  return toPublicSettings(await loadConnectionSettings());
}

export async function updateConnectionSettings(
  input: SaveConnectionSettingsInput
): Promise<PublicConnectionSettings> {
  const currentSettings = await loadConnectionSettings();
  const nextSettings: StoredConnectionSettings = {
    ...currentSettings,
    openAiModel: trimOptional(input.openAiModel) ?? currentSettings.openAiModel ?? DEFAULT_OPENAI_MODEL,
    updatedAt: new Date().toISOString()
  };
  const openAiApiKey = trimOptional(input.openAiApiKey);
  const notionToken = trimOptional(input.notionToken);
  const notionParentPageId = trimOptional(input.notionParentPageId);

  if (openAiApiKey) {
    nextSettings.openAiApiKeyCiphertext = protectSecret(openAiApiKey);
  } else if (input.clearOpenAiApiKey) {
    delete nextSettings.openAiApiKeyCiphertext;
  }

  if (notionToken) {
    nextSettings.notionTokenCiphertext = protectSecret(notionToken);
  } else if (input.clearNotionToken) {
    delete nextSettings.notionTokenCiphertext;
  }

  if (notionParentPageId) {
    nextSettings.notionParentPageId = notionParentPageId;
  } else {
    delete nextSettings.notionParentPageId;
  }

  await saveConnectionSettings(nextSettings);

  return toPublicSettings(nextSettings);
}

export async function getOpenAiApiKey(): Promise<string> {
  const settings = await loadConnectionSettings();
  const envToken = getOptionalEnv("OPENAI_API_KEY");

  if (settings.openAiApiKeyCiphertext) {
    return revealSecret(settings.openAiApiKeyCiphertext);
  }

  if (envToken) {
    return envToken;
  }

  throw new Error("missing-openai-api-key");
}

export async function getOpenAiModel(): Promise<string> {
  const settings = await loadConnectionSettings();

  return settings.openAiModel || DEFAULT_OPENAI_MODEL;
}

export async function getNotionAccessToken(): Promise<string> {
  const settings = await loadConnectionSettings();
  const envToken = getOptionalEnv("NOTION_ACCESS_TOKEN") ?? getOptionalEnv("NOTION_API_KEY");

  if (settings.notionTokenCiphertext) {
    return revealSecret(settings.notionTokenCiphertext);
  }

  if (envToken) {
    return envToken;
  }

  throw new Error("missing-notion-token");
}

export async function getNotionParentPageId(): Promise<string | undefined> {
  const settings = await loadConnectionSettings();

  return settings.notionParentPageId ?? getOptionalEnv("NOTION_PARENT_PAGE_ID");
}

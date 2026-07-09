import { NOTION_API_BASE_URL, NOTION_API_VERSION, OPENAI_API_BASE_URL } from "./config";
import { getNotionAccessToken, getOpenAiApiKey } from "./settingsStore";
import type { ConnectionTestResult } from "./types";

async function testOpenAiConnection(): Promise<ConnectionTestResult["openAi"]> {
  try {
    const apiKey = await getOpenAiApiKey();
    const response = await fetch(`${OPENAI_API_BASE_URL}/models`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`
      }
    });

    if (!response.ok) {
      return {
        ok: false,
        message: `OpenAI rejected the key (${response.status}).`
      };
    }

    return {
      ok: true,
      message: "OpenAI key works."
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error && error.message === "missing-openai-api-key"
        ? "Add an OpenAI API key."
        : "OpenAI connection test failed."
    };
  }
}

async function testNotionConnection(): Promise<ConnectionTestResult["notion"]> {
  try {
    const token = await getNotionAccessToken();
    const userResponse = await fetch(`${NOTION_API_BASE_URL}/users/me`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_API_VERSION
      }
    });

    if (!userResponse.ok) {
      return {
        ok: false,
        message: `Notion rejected the token (${userResponse.status}).`
      };
    }

    return {
      ok: true,
      message: "Notion token works."
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error && error.message === "missing-notion-token"
        ? "Add a Notion Personal access token."
        : "Notion connection test failed."
    };
  }
}

export async function testConnections(): Promise<ConnectionTestResult> {
  const [openAi, notion] = await Promise.all([testOpenAiConnection(), testNotionConnection()]);

  return {
    ok: openAi.ok && notion.ok,
    openAi,
    notion
  };
}

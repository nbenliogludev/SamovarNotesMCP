import {
  DEFAULT_OPENAI_TRANSCRIPTION_MODEL,
  getOptionalEnv,
  OPENAI_API_BASE_URL
} from "../config";
import { getOpenAiApiKey } from "../settingsStore";
import type { AudioTranscriptionInput, AudioTranscriptionResult } from "../types";

type OpenAiTranscriptionResponse = {
  text?: string;
};

function getAudioFileName(mimeType: string): string {
  if (mimeType.includes("mp4")) {
    return "samovar-voice.m4a";
  }

  if (mimeType.includes("mpeg")) {
    return "samovar-voice.mp3";
  }

  if (mimeType.includes("wav")) {
    return "samovar-voice.wav";
  }

  if (mimeType.includes("ogg")) {
    return "samovar-voice.ogg";
  }

  return "samovar-voice.webm";
}

function mapTranscriptionError(error: unknown): string {
  const message = error instanceof Error ? error.message : "unknown-error";

  if (message === "missing-openai-api-key") {
    return "Add an OpenAI API key in Settings, then try voice input again.";
  }

  if (message.startsWith("openai-transcription-failed:")) {
    return "OpenAI could not transcribe this recording. Try a shorter or clearer voice note.";
  }

  return "Voice transcription failed. Check microphone access and your OpenAI key.";
}

export async function transcribeAudio(input: AudioTranscriptionInput): Promise<AudioTranscriptionResult> {
  try {
    const audioBase64 = input.audioBase64.trim();

    if (!audioBase64) {
      return {
        ok: false,
        message: "Record audio before transcribing."
      };
    }

    const apiKey = await getOpenAiApiKey();
    const mimeType = input.mimeType?.split(";")[0] || "audio/webm";
    const audioBuffer = Buffer.from(audioBase64, "base64");

    if (audioBuffer.byteLength === 0) {
      return {
        ok: false,
        message: "The recording was empty."
      };
    }

    const audioBytes = new Uint8Array(audioBuffer);
    const audioFile = new File([audioBytes], getAudioFileName(mimeType), {
      type: mimeType
    });
    const formData = new FormData();

    formData.set("file", audioFile);
    formData.set("model", getOptionalEnv("OPENAI_TRANSCRIPTION_MODEL") ?? DEFAULT_OPENAI_TRANSCRIPTION_MODEL);

    const response = await fetch(`${OPENAI_API_BASE_URL}/audio/transcriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: formData
    });
    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(`openai-transcription-failed:${response.status}:${responseText}`);
    }

    const transcription = JSON.parse(responseText) as OpenAiTranscriptionResponse;
    const text = transcription.text?.trim();

    if (!text) {
      return {
        ok: false,
        message: "OpenAI returned an empty transcription."
      };
    }

    return {
      ok: true,
      message: "Voice transcribed.",
      text
    };
  } catch (error) {
    return {
      ok: false,
      message: mapTranscriptionError(error)
    };
  }
}

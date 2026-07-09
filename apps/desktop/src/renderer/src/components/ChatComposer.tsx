import { Check, Loader2, Mic, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FormEvent, FormEventHandler, KeyboardEventHandler } from "react";

const WAVEFORM_BAR_COUNT = 28;

type VoiceStatus = "idle" | "recording" | "transcribing" | "error";

type ChatComposerProps = {
  disabled: boolean;
  placement: "center" | "bottom";
  value: string;
  voiceDisabled: boolean;
  onChange: (value: string) => void;
  onKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onVoiceTranscript: (value: string) => void;
};

function createEmptyWaveform(): number[] {
  return Array.from({ length: WAVEFORM_BAR_COUNT }, () => 0.12);
}

function formatElapsedTime(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");

  return `${minutes}:${seconds}`;
}

function readBlobAsBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(reader.error ?? new Error("Unable to read audio recording."));
    reader.onloadend = () => {
      const result = reader.result;

      if (typeof result !== "string") {
        reject(new Error("Audio recording could not be encoded."));
        return;
      }

      resolve(result.split(",")[1] ?? "");
    };
    reader.readAsDataURL(blob);
  });
}

export function ChatComposer({
  disabled,
  placement,
  value,
  voiceDisabled,
  onChange,
  onKeyDown,
  onSubmit,
  onVoiceTranscript
}: ChatComposerProps) {
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [waveformLevels, setWaveformLevels] = useState<number[]>(() => createEmptyWaveform());
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const discardRecordingRef = useRef(false);
  const recordingStartedAtRef = useRef(0);

  useEffect(() => () => {
    cleanupRecordingResources();
  }, []);

  function cleanupRecordingResources() {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    void audioContextRef.current?.close();
    audioContextRef.current = null;
    mediaRecorderRef.current = null;
  }

  function drawWaveform(analyser: AnalyserNode) {
    const samples = new Uint8Array(analyser.fftSize);

    analyser.getByteTimeDomainData(samples);

    const groupSize = Math.max(1, Math.floor(samples.length / WAVEFORM_BAR_COUNT));
    const levels = Array.from({ length: WAVEFORM_BAR_COUNT }, (_item, index) => {
      const start = index * groupSize;
      const group = samples.slice(start, start + groupSize);
      const average = group.reduce((sum, sample) => sum + Math.abs(sample - 128), 0) / group.length;

      return Math.min(1, Math.max(0.08, average / 42));
    });

    setWaveformLevels(levels);
    animationFrameRef.current = requestAnimationFrame(() => drawWaveform(analyser));
  }

  async function transcribeRecording(blob: Blob) {
    setVoiceStatus("transcribing");

    try {
      if (!window.samovar?.transcribeAudio) {
        setVoiceStatus("error");
        setVoiceError("Voice transcription is available in the desktop app.");
        return;
      }

      const audioBase64 = await readBlobAsBase64(blob);
      const result = await window.samovar.transcribeAudio({
        audioBase64,
        mimeType: blob.type || "audio/webm"
      });

      if (!result.ok || !result.text) {
        setVoiceStatus("error");
        setVoiceError(result.message);
        return;
      }

      onVoiceTranscript(result.text);
      setVoiceStatus("idle");
      setVoiceError(null);
      setElapsedMs(0);
      setWaveformLevels(createEmptyWaveform());
    } catch {
      setVoiceStatus("error");
      setVoiceError("Voice transcription failed. Try recording again.");
    }
  }

  async function startRecording() {
    if (voiceDisabled || voiceStatus === "recording" || voiceStatus === "transcribing") {
      return;
    }

    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        setVoiceStatus("error");
        setVoiceError("This desktop runtime cannot access microphone recording.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "";
      const recorder = preferredMimeType
        ? new MediaRecorder(stream, { mimeType: preferredMimeType })
        : new MediaRecorder(stream);
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();

      analyser.fftSize = 256;
      source.connect(analyser);

      chunksRef.current = [];
      discardRecordingRef.current = false;
      streamRef.current = stream;
      audioContextRef.current = audioContext;
      mediaRecorderRef.current = recorder;
      recordingStartedAtRef.current = performance.now();
      setVoiceError(null);
      setElapsedMs(0);
      setWaveformLevels(createEmptyWaveform());
      setVoiceStatus("recording");

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        const chunks = [...chunksRef.current];
        const mimeType = recorder.mimeType || "audio/webm";
        const shouldDiscard = discardRecordingRef.current;

        cleanupRecordingResources();
        chunksRef.current = [];

        if (shouldDiscard) {
          setVoiceStatus("idle");
          setVoiceError(null);
          setElapsedMs(0);
          setWaveformLevels(createEmptyWaveform());
          return;
        }

        if (chunks.length === 0) {
          setVoiceStatus("error");
          setVoiceError("The recording was empty.");
          return;
        }

        void transcribeRecording(new Blob(chunks, { type: mimeType }));
      };

      recorder.start();
      timerRef.current = window.setInterval(() => {
        setElapsedMs(performance.now() - recordingStartedAtRef.current);
      }, 250);
      drawWaveform(analyser);
    } catch {
      cleanupRecordingResources();
      setVoiceStatus("error");
      setVoiceError("Microphone permission was denied or unavailable.");
    }
  }

  function stopRecordingForTranscription() {
    const recorder = mediaRecorderRef.current;

    if (!recorder || recorder.state === "inactive") {
      return;
    }

    discardRecordingRef.current = false;
    setVoiceStatus("transcribing");
    recorder.stop();
  }

  function cancelRecording() {
    const recorder = mediaRecorderRef.current;

    discardRecordingRef.current = true;

    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
      return;
    }

    cleanupRecordingResources();
    setVoiceStatus("idle");
    setVoiceError(null);
    setElapsedMs(0);
    setWaveformLevels(createEmptyWaveform());
  }

  const isRecording = voiceStatus === "recording";
  const isTranscribing = voiceStatus === "transcribing";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (isRecording || isTranscribing) {
      event.preventDefault();
      return;
    }

    onSubmit(event);
  }

  return (
    <form
      className={placement === "center" ? "chat-composer is-centered" : "chat-composer is-bottom"}
      onSubmit={handleSubmit}
    >
      <textarea
        aria-label="Message"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Ask SamovarNotes to create a Notion page, table, or research database..."
        rows={placement === "center" ? 3 : 1}
      />
      <button
        className={isRecording || isTranscribing ? "voice-button is-active" : "voice-button"}
        type="button"
        aria-label={isRecording ? "Recording voice prompt" : "Start voice prompt"}
        disabled={voiceDisabled || isTranscribing}
        title="Record voice prompt"
        onClick={() => void startRecording()}
      >
        {isTranscribing ? <Loader2 className="spin-icon" size={18} /> : <Mic size={18} />}
      </button>
      <button className="send-button" type="submit" aria-label="Send" disabled={disabled || isRecording || isTranscribing}>
        <Send size={18} />
      </button>
      {voiceStatus !== "idle" ? (
        <div className={`voice-recorder is-${voiceStatus}`} role="status">
          <div className="voice-recorder-header">
            <span>{isRecording ? "Recording" : isTranscribing ? "Transcribing" : "Voice input"}</span>
            <strong>{formatElapsedTime(elapsedMs)}</strong>
          </div>
          <div className="voice-waveform" aria-hidden="true">
            {waveformLevels.map((level, index) => (
              <span
                key={index}
                style={{ transform: `scaleY(${level})` }}
              />
            ))}
          </div>
          {voiceError ? <p>{voiceError}</p> : null}
          {isRecording ? (
            <div className="voice-actions">
              <button className="voice-action-button" type="button" onClick={cancelRecording}>
                <X size={15} />
                Cancel
              </button>
              <button className="voice-action-button is-primary" type="button" onClick={stopRecordingForTranscription}>
                <Check size={15} />
                OK
              </button>
            </div>
          ) : null}
          {voiceStatus === "error" ? (
            <div className="voice-actions">
              <button className="voice-action-button" type="button" onClick={cancelRecording}>
                Dismiss
              </button>
              <button className="voice-action-button is-primary" type="button" onClick={() => void startRecording()}>
                <Mic size={15} />
                Retry
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}

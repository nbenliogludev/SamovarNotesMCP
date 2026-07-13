import { CheckCircle2 } from "lucide-react";
import type { FormEventHandler, KeyboardEventHandler } from "react";
import { samplePrompt } from "../chat";
import type { ChatMessage } from "../types";
import { ChatComposer } from "./ChatComposer";
import { ChatThread } from "./ChatThread";

type ChatScreenProps = {
  chatInput: string;
  copiedMessageId: string | null;
  isComposerDisabled: boolean;
  isResponding: boolean;
  isVoiceDisabled: boolean;
  messages: ChatMessage[];
  onChatInputChange: (value: string) => void;
  onComposerKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  onCopyMessage: (message: ChatMessage) => void;
  onSamplePrompt: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onVoiceTranscript: (value: string) => void;
};

export function ChatScreen({
  chatInput,
  copiedMessageId,
  isComposerDisabled,
  isResponding,
  isVoiceDisabled,
  messages,
  onChatInputChange,
  onComposerKeyDown,
  onCopyMessage,
  onSamplePrompt,
  onSubmit,
  onVoiceTranscript
}: ChatScreenProps) {
  const hasMessages = messages.length > 0;

  return (
    <div className={hasMessages ? "chat-layout has-messages" : "chat-layout is-empty"}>
      {hasMessages ? (
        <ChatThread
          copiedMessageId={copiedMessageId}
          isResponding={isResponding}
          messages={messages}
          onCopyMessage={onCopyMessage}
        />
      ) : (
        <section className="chat-empty" aria-labelledby="chat-empty-title">
          <div className="chat-workspace-pill">
            <CheckCircle2 size={17} />
            Local keys connected
          </div>
          <h2 id="chat-empty-title">What are we creating in Notion?</h2>
          <ChatComposer
            disabled={isComposerDisabled}
            placement="center"
            value={chatInput}
            voiceDisabled={isVoiceDisabled}
            onChange={onChatInputChange}
            onKeyDown={onComposerKeyDown}
            onSubmit={onSubmit}
            onVoiceTranscript={onVoiceTranscript}
          />
          <button className="secondary-button compact-action" type="button" onClick={onSamplePrompt}>
            Try sample prompt
          </button>
        </section>
      )}

      {hasMessages ? (
        <ChatComposer
          disabled={isComposerDisabled}
          placement="bottom"
          value={chatInput}
          voiceDisabled={isVoiceDisabled}
          onChange={onChatInputChange}
          onKeyDown={onComposerKeyDown}
          onSubmit={onSubmit}
          onVoiceTranscript={onVoiceTranscript}
        />
      ) : null}
    </div>
  );
}

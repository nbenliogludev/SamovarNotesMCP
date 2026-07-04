import { CheckCircle2 } from "lucide-react";
import type { FormEventHandler, KeyboardEventHandler } from "react";
import { samplePrompt } from "../chat";
import type { ChatMessage, NotionWorkspace } from "../types";
import { ChatComposer } from "./ChatComposer";
import { ChatThread } from "./ChatThread";

type ChatScreenProps = {
  activeWorkspace: NotionWorkspace | undefined;
  chatInput: string;
  copiedMessageId: string | null;
  isComposerDisabled: boolean;
  isResponding: boolean;
  messages: ChatMessage[];
  onChatInputChange: (value: string) => void;
  onComposerKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  onCopyMessage: (message: ChatMessage) => void;
  onSamplePrompt: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
};

export function ChatScreen({
  activeWorkspace,
  chatInput,
  copiedMessageId,
  isComposerDisabled,
  isResponding,
  messages,
  onChatInputChange,
  onComposerKeyDown,
  onCopyMessage,
  onSamplePrompt,
  onSubmit
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
            {activeWorkspace?.workspaceName ?? "Notion connected"}
          </div>
          <h2 id="chat-empty-title">What are we creating in Notion?</h2>
          <ChatComposer
            disabled={isComposerDisabled}
            placement="center"
            value={chatInput}
            onChange={onChatInputChange}
            onKeyDown={onComposerKeyDown}
            onSubmit={onSubmit}
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
          onChange={onChatInputChange}
          onKeyDown={onComposerKeyDown}
          onSubmit={onSubmit}
        />
      ) : null}
    </div>
  );
}

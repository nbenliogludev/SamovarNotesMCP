import { Bot, Check, Copy, UserRound } from "lucide-react";
import { formatMessageDate } from "../chat";
import type { ChatMessage } from "../types";

type ChatThreadProps = {
  copiedMessageId: string | null;
  isResponding: boolean;
  messages: ChatMessage[];
  onCopyMessage: (message: ChatMessage) => void;
};

export function ChatThread({ copiedMessageId, isResponding, messages, onCopyMessage }: ChatThreadProps) {
  return (
    <div className="chat-thread" aria-label="Chat messages">
      {messages.map((message) => (
        <article className={`chat-message is-${message.role}`} key={message.id}>
          <div className="message-avatar">
            {message.role === "user" ? <UserRound size={18} /> : <Bot size={18} />}
          </div>
          <div className="message-bubble">
            <p>{message.content}</p>
            <div className="message-meta">
              <span>{formatMessageDate(message.createdAt)}</span>
              <button
                className="message-copy-button"
                type="button"
                aria-label="Copy message"
                title="Copy message"
                onClick={() => onCopyMessage(message)}
              >
                {copiedMessageId === message.id ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          </div>
        </article>
      ))}
      {isResponding ? (
        <article className="chat-message is-assistant">
          <div className="message-avatar">
            <Bot size={18} />
          </div>
          <div className="message-bubble">
            <p>Preparing...</p>
          </div>
        </article>
      ) : null}
    </div>
  );
}

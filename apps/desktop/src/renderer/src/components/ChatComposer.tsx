import { Send } from "lucide-react";
import type { FormEventHandler, KeyboardEventHandler } from "react";

type ChatComposerProps = {
  disabled: boolean;
  placement: "center" | "bottom";
  value: string;
  onChange: (value: string) => void;
  onKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  onSubmit: FormEventHandler<HTMLFormElement>;
};

export function ChatComposer({
  disabled,
  placement,
  value,
  onChange,
  onKeyDown,
  onSubmit
}: ChatComposerProps) {
  return (
    <form
      className={placement === "center" ? "chat-composer is-centered" : "chat-composer is-bottom"}
      onSubmit={onSubmit}
    >
      <textarea
        aria-label="Message"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Ask SamovarNotes to create a Notion page, table, or research database..."
        rows={placement === "center" ? 3 : 1}
      />
      <button className="send-button" type="submit" aria-label="Send" disabled={disabled}>
        <Send size={18} />
      </button>
    </form>
  );
}

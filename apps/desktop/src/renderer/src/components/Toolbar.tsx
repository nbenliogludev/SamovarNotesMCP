import { Settings } from "lucide-react";
import type { Screen } from "../types";

type ToolbarProps = {
  activeWorkspaceName: string | undefined;
  notionConnected: boolean;
  screen: Screen;
  onScreenChange: (screen: Screen) => void;
};

export function Toolbar({ activeWorkspaceName, notionConnected, screen, onScreenChange }: ToolbarProps) {
  return (
    <div className="toolbar">
      <div>
        <h2>{screen === "connect" ? "Connect Notion" : "Samovar Chat"}</h2>
        <p>{screen === "connect" ? "Workspace sign-in" : activeWorkspaceName ?? "Notion workspace"}</p>
      </div>
      <button
        className="icon-button"
        type="button"
        aria-label="Settings"
        onClick={() => onScreenChange(screen === "connect" && notionConnected ? "chat" : "connect")}
      >
        <Settings size={18} />
      </button>
    </div>
  );
}

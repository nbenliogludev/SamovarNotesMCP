import { Settings } from "lucide-react";
import type { Screen } from "../types";

type ToolbarProps = {
  isConfigured: boolean;
  screen: Screen;
  onScreenChange: (screen: Screen) => void;
};

export function Toolbar({ isConfigured, screen, onScreenChange }: ToolbarProps) {
  return (
    <div className="toolbar">
      <div>
        <h2>{screen === "settings" ? "Connect tokens" : "Samovar Chat"}</h2>
        <p>{screen === "settings" ? "Local encrypted settings" : "Ready to create in Notion"}</p>
      </div>
      <button
        className="icon-button"
        type="button"
        aria-label="Settings"
        onClick={() => onScreenChange(screen === "settings" && isConfigured ? "chat" : "settings")}
      >
        <Settings size={18} />
      </button>
    </div>
  );
}

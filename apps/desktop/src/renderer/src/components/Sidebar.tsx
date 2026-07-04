import { CheckCircle2, Sparkles } from "lucide-react";
import type { AppInfo } from "../types";

type SidebarProps = {
  appInfo: AppInfo | null;
  notionWorkspaceCount: number;
};

export function Sidebar({ appInfo, notionWorkspaceCount }: SidebarProps) {
  return (
    <aside className="sidebar" aria-label="Application status">
      <div className="brand-lockup">
        <div className="brand-mark">
          <Sparkles size={22} strokeWidth={2.2} />
        </div>
        <div>
          <h1>{appInfo?.name ?? "SamovarNotes MCP"}</h1>
          <p>{appInfo?.subtitle ?? "AI Research-to-Notion Assistant"}</p>
        </div>
      </div>

      <div className="status-list">
        <div className="status-row">
          <CheckCircle2 size={18} />
          <span>Electron window</span>
          <strong>{appInfo?.packaged ? "Packaged" : "Development"}</strong>
        </div>
        <div className="status-row">
          <CheckCircle2 size={18} />
          <span>Platform</span>
          <strong>{appInfo?.platform ?? "loading"}</strong>
        </div>
        <div className="status-row">
          <CheckCircle2 size={18} />
          <span>Version</span>
          <strong>{appInfo?.version ?? "0.1.0"}</strong>
        </div>
        <div className="status-row">
          <CheckCircle2 size={18} />
          <span>Notion</span>
          <strong>
            {notionWorkspaceCount > 0
              ? `${notionWorkspaceCount} workspace${notionWorkspaceCount === 1 ? "" : "s"}`
              : "Not connected"}
          </strong>
        </div>
      </div>
    </aside>
  );
}

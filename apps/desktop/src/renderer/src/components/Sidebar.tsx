import { CheckCircle2, Sparkles } from "lucide-react";
import type { AppInfo } from "../types";

type SidebarProps = {
  appInfo: AppInfo | null;
  isConfigured: boolean;
};

export function Sidebar({ appInfo, isConfigured }: SidebarProps) {
  const statusItems = [
    {
      label: "Window",
      value: appInfo?.packaged ? "Packaged" : "Development"
    },
    {
      label: "Platform",
      value: appInfo?.platform ?? "Loading"
    },
    {
      label: "Version",
      value: appInfo?.version ?? "0.1.0"
    },
    {
      label: "Connection",
      value: isConfigured ? "Ready" : "Setup needed"
    }
  ];

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

      <div className="status-card">
        <div className="status-card-heading">
          <CheckCircle2 size={18} />
          <span>Runtime</span>
        </div>
        <dl className="status-details">
          {statusItems.map((item) => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </aside>
  );
}

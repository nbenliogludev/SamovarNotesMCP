import { Database, KeyRound, Trash2 } from "lucide-react";
import type { NotionWorkspace } from "../types";

type WorkspaceListProps = {
  activeWorkspaceId: string | undefined;
  workspaces: NotionWorkspace[];
  onActiveWorkspaceChange: (workspaceId: string) => void;
  onRemoveWorkspace: (workspaceId: string) => void;
};

export function WorkspaceList({
  activeWorkspaceId,
  workspaces,
  onActiveWorkspaceChange,
  onRemoveWorkspace
}: WorkspaceListProps) {
  return (
    <section className="panel oauth-flow-panel" aria-labelledby="workspace-list-title">
      <div className="panel-title">
        <KeyRound size={18} />
        <h3 id="workspace-list-title">Notion Workspaces</h3>
      </div>
      {workspaces.length > 0 ? (
        <div className="workspace-list">
          {workspaces.map((workspace) => (
            <div
              className={workspace.workspaceId === activeWorkspaceId ? "workspace-row is-active" : "workspace-row"}
              key={workspace.workspaceId}
            >
              <button
                type="button"
                className="workspace-select-button"
                onClick={() => onActiveWorkspaceChange(workspace.workspaceId)}
              >
                <span className="workspace-avatar">
                  {workspace.workspaceIcon ? (
                    <img src={workspace.workspaceIcon} alt="" />
                  ) : (
                    (workspace.workspaceName ?? "N").slice(0, 1).toUpperCase()
                  )}
                </span>
                <span>
                  <strong>{workspace.workspaceName ?? "Notion workspace"}</strong>
                  <small>{workspace.authStatus === "token-exchange-pending" ? "Token exchange pending" : workspace.workspaceId}</small>
                </span>
              </button>
              <button
                type="button"
                className="icon-button subtle"
                aria-label="Remove workspace"
                onClick={() => onRemoveWorkspace(workspace.workspaceId)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state compact">
          <Database size={26} />
          <p>No Notion workspaces connected yet.</p>
        </div>
      )}

      <div className="flow-steps">
        <div className="flow-step is-ready">
          <span>1</span>
          <strong>Authorize</strong>
          <p>Open Notion consent.</p>
        </div>
        <div className="flow-step is-ready">
          <span>2</span>
          <strong>Callback</strong>
          <p>Receive OAuth code.</p>
        </div>
        <div className="flow-step">
          <span>3</span>
          <strong>Exchange</strong>
          <p>Backend stores each workspace token.</p>
        </div>
      </div>
    </section>
  );
}

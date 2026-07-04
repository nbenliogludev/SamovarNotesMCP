import { ArrowRight, Link2, LockKeyhole } from "lucide-react";
import type { NotionOAuthEvent, NotionWorkspace } from "../types";
import { WorkspaceList } from "./WorkspaceList";

type ConnectScreenProps = {
  activeWorkspaceId: string | undefined;
  isStartingOAuth: boolean;
  notionConnected: boolean;
  oauthNotice: string;
  oauthStatus: NotionOAuthEvent["status"];
  workspaces: NotionWorkspace[];
  onActiveWorkspaceChange: (workspaceId: string) => void;
  onContinueToChat: () => void;
  onOAuthStart: () => void;
  onRemoveWorkspace: (workspaceId: string) => void;
};

export function ConnectScreen({
  activeWorkspaceId,
  isStartingOAuth,
  notionConnected,
  oauthNotice,
  oauthStatus,
  workspaces,
  onActiveWorkspaceChange,
  onContinueToChat,
  onOAuthStart,
  onRemoveWorkspace
}: ConnectScreenProps) {
  return (
    <div className="connect-grid">
      <section className="connect-hero" aria-labelledby="connect-title">
        <div className="auth-badge">
          <LockKeyhole size={18} />
          Notion OAuth
        </div>
        <h2 id="connect-title">Sign in to Notion</h2>
        <p>Connect one or more Notion workspaces before creating research pages and databases.</p>

        <div className="oauth-panel">
          <button className="notion-button" type="button" onClick={onOAuthStart}>
            <Link2 size={18} />
            {isStartingOAuth ? "Opening Notion..." : notionConnected ? "Add Notion workspace" : "Continue with Notion"}
            <ArrowRight size={18} />
          </button>
          {oauthNotice ? <p className={`inline-notice is-${oauthStatus}`}>{oauthNotice}</p> : null}
          {notionConnected ? (
            <button className="primary-button" type="button" onClick={onContinueToChat}>
              <ArrowRight size={18} />
              Continue to chat
            </button>
          ) : null}
        </div>
      </section>

      <WorkspaceList
        activeWorkspaceId={activeWorkspaceId}
        workspaces={workspaces}
        onActiveWorkspaceChange={onActiveWorkspaceChange}
        onRemoveWorkspace={onRemoveWorkspace}
      />
    </div>
  );
}

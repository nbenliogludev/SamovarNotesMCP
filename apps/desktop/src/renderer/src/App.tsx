import {
  ArrowRight,
  CheckCircle2,
  Database,
  ExternalLink,
  KeyRound,
  Link2,
  LockKeyhole,
  Plus,
  Play,
  Settings,
  Sparkles,
  Trash2
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import type { NotionOAuthEvent, NotionWorkspace } from "../../preload";

type AppInfo = {
  name: string;
  subtitle: string;
  version: string;
  platform: NodeJS.Platform;
  packaged: boolean;
};

type GeneratedPreview = {
  title: string;
  summary: string;
  notionUrl: string;
  rowCount: number;
};

type Screen = "connect" | "workspace";

const samplePrompt =
  "Research the 10 best places to visit in Italy in summer and create a ranked Notion table with place, region, best season, budget, short description, and why it is worth visiting.";

export function App() {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [screen, setScreen] = useState<Screen>("connect");
  const [notionWorkspaces, setNotionWorkspaces] = useState<NotionWorkspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | undefined>();
  const [openAiKey, setOpenAiKey] = useState("");
  const [parentPageId, setParentPageId] = useState("");
  const [prompt, setPrompt] = useState(samplePrompt);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isStartingOAuth, setIsStartingOAuth] = useState(false);
  const [preview, setPreview] = useState<GeneratedPreview | null>(null);
  const [oauthNotice, setOauthNotice] = useState("");
  const [oauthStatus, setOauthStatus] = useState<NotionOAuthEvent["status"]>("idle");

  useEffect(() => {
    if (!window.samovar) {
      setAppInfo({
        name: "SamovarNotes MCP",
        subtitle: "AI Research-to-Notion Assistant",
        version: "0.1.0",
        platform: "browser" as NodeJS.Platform,
        packaged: false
      });
      return;
    }

    void window.samovar.getAppInfo().then(setAppInfo);

    const refreshNotionState = async () => {
      const notionState = await window.samovar.listNotionWorkspaces();

      setNotionWorkspaces(notionState.workspaces);
      setActiveWorkspaceId(notionState.activeWorkspaceId);
      setOauthStatus(notionState.latestOAuthEvent.status);
      setOauthNotice(notionState.latestOAuthEvent.status === "idle" ? "" : notionState.latestOAuthEvent.message);

      if (notionState.workspaces.length > 0) {
        setScreen("workspace");
      }
    };

    void refreshNotionState();

    return window.samovar.onNotionOAuthEvent((event) => {
      setOauthStatus(event.status);
      setOauthNotice(event.message);

      if (event.status === "connected") {
        void refreshNotionState();
      }
    });
  }, []);

  const activeWorkspace = notionWorkspaces.find((workspace) => workspace.workspaceId === activeWorkspaceId);
  const notionConnected = notionWorkspaces.length > 0;
  const canCreateTable = openAiKey.trim().length > 0 && Boolean(activeWorkspace) && parentPageId.trim().length > 0;

  async function handleOAuthStart() {
    setIsStartingOAuth(true);

    try {
      if (!window.samovar) {
        setOauthNotice("Notion OAuth is available in the desktop app.");
        return;
      }

      const result = await window.samovar.startNotionOAuth();

      setOauthNotice(
        result.ok
          ? "Notion sign-in opened in the browser."
          : "Notion OAuth client ID is not configured yet."
      );
    } catch {
      setOauthNotice("Notion sign-in could not be opened.");
    } finally {
      setIsStartingOAuth(false);
    }
  }

  async function handleActiveWorkspaceChange(workspaceId: string) {
    setActiveWorkspaceId(workspaceId);

    if (window.samovar) {
      await window.samovar.setActiveNotionWorkspace(workspaceId);
    }
  }

  async function handleRemoveWorkspace(workspaceId: string) {
    if (!window.samovar) {
      return;
    }

    await window.samovar.removeNotionWorkspace(workspaceId);

    const notionState = await window.samovar.listNotionWorkspaces();

    setNotionWorkspaces(notionState.workspaces);
    setActiveWorkspaceId(notionState.activeWorkspaceId);
    setOauthNotice(notionState.workspaces.length > 0 ? "Notion workspace removed." : "Connect Notion to continue.");

    if (notionState.workspaces.length === 0) {
      setScreen("connect");
    }
  }

  function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsGenerating(true);

    window.setTimeout(() => {
      setPreview({
        title: "Italy Summer Travel Research",
        summary: "Scaffold preview generated locally. OpenAI and Notion handlers will replace this mock result next.",
        notionUrl: "https://www.notion.so/",
        rowCount: 10
      });
      setIsGenerating(false);
    }, 550);
  }

  return (
    <main className="app-shell">
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
              {notionConnected
                ? `${notionWorkspaces.length} workspace${notionWorkspaces.length === 1 ? "" : "s"}`
                : "Not connected"}
            </strong>
          </div>
        </div>
      </aside>

      <section className="workspace" aria-label="SamovarNotes workspace">
        <div className="toolbar">
          <div>
            <h2>{screen === "connect" ? "Connect Notion" : "Research to Notion"}</h2>
            <p>{screen === "connect" ? "Workspace sign-in" : "Local MVP workspace"}</p>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Settings"
            onClick={() => setScreen("connect")}
            disabled={screen === "connect"}
          >
            <Settings size={18} />
          </button>
        </div>

        {screen === "connect" ? (
          <div className="connect-grid">
            <section className="connect-hero" aria-labelledby="connect-title">
              <div className="auth-badge">
                <LockKeyhole size={18} />
                Notion OAuth
              </div>
              <h2 id="connect-title">Sign in to Notion</h2>
              <p>Connect one or more Notion workspaces before creating research pages and databases.</p>

              <div className="oauth-panel">
                <button className="notion-button" type="button" onClick={() => void handleOAuthStart()}>
                  <Link2 size={18} />
                  {isStartingOAuth
                    ? "Opening Notion..."
                    : notionConnected
                      ? "Add Notion workspace"
                      : "Continue with Notion"}
                  <ArrowRight size={18} />
                </button>
                {oauthNotice ? <p className={`inline-notice is-${oauthStatus}`}>{oauthNotice}</p> : null}
                {notionConnected ? (
                  <button className="primary-button" type="button" onClick={() => setScreen("workspace")}>
                    <ArrowRight size={18} />
                    Continue to workspace
                  </button>
                ) : null}
              </div>
            </section>

            <section className="panel oauth-flow-panel" aria-labelledby="workspace-list-title">
              <div className="panel-title">
                <KeyRound size={18} />
                <h3 id="workspace-list-title">Notion Workspaces</h3>
              </div>
              {notionWorkspaces.length > 0 ? (
                <div className="workspace-list">
                  {notionWorkspaces.map((workspace) => (
                    <div
                      className={workspace.workspaceId === activeWorkspaceId ? "workspace-row is-active" : "workspace-row"}
                      key={workspace.workspaceId}
                    >
                      <button
                        type="button"
                        className="workspace-select-button"
                        onClick={() => void handleActiveWorkspaceChange(workspace.workspaceId)}
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
                          <small>{workspace.workspaceId}</small>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="icon-button subtle"
                        aria-label="Remove workspace"
                        onClick={() => void handleRemoveWorkspace(workspace.workspaceId)}
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
                <div className="flow-step">
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
          </div>
        ) : (
          <div className="grid">
            <section className="panel settings-panel" aria-labelledby="settings-title">
              <div className="panel-title">
                <KeyRound size={18} />
                <h3 id="settings-title">Settings</h3>
              </div>

              <label>
                Active Notion workspace
                <select
                  value={activeWorkspaceId ?? ""}
                  onChange={(event) => void handleActiveWorkspaceChange(event.target.value)}
                  disabled={notionWorkspaces.length === 0}
                >
                  {notionWorkspaces.length === 0 ? <option value="">Connect Notion first</option> : null}
                  {notionWorkspaces.map((workspace) => (
                    <option value={workspace.workspaceId} key={workspace.workspaceId}>
                      {workspace.workspaceName ?? workspace.workspaceId}
                    </option>
                  ))}
                </select>
              </label>

              <button className="secondary-button" type="button" onClick={() => void handleOAuthStart()}>
                <Plus size={16} />
                Add Notion workspace
              </button>

              <label>
                OpenAI API key
                <input
                  type="password"
                  value={openAiKey}
                  onChange={(event) => setOpenAiKey(event.target.value)}
                  placeholder="sk-..."
                  autoComplete="off"
                />
              </label>

              <label>
                Parent page ID
                <input
                  value={parentPageId}
                  onChange={(event) => setParentPageId(event.target.value)}
                  placeholder="Notion parent page ID"
                  autoComplete="off"
                />
              </label>

              <div className="button-row">
                <button type="button" className="secondary-button">
                  Test OpenAI
                </button>
                <button type="button" className="secondary-button">
                  Test Notion
                </button>
              </div>
            </section>

            <form className="panel prompt-panel" aria-labelledby="prompt-title" onSubmit={handleGenerate}>
              <div className="panel-title">
                <Database size={18} />
                <h3 id="prompt-title">Prompt</h3>
              </div>

              <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={11} />

              <button className="primary-button" type="submit" disabled={!canCreateTable || isGenerating}>
                <Play size={18} fill="currentColor" />
                {isGenerating ? "Creating..." : "Create Notion Research Table"}
              </button>
            </form>

            <section className="panel result-panel" aria-labelledby="result-title">
              <div className="panel-title">
                <ExternalLink size={18} />
                <h3 id="result-title">Result</h3>
              </div>

              {preview ? (
                <div className="result-content">
                  <h4>{preview.title}</h4>
                  <p>{preview.summary}</p>
                  <dl>
                    <div>
                      <dt>Rows</dt>
                      <dd>{preview.rowCount}</dd>
                    </div>
                    <div>
                      <dt>URL</dt>
                      <dd>{preview.notionUrl}</dd>
                    </div>
                  </dl>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => {
                      if (window.samovar) {
                        void window.samovar.openExternal(preview.notionUrl);
                        return;
                      }

                      window.open(preview.notionUrl, "_blank", "noopener");
                    }}
                  >
                    <ExternalLink size={16} />
                    Open Notion
                  </button>
                </div>
              ) : (
                <div className="empty-state">
                  <Database size={28} />
                  <p>Generated Notion database preview will appear here.</p>
                </div>
              )}
            </section>
          </div>
        )}
      </section>
    </main>
  );
}

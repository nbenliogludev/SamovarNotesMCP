import {
  ArrowRight,
  CheckCircle2,
  Database,
  ExternalLink,
  KeyRound,
  Link2,
  LockKeyhole,
  Play,
  Settings,
  Sparkles
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

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
  const [notionConnected, setNotionConnected] = useState(false);
  const [openAiKey, setOpenAiKey] = useState("");
  const [parentPageId, setParentPageId] = useState("");
  const [prompt, setPrompt] = useState(samplePrompt);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isStartingOAuth, setIsStartingOAuth] = useState(false);
  const [preview, setPreview] = useState<GeneratedPreview | null>(null);
  const [oauthNotice, setOauthNotice] = useState("");

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
  }, []);

  const canCreateTable = openAiKey.trim().length > 0 && notionConnected && parentPageId.trim().length > 0;

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
            <strong>{notionConnected ? "OAuth" : "Not connected"}</strong>
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
              <p>Connect a workspace before creating research pages and databases.</p>

              <div className="oauth-panel">
                <button className="notion-button" type="button" onClick={() => void handleOAuthStart()}>
                  <Link2 size={18} />
                  {isStartingOAuth ? "Opening Notion..." : "Continue with Notion"}
                  <ArrowRight size={18} />
                </button>
                {oauthNotice ? <p className="inline-notice">{oauthNotice}</p> : null}
              </div>
            </section>

            <section className="panel oauth-flow-panel" aria-labelledby="oauth-flow-title">
              <div className="panel-title">
                <KeyRound size={18} />
                <h3 id="oauth-flow-title">OAuth Flow</h3>
              </div>
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
                  <p>Backend stores workspace token.</p>
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

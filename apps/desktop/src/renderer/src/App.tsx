import { CheckCircle2, Database, ExternalLink, KeyRound, Play, Settings, Sparkles } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

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

const samplePrompt =
  "Research the 10 best places to visit in Italy in summer and create a ranked Notion table with place, region, best season, budget, short description, and why it is worth visiting.";

export function App() {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [openAiKey, setOpenAiKey] = useState("");
  const [notionToken, setNotionToken] = useState("");
  const [parentPageId, setParentPageId] = useState("");
  const [prompt, setPrompt] = useState(samplePrompt);
  const [isGenerating, setIsGenerating] = useState(false);
  const [preview, setPreview] = useState<GeneratedPreview | null>(null);

  useEffect(() => {
    void window.samovar.getAppInfo().then(setAppInfo);
  }, []);

  const settingsReady = useMemo(
    () => openAiKey.trim().length > 0 && notionToken.trim().length > 0 && parentPageId.trim().length > 0,
    [openAiKey, notionToken, parentPageId]
  );

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
        </div>
      </aside>

      <section className="workspace" aria-label="SamovarNotes workspace">
        <div className="toolbar">
          <div>
            <h2>Research to Notion</h2>
            <p>Local MVP workspace</p>
          </div>
          <button className="icon-button" type="button" aria-label="Settings">
            <Settings size={18} />
          </button>
        </div>

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
              Notion token
              <input
                type="password"
                value={notionToken}
                onChange={(event) => setNotionToken(event.target.value)}
                placeholder="secret_..."
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

            <button className="primary-button" type="submit" disabled={!settingsReady || isGenerating}>
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
                  onClick={() => void window.samovar.openExternal(preview.notionUrl)}
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
      </section>
    </main>
  );
}

import { AlertCircle, CheckCircle2, ExternalLink, KeyRound, Save } from "lucide-react";
import type { ConnectionTestResult, PublicConnectionSettings, SettingsFormState } from "../types";

type SettingsScreenProps = {
  form: SettingsFormState;
  isSaving: boolean;
  settings: PublicConnectionSettings | null;
  testResult: ConnectionTestResult | null;
  onChange: (patch: Partial<SettingsFormState>) => void;
  onOpenExternal: (url: string) => void;
  onSaveAndTest: () => void;
  onContinueToChat: () => void;
};

function ConnectionResult({ label, result }: { label: string; result: { ok: boolean; message: string } | null }) {
  if (!result) {
    return null;
  }

  return (
    <div className={result.ok ? "connection-result is-ok" : "connection-result is-error"}>
      {result.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
      <span>{label}</span>
      <strong>{result.message}</strong>
    </div>
  );
}

export function SettingsScreen({
  form,
  isSaving,
  settings,
  testResult,
  onChange,
  onContinueToChat,
  onOpenExternal,
  onSaveAndTest
}: SettingsScreenProps) {
  const canContinue = Boolean(settings?.isConfigured);

  return (
    <div className="settings-grid">
      <section className="connect-hero" aria-labelledby="settings-title">
        <div className="auth-badge">
          <KeyRound size={18} />
          Local keys
        </div>
        <h2 id="settings-title">Connect your tokens</h2>
        <p>Your keys are stored locally with OS encryption. No browser sign-in, OAuth client ID, or redirect URI is required.</p>

        <div className="setup-links">
          <button
            className="secondary-button"
            type="button"
            onClick={() => onOpenExternal("https://www.notion.so/profile/integrations")}
          >
            <ExternalLink size={16} />
            Notion developer settings
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => onOpenExternal("https://platform.openai.com/api-keys")}
          >
            <ExternalLink size={16} />
            OpenAI keys
          </button>
        </div>

        <div className="setup-guide" aria-label="Token setup guide">
          <div className="setup-step-card">
            <span>1</span>
            <strong>OpenAI API key</strong>
            <p>OpenAI Platform &gt; API keys &gt; Create new secret key. Paste the value that starts with sk-.</p>
          </div>
          <div className="setup-step-card">
            <span>2</span>
            <strong>Notion Personal access token</strong>
            <p>Notion Developers &gt; Personal access tokens &gt; create a token with content insert permissions.</p>
          </div>
          <div className="setup-step-card">
            <span>3</span>
            <strong>Save and test</strong>
            <p>The app checks both services, then creates pages in Notion using the access your token already has.</p>
          </div>
        </div>

        {canContinue ? (
          <button className="primary-button" type="button" onClick={onContinueToChat}>
            <CheckCircle2 size={18} />
            Continue to chat
          </button>
        ) : null}
      </section>

      <section className="panel token-settings-panel" aria-label="Token settings">
        <div className="panel-title">
          <KeyRound size={18} />
          <h3>Local connection</h3>
        </div>

        <label>
          OpenAI API key
          <input
            type="password"
            value={form.openAiApiKey}
            onChange={(event) => onChange({ openAiApiKey: event.target.value })}
            placeholder={settings?.hasOpenAiApiKey ? "Saved key" : "sk-..."}
          />
          <span className="field-help">Find it in OpenAI Platform &gt; API keys. Existing saved keys stay encrypted locally.</span>
        </label>

        <label>
          OpenAI model
          <input
            value={form.openAiModel}
            onChange={(event) => onChange({ openAiModel: event.target.value })}
            placeholder="gpt-4.1-mini"
          />
          <span className="field-help">
            This model understands chat prompts, calls Notion tools, and performs web research. Use a model that supports Responses API function calling and web search.
          </span>
        </label>

        <label>
          Notion Personal access token
          <input
            type="password"
            value={form.notionToken}
            onChange={(event) => onChange({ notionToken: event.target.value })}
            placeholder={settings?.hasNotionToken ? "Saved token" : "ntn_... or secret_..."}
          />
          <span className="field-help">
            Use Notion Developers &gt; Personal access tokens. Do not paste OAuth Client ID, Client secret, or an Access token connection here.
          </span>
        </label>

        <button className="primary-button" type="button" disabled={isSaving} onClick={onSaveAndTest}>
          <Save size={18} />
          {isSaving ? "Testing..." : "Save and test"}
        </button>

        <div className="connection-results">
          <ConnectionResult label="OpenAI" result={testResult?.openAi ?? null} />
          <ConnectionResult label="Notion" result={testResult?.notion ?? null} />
        </div>
      </section>
    </div>
  );
}

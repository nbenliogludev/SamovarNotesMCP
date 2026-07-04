import {
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Copy,
  Database,
  KeyRound,
  Link2,
  LockKeyhole,
  Send,
  Settings,
  Sparkles,
  Trash2,
  UserRound
} from "lucide-react";
import { FormEvent, KeyboardEvent, useEffect, useState } from "react";
import type { NotionOAuthEvent, NotionWorkspace } from "../../preload";

type AppInfo = {
  name: string;
  subtitle: string;
  version: string;
  platform: NodeJS.Platform;
  packaged: boolean;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

type Screen = "connect" | "chat";

const samplePrompt =
  "Create empty page with table where you need to create 5 rows and 10 columns.";

function createMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: new Date().toISOString()
  };
}

function formatMessageDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function App() {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [screen, setScreen] = useState<Screen>("connect");
  const [notionWorkspaces, setNotionWorkspaces] = useState<NotionWorkspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | undefined>();
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isResponding, setIsResponding] = useState(false);
  const [isStartingOAuth, setIsStartingOAuth] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
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
        setScreen("chat");
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
  const hasMessages = chatMessages.length > 0;

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
          : result.reason === "callback-server-failed"
            ? "Local OAuth callback server could not start."
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
      setChatMessages([]);
    }
  }

  async function handleChatSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const content = chatInput.trim();

    if (!content || !notionConnected || isResponding) {
      return;
    }

    setChatInput("");
    setChatMessages((currentMessages) => [...currentMessages, createMessage("user", content)]);
    setIsResponding(true);

    try {
      if (!window.samovar) {
        setChatMessages((currentMessages) => [
          ...currentMessages,
          createMessage("assistant", "Notion execution is available in the desktop app.")
        ]);
        return;
      }

      const result = await window.samovar.executeNotionChatCommand({
        message: content,
        ...(activeWorkspaceId ? { workspaceId: activeWorkspaceId } : {})
      });

      setChatMessages((currentMessages) => [
        ...currentMessages,
        createMessage("assistant", result.message)
      ]);
    } catch {
      setChatMessages((currentMessages) => [
        ...currentMessages,
        createMessage("assistant", "I could not run the Notion command. Try reconnecting Notion and sending it again.")
      ]);
    } finally {
      setIsResponding(false);
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  async function handleCopyMessage(message: ChatMessage) {
    await navigator.clipboard.writeText(message.content);
    setCopiedMessageId(message.id);
    window.setTimeout(() => {
      setCopiedMessageId((currentMessageId) => (currentMessageId === message.id ? null : currentMessageId));
    }, 1200);
  }

  function renderComposer(placement: "center" | "bottom") {
    return (
      <form
        className={placement === "center" ? "chat-composer is-centered" : "chat-composer is-bottom"}
        onSubmit={handleChatSubmit}
      >
        <textarea
          aria-label="Message"
          value={chatInput}
          onChange={(event) => setChatInput(event.target.value)}
          onKeyDown={handleComposerKeyDown}
          placeholder="Ask SamovarNotes to create a Notion page, table, or research database..."
          rows={placement === "center" ? 3 : 1}
        />
        <button
          className="send-button"
          type="submit"
          aria-label="Send"
          disabled={!chatInput.trim() || !notionConnected || isResponding}
        >
          <Send size={18} />
        </button>
      </form>
    );
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
            <h2>{screen === "connect" ? "Connect Notion" : "Samovar Chat"}</h2>
            <p>{screen === "connect" ? "Workspace sign-in" : activeWorkspace?.workspaceName ?? "Notion workspace"}</p>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Settings"
            onClick={() => setScreen(screen === "connect" && notionConnected ? "chat" : "connect")}
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
                  <button className="primary-button" type="button" onClick={() => setScreen("chat")}>
                    <ArrowRight size={18} />
                    Continue to chat
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
                          <small>{workspace.authStatus === "token-exchange-pending" ? "Token exchange pending" : workspace.workspaceId}</small>
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
          </div>
        ) : (
          <div className={hasMessages ? "chat-layout has-messages" : "chat-layout is-empty"}>
            {hasMessages ? (
              <div className="chat-thread" aria-label="Chat messages">
                {chatMessages.map((message) => (
                  <article className={`chat-message is-${message.role}`} key={message.id}>
                    <div className="message-avatar">
                      {message.role === "user" ? <UserRound size={18} /> : <Bot size={18} />}
                    </div>
                    <div className="message-bubble">
                      <p>{message.content}</p>
                      <div className="message-meta">
                        <span>{formatMessageDate(message.createdAt)}</span>
                        <button
                          className="message-copy-button"
                          type="button"
                          aria-label="Copy message"
                          title="Copy message"
                          onClick={() => void handleCopyMessage(message)}
                        >
                          {copiedMessageId === message.id ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
                {isResponding ? (
                  <article className="chat-message is-assistant">
                    <div className="message-avatar">
                      <Bot size={18} />
                    </div>
                    <div className="message-bubble">
                      <p>Preparing...</p>
                    </div>
                  </article>
                ) : null}
              </div>
            ) : (
              <section className="chat-empty" aria-labelledby="chat-empty-title">
                <div className="chat-workspace-pill">
                  <CheckCircle2 size={17} />
                  {activeWorkspace?.workspaceName ?? "Notion connected"}
                </div>
                <h2 id="chat-empty-title">What are we creating in Notion?</h2>
                {renderComposer("center")}
                <button className="secondary-button compact-action" type="button" onClick={() => setChatInput(samplePrompt)}>
                  Try sample prompt
                </button>
              </section>
            )}

            {hasMessages ? renderComposer("bottom") : null}
          </div>
        )}
      </section>
    </main>
  );
}

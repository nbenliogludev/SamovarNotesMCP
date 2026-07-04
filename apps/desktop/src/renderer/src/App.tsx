import { FormEvent, KeyboardEvent, useEffect, useState } from "react";
import { createMessage, samplePrompt } from "./chat";
import { ChatScreen } from "./components/ChatScreen";
import { ConnectScreen } from "./components/ConnectScreen";
import { Sidebar } from "./components/Sidebar";
import { Toolbar } from "./components/Toolbar";
import type { AppInfo, ChatMessage, NotionOAuthEvent, NotionWorkspace, Screen } from "./types";

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
  const isComposerDisabled = !chatInput.trim() || !notionConnected || isResponding;

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

  return (
    <main className="app-shell">
      <Sidebar appInfo={appInfo} notionWorkspaceCount={notionWorkspaces.length} />

      <section className="workspace" aria-label="SamovarNotes workspace">
        <Toolbar
          activeWorkspaceName={activeWorkspace?.workspaceName}
          notionConnected={notionConnected}
          screen={screen}
          onScreenChange={setScreen}
        />

        {screen === "connect" ? (
          <ConnectScreen
            activeWorkspaceId={activeWorkspaceId}
            isStartingOAuth={isStartingOAuth}
            notionConnected={notionConnected}
            oauthNotice={oauthNotice}
            oauthStatus={oauthStatus}
            workspaces={notionWorkspaces}
            onActiveWorkspaceChange={(workspaceId) => void handleActiveWorkspaceChange(workspaceId)}
            onContinueToChat={() => setScreen("chat")}
            onOAuthStart={() => void handleOAuthStart()}
            onRemoveWorkspace={(workspaceId) => void handleRemoveWorkspace(workspaceId)}
          />
        ) : (
          <ChatScreen
            activeWorkspace={activeWorkspace}
            chatInput={chatInput}
            copiedMessageId={copiedMessageId}
            isComposerDisabled={isComposerDisabled}
            isResponding={isResponding}
            messages={chatMessages}
            onChatInputChange={setChatInput}
            onComposerKeyDown={handleComposerKeyDown}
            onCopyMessage={(message) => void handleCopyMessage(message)}
            onSamplePrompt={() => setChatInput(samplePrompt)}
            onSubmit={handleChatSubmit}
          />
        )}
      </section>
    </main>
  );
}

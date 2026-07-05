import { FormEvent, KeyboardEvent, useEffect, useState } from "react";
import { createMessage, samplePrompt } from "./chat";
import { ChatScreen } from "./components/ChatScreen";
import { SettingsScreen } from "./components/SettingsScreen";
import { Sidebar } from "./components/Sidebar";
import { Toolbar } from "./components/Toolbar";
import type {
  AppInfo,
  ChatMessage,
  ConnectionTestResult,
  PublicConnectionSettings,
  Screen,
  SettingsFormState
} from "./types";

const defaultSettingsForm: SettingsFormState = {
  openAiApiKey: "",
  openAiModel: "gpt-4.1-mini",
  notionToken: "",
  notionParentPageId: ""
};

function createSettingsForm(settings: PublicConnectionSettings | null): SettingsFormState {
  return {
    ...defaultSettingsForm,
    openAiModel: settings?.openAiModel ?? defaultSettingsForm.openAiModel,
    notionParentPageId: settings?.notionParentPageId ?? ""
  };
}

export function App() {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [screen, setScreen] = useState<Screen>("settings");
  const [connectionSettings, setConnectionSettings] = useState<PublicConnectionSettings | null>(null);
  const [settingsForm, setSettingsForm] = useState<SettingsFormState>(defaultSettingsForm);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isResponding, setIsResponding] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  useEffect(() => {
    if (!window.samovar) {
      const browserSettings: PublicConnectionSettings = {
        hasOpenAiApiKey: false,
        hasNotionToken: false,
        isConfigured: false,
        openAiModel: defaultSettingsForm.openAiModel
      };

      setAppInfo({
        name: "SamovarNotes MCP",
        subtitle: "AI Research-to-Notion Assistant",
        version: "0.1.0",
        platform: "browser" as NodeJS.Platform,
        packaged: false
      });
      setConnectionSettings(browserSettings);
      setSettingsForm(createSettingsForm(browserSettings));
      return;
    }

    void window.samovar.getAppInfo().then(setAppInfo);

    void window.samovar.getConnectionSettings().then((settings) => {
      setConnectionSettings(settings);
      setSettingsForm(createSettingsForm(settings));

      if (settings.isConfigured) {
        setScreen("chat");
      }
    });
  }, []);

  const isConfigured = Boolean(connectionSettings?.isConfigured);
  const isComposerDisabled = !chatInput.trim() || !isConfigured || isResponding;

  function updateSettingsForm(patch: Partial<SettingsFormState>) {
    setSettingsForm((currentForm) => ({
      ...currentForm,
      ...patch
    }));
  }

  async function handleSaveAndTestSettings() {
    setIsSavingSettings(true);
    setTestResult(null);

    try {
      if (!window.samovar) {
        return;
      }

      const savedSettings = await window.samovar.saveConnectionSettings({
        openAiApiKey: settingsForm.openAiApiKey,
        openAiModel: settingsForm.openAiModel,
        notionToken: settingsForm.notionToken,
        notionParentPageId: settingsForm.notionParentPageId
      });
      const connectionTest = await window.samovar.testConnections();

      setConnectionSettings(savedSettings);
      setSettingsForm(createSettingsForm(savedSettings));
      setTestResult(connectionTest);

      if (connectionTest.ok) {
        setScreen("chat");
      }
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function handleOpenExternal(url: string) {
    if (window.samovar) {
      await window.samovar.openExternal(url);
    }
  }

  async function handleChatSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const content = chatInput.trim();

    if (!content || !isConfigured || isResponding) {
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
        message: content
      });

      setChatMessages((currentMessages) => [
        ...currentMessages,
        createMessage("assistant", result.message)
      ]);
    } catch {
      setChatMessages((currentMessages) => [
        ...currentMessages,
        createMessage("assistant", "I could not run the Notion command. Check Settings and send it again.")
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
      <Sidebar appInfo={appInfo} isConfigured={isConfigured} />

      <section className="workspace" aria-label="SamovarNotes workspace">
        <Toolbar
          isConfigured={isConfigured}
          screen={screen}
          onScreenChange={setScreen}
        />

        {screen === "settings" ? (
          <SettingsScreen
            form={settingsForm}
            isSaving={isSavingSettings}
            settings={connectionSettings}
            testResult={testResult}
            onChange={updateSettingsForm}
            onContinueToChat={() => setScreen("chat")}
            onOpenExternal={(url) => void handleOpenExternal(url)}
            onSaveAndTest={() => void handleSaveAndTestSettings()}
          />
        ) : (
          <ChatScreen
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

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";

type Conversation = {
  id: string;
  business_id: string;
  channel: "workspace" | "whatsapp";
  status: string;
  subject: string;
  business_name: string;
  account_owner: string;
  contact_phone: string;
  registered_email: string;
  subscription_plan: string;
  whatsapp_contact_id: string | null;
  assigned_agent_id: string | null;
  unread_admin_count: number;
  unread_business_count: number;
  last_message_at: string;
  created_at: string;
  updated_at: string;
  latestMessage: { body: string; created_at: string; sender_type: string } | null;
};

type Agent = { id: string; label: string };
type SupportTemplate = { name: string; language: string; parameters: number };
type SafeWhatsAppSettings = {
  businessPhoneNumber: string;
  businessAccountId: string;
  phoneNumberId: string;
  displayName: string;
  graphApiVersion: string;
  supportAvailable: boolean;
  welcomeMessage: string;
  supportHours: Record<string, unknown>;
  approvedTemplates: SupportTemplate[];
  hasAccessToken: boolean;
  hasAppSecret: boolean;
  hasVerifyToken: boolean;
  encryptionReady: boolean;
};
type Attachment = { id: string; fileName: string; mimeType: string; sizeBytes: number; url: string };
type Message = {
  id: string;
  sender_type: string;
  body: string;
  delivery_status: string;
  created_at: string;
  attachments: Attachment[];
};
type Note = { id: string; agent_id: string | null; body: string; created_at: string };
type InboxTab = "all" | "new" | "open" | "pending" | "resolved" | "archived";

const inboxTabs: Array<{ id: InboxTab; label: string; status: string }> = [
  { id: "all", label: "All Conversations", status: "all" },
  { id: "new", label: "New Messages", status: "new" },
  { id: "open", label: "Open Conversations", status: "open" },
  { id: "pending", label: "Pending Replies", status: "pending" },
  { id: "resolved", label: "Resolved Conversations", status: "resolved" },
  { id: "archived", label: "Archived Conversations", status: "archived" },
];

function dateTime(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString();
}

function statusLabel(status: string) {
  return ({
    open: "Open",
    pending: "Pending",
    resolved: "Resolved",
    archived: "Archived",
    sent: "Sent",
    delivered: "Delivered",
    read: "Read",
    failed: "Failed",
    queued: "Queued",
  } as Record<string, string>)[status] ?? status;
}

function decodePublicKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

export default function WhatsAppSupportCenter({
  role,
  initialView = "inbox",
}: {
  role: string;
  initialView?: "inbox" | "settings";
}) {
  const [tab, setTab] = useState<InboxTab>("all");
  const [view, setView] = useState<"inbox" | "settings">(initialView);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [whatsapp, setWhatsApp] = useState<SafeWhatsAppSettings | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateParameters, setTemplateParameters] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [savingAction, setSavingAction] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [config, setConfig] = useState<SafeWhatsAppSettings | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState("");
  const [configNotice, setConfigNotice] = useState("");
  const [secretValues, setSecretValues] = useState({ accessToken: "", appSecret: "", verifyToken: "" });
  const [supportHoursText, setSupportHoursText] = useState("{}");
  const [templatesText, setTemplatesText] = useState("");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedId) ?? null,
    [conversations, selectedId],
  );
  const selectedTemplate = useMemo(
    () => whatsapp?.approvedTemplates.find((template) => `${template.name}|${template.language}` === templateName) ?? null,
    [templateName, whatsapp],
  );
  const unreadTotal = conversations.reduce((total, conversation) => total + conversation.unread_admin_count, 0);

  const loadInbox = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        status: inboxTabs.find((item) => item.id === tab)?.status ?? "all",
      });
      if (search.trim()) params.set("q", search.trim());
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      const response = await fetch(`/api/support/admin/conversations?${params.toString()}`, { cache: "no-store" });
      const result = await response.json() as {
        conversations?: Conversation[];
        agents?: Agent[];
        whatsapp?: SafeWhatsAppSettings;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? "Support inbox-ka lama soo qaadi karin.");
      const items = result.conversations ?? [];
      setConversations(items);
      setAgents(result.agents ?? []);
      setWhatsApp(result.whatsapp ?? null);
      setSelectedId((current) => {
        if (current && items.some((item) => item.id === current)) return current;
        const requested = new URLSearchParams(window.location.search).get("conversation");
        return (requested && items.some((item) => item.id === requested) ? requested : items[0]?.id) ?? "";
      });
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Support inbox-ka lama soo qaadi karin.");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, search, tab]);

  const loadMessages = useCallback(async (conversationId: string) => {
    if (!conversationId) {
      setMessages([]);
      setNotes([]);
      return;
    }
    try {
      const [messagesResponse, detailsResponse] = await Promise.all([
        fetch(`/api/support/conversations/${conversationId}/messages`, { cache: "no-store" }),
        fetch(`/api/support/admin/conversations/${conversationId}`, { cache: "no-store" }),
      ]);
      const [messagesResult, detailsResult] = await Promise.all([
        messagesResponse.json() as Promise<{ messages?: Message[]; error?: string }>,
        detailsResponse.json() as Promise<{ notes?: Note[]; error?: string }>,
      ]);
      if (!messagesResponse.ok) throw new Error(messagesResult.error ?? "Fariimaha lama soo qaadi karin.");
      if (!detailsResponse.ok) throw new Error(detailsResult.error ?? "Faahfaahinta lama soo qaadi karin.");
      setMessages(messagesResult.messages ?? []);
      setNotes(detailsResult.notes ?? []);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Fariimaha lama soo qaadi karin.");
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    const firstLoad = window.setTimeout(() => void loadInbox(), 0);
    const timer = window.setInterval(() => void loadInbox(), 12_000);
    return () => {
      window.clearTimeout(firstLoad);
      window.clearInterval(timer);
    };
  }, [loadInbox]);

  useEffect(() => {
    if (!selectedId) return;
    const firstLoad = window.setTimeout(() => void loadMessages(selectedId), 0);
    const timer = window.setInterval(() => void loadMessages(selectedId), 5_000);
    const supabase = createSupabaseClient("admin");
    const channel = supabase.channel(`admin-support-${selectedId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "support_messages",
        filter: `conversation_id=eq.${selectedId}`,
      }, () => {
        void loadMessages(selectedId);
        void loadInbox();
      })
      .subscribe();
    return () => {
      window.clearTimeout(firstLoad);
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [loadInbox, loadMessages, selectedId]);

  async function updateConversation(input: { status?: string; assignedAgentId?: string | null; internalNote?: string }) {
    if (!selectedId) return false;
    setSavingAction(true);
    setError("");
    try {
      const response = await fetch(`/api/support/admin/conversations/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const result = await response.json() as { conversation?: Conversation; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Conversation-ka lama cusboonaysiin.");
      setNotice(input.internalNote ? "Internal note waa la kaydiyey." : "Conversation-ka waa la cusboonaysiiyey.");
      setNoteDraft("");
      await Promise.all([loadInbox(), loadMessages(selectedId)]);
      return true;
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Conversation-ka lama cusboonaysiin.");
      return false;
    } finally {
      setSavingAction(false);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedConversation || sending || (!draft.trim() && !attachment && !templateName)) return;
    if (templateName && attachment) {
      setError("Template iyo attachment isku mar lama diri karo.");
      return;
    }
    setSending(true);
    setError("");
    setNotice("");
    try {
      const idempotencyKey = crypto.randomUUID();
      const requestHeaders = new Headers();
      let requestBody: BodyInit;
      if (attachment || templateName) {
        const formData = new FormData();
        formData.set("body", draft);
        formData.set("idempotencyKey", idempotencyKey);
        if (templateName) {
          formData.set("templateName", selectedTemplate?.name ?? "");
          formData.set("templateLanguage", selectedTemplate?.language ?? "");
          formData.set("templateParameters", JSON.stringify(
            templateParameters.split(/\r?\n/).map((value) => value.trim()).filter(Boolean),
          ));
        }
        if (attachment) formData.set("file", attachment);
        requestBody = formData;
      } else {
        requestHeaders.set("Content-Type", "application/json");
        requestBody = JSON.stringify({ body: draft, idempotencyKey });
      }
      const response = await fetch(`/api/support/conversations/${selectedConversation.id}/messages`, {
        method: "POST",
        headers: requestHeaders,
        body: requestBody,
      });
      const result = await response.json() as { message?: Message; error?: string };
      if (!response.ok || !result.message) throw new Error(result.error ?? "Fariinta lama dirin.");
      setMessages((current) => [...current, result.message!]);
      setDraft("");
      setAttachment(null);
      setTemplateName("");
      setTemplateParameters("");
      setNotice("Fariinta waa la diray.");
      await loadInbox();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Fariinta lama dirin.");
      await loadMessages(selectedConversation.id);
    } finally {
      setSending(false);
    }
  }

  const loadConfig = useCallback(async () => {
    setConfigLoading(true);
    setConfigError("");
    try {
      const response = await fetch("/api/support/admin/settings", { cache: "no-store" });
      const result = await response.json() as { settings?: SafeWhatsAppSettings; error?: string };
      if (!response.ok || !result.settings) throw new Error(result.error ?? "WhatsApp settings lama soo qaadi karin.");
      setConfig(result.settings);
      setSupportHoursText(JSON.stringify(result.settings.supportHours, null, 2));
      setTemplatesText(result.settings.approvedTemplates
        .map((template) => `${template.name}|${template.language}|${template.parameters ?? 0}`)
        .join("\n"));
    } catch (loadError) {
      setConfigError(loadError instanceof Error ? loadError.message : "WhatsApp settings lama soo qaadi karin.");
    } finally {
      setConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    if (role !== "platform_administrator") return;
    const timer = window.setTimeout(() => void loadConfig(), 0);
    return () => window.clearTimeout(timer);
  }, [loadConfig, role]);

  useEffect(() => {
    let active = true;
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.getRegistration("/")
      .then((registration) => registration?.pushManager.getSubscription())
      .then((subscription) => { if (active) setPushEnabled(Boolean(subscription)); })
      .catch((pushError: unknown) => console.error("Could not check support-agent push state:", pushError));
    return () => { active = false; };
  }, []);

  async function togglePush() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setError("Browser-kan ma taageero browser push notifications.");
      return;
    }
    setPushBusy(true);
    setError("");
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      const current = await registration.pushManager.getSubscription();
      if (pushEnabled && current) {
        const response = await fetch("/api/admin/push-subscriptions", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: current.endpoint }),
        });
        const result = await response.json() as { error?: string };
        if (!response.ok) throw new Error(result.error ?? "Ogeysiisyada lama damin.");
        await current.unsubscribe();
        setPushEnabled(false);
        setNotice("Browser push notifications waa la damiyey.");
      } else {
        const settingsResponse = await fetch("/api/admin/push-subscriptions", { cache: "no-store" });
        const settings = await settingsResponse.json() as { publicKey?: string | null; configured?: boolean; error?: string };
        if (!settingsResponse.ok || !settings.configured || !settings.publicKey) {
          throw new Error(settings.error ?? "Web Push VAPID keys lama dejin server-ka.");
        }
        const permission = await Notification.requestPermission();
        if (permission !== "granted") throw new Error("Oggolaanshaha browser notifications lama siin.");
        const subscription = current ?? await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodePublicKey(settings.publicKey),
        });
        const response = await fetch("/api/admin/push-subscriptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: subscription.toJSON() }),
        });
        const result = await response.json() as { error?: string };
        if (!response.ok) throw new Error(result.error ?? "Ogeysiisyada lama kaydin.");
        setPushEnabled(true);
        setNotice("Browser push notifications waa la hawlgeliyey.");
      }
    } catch (pushError) {
      setError(pushError instanceof Error ? pushError.message : "Push notifications lama hawlgelin.");
    } finally {
      setPushBusy(false);
    }
  }

  async function logout() {
    const { error: signOutError } = await createSupabaseClient("admin").auth.signOut();
    if (signOutError) {
      setError(`Ka bixiddu way fashilantay: ${signOutError.message}`);
      return;
    }
    window.location.replace("/admin/login");
  }

  async function saveConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!config) return;
    setConfigSaving(true);
    setConfigError("");
    setConfigNotice("");
    try {
      let supportHours: Record<string, unknown>;
      try {
        const parsed: unknown = JSON.parse(supportHoursText);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("Support hours-ku waa inay noqdaan JSON object.");
        }
        supportHours = parsed as Record<string, unknown>;
      } catch (parseError) {
        throw new Error(parseError instanceof Error ? parseError.message : "Support hours JSON sax ma aha.");
      }
      const approvedTemplates = templatesText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
        const [name, language, count = "0"] = line.split("|").map((part) => part.trim());
        const parameters = Number(count);
        if (!name || !language || !Number.isInteger(parameters) || parameters < 0 || parameters > 20) {
          throw new Error("Template kasta geli qaabkan: name|language|parameter-count.");
        }
        return { name, language, parameters };
      });
      const formData = new FormData(event.currentTarget);
      const response = await fetch("/api/support/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessPhoneNumber: formData.get("businessPhoneNumber"),
          businessAccountId: formData.get("businessAccountId"),
          phoneNumberId: formData.get("phoneNumberId"),
          displayName: formData.get("displayName"),
          graphApiVersion: formData.get("graphApiVersion"),
          supportAvailable: formData.get("supportAvailable") === "on",
          welcomeMessage: formData.get("welcomeMessage"),
          supportHours,
          approvedTemplates,
          accessToken: secretValues.accessToken,
          appSecret: secretValues.appSecret,
          verifyToken: secretValues.verifyToken,
        }),
      });
      const result = await response.json() as { settings?: SafeWhatsAppSettings; error?: string };
      if (!response.ok || !result.settings) throw new Error(result.error ?? "WhatsApp settings lama kaydin.");
      setConfig(result.settings);
      setSecretValues({ accessToken: "", appSecret: "", verifyToken: "" });
      setConfigNotice("WhatsApp settings waa la kaydiyey. Credentials-ka server-ka ayaa loo xafiday si ammaan ah.");
      await loadInbox();
    } catch (saveError) {
      setConfigError(saveError instanceof Error ? saveError.message : "WhatsApp settings lama kaydin.");
    } finally {
      setConfigSaving(false);
    }
  }

  const showSettings = role === "platform_administrator" && view === "settings";

  return (
    <main className="support-admin-shell">
      <header className="support-admin-topbar">
        <Link className="support-admin-brand" href="/admin/dashboard"><span>V</span> VELTO <i>/</i> WhatsApp Support Center</Link>
        <div className="support-admin-top-actions">
          <span className="support-admin-role">{role.replaceAll("_", " ")}</span>
          <button className="button button-outline button-small" disabled={pushBusy} onClick={() => void togglePush()} type="button">
            {pushBusy ? "Sug…" : pushEnabled ? "Dami ogeysiisyada" : "Hawl geli ogeysiisyada"}
          </button>
          {role === "platform_administrator" && <Link className="button button-outline button-small" href="/admin/dashboard">Admin Portal</Link>}
          <button className="button button-outline button-small" onClick={() => void logout()} type="button">Ka bax</button>
        </div>
      </header>
      <div className="support-admin-heading">
        <div>
          <div className="page-eyebrow">CUSTOMER CARE</div>
          <h1>WhatsApp Support Center</h1>
          <p>Maamul wada sheekaysiyada WhatsApp-ka rasmiga ah iyo live chat-ka business workspace-yada.</p>
        </div>
        <div className="support-admin-summary"><strong>{unreadTotal}</strong><span>fariin cusub</span></div>
      </div>

      {role === "platform_administrator" && (
        <div className="support-admin-tabs">
          <button className={!showSettings ? "is-active" : ""} onClick={() => { setView("inbox"); window.history.replaceState(null, "", "/admin/whatsapp-support"); void loadInbox(); }} type="button">Support Inbox</button>
          <button className={showSettings ? "is-active" : ""} onClick={() => { setView("settings"); window.history.replaceState(null, "", "/admin/whatsapp-support?tab=settings"); void loadConfig(); }} type="button">WhatsApp Settings</button>
        </div>
      )}

      {error && <p className="support-alert support-alert-error" role="alert">{error}</p>}
      {notice && <p className="support-alert support-alert-success" role="status">{notice}</p>}
      {showSettings ? (
        <WhatsAppSettingsPanel
          config={config}
          configError={configError}
          configLoading={configLoading}
          configNotice={configNotice}
          configSaving={configSaving}
          onSave={saveConfig}
          onSecretChange={(field, value) => setSecretValues((current) => ({ ...current, [field]: value }))}
          onSupportHoursChange={setSupportHoursText}
          onTemplatesChange={setTemplatesText}
          onRefresh={() => void loadConfig()}
          secretValues={secretValues}
          supportHoursText={supportHoursText}
          templatesText={templatesText}
        />
      ) : (
        <>
          <div className="support-admin-workspace">
            <section className="support-admin-list-column">
              <div className="support-inbox-tabs">
                {inboxTabs.map((item) => {
                  const unread = item.id === "new" ? conversations.filter((conversation) => conversation.unread_admin_count > 0).length : 0;
                  return (
                    <button className={tab === item.id ? "is-active" : ""} key={item.id} onClick={() => setTab(item.id)} type="button">
                      <span>{item.label}</span>
                      {unread > 0 && <small>{unread}</small>}
                    </button>
                  );
                })}
              </div>
              <div className="support-inbox-filters">
                <input aria-label="Search conversations" onChange={(event) => setSearch(event.target.value)} placeholder="Business, phone, conversation ID" value={search} />
                <div><label>From <input aria-label="From date" onChange={(event) => setDateFrom(event.target.value)} type="date" value={dateFrom} /></label>
                  <label>To <input aria-label="To date" onChange={(event) => setDateTo(event.target.value)} type="date" value={dateTo} /></label></div>
              </div>
              <div className="support-admin-conversation-list" aria-live="polite">
                {loading ? <div className="support-empty">Inbox-ka waa la soo rarayaa…</div> : conversations.length ? conversations.map((conversation) => (
                  <button
                    className={`support-admin-conversation${selectedId === conversation.id ? " is-active" : ""}`}
                    key={conversation.id}
                    onClick={() => setSelectedId(conversation.id)}
                    type="button"
                  >
                    <span className="support-admin-conversation-avatar">{conversation.business_name.slice(0, 1).toUpperCase()}</span>
                    <span className="support-admin-conversation-body">
                      <strong>{conversation.business_name}</strong>
                      <span>{conversation.latestMessage?.body || conversation.subject}</span>
                      <small>{conversation.channel === "whatsapp" ? "WhatsApp" : "Workspace chat"} · {dateTime(conversation.last_message_at)}</small>
                    </span>
                    <span className={`support-status-badge support-status-${conversation.status}`}>{statusLabel(conversation.status)}</span>
                    {conversation.unread_admin_count > 0 && <b className="support-unread-count">{conversation.unread_admin_count}</b>}
                  </button>
                )) : <div className="support-empty">Conversation ma jiro filter-kan.</div>}
              </div>
            </section>

            <section className="support-admin-chat-column">
              {selectedConversation ? (
                <>
                  <header className="support-admin-chat-header">
                    <div className="support-admin-conversation-avatar">{selectedConversation.business_name.slice(0, 1).toUpperCase()}</div>
                    <div><strong>{selectedConversation.business_name}</strong><span>{selectedConversation.channel === "whatsapp" ? "Official WhatsApp conversation" : "Business workspace live chat"}</span></div>
                    <span className={`support-status-badge support-status-${selectedConversation.status}`}>{statusLabel(selectedConversation.status)}</span>
                  </header>
                  <div className="support-admin-message-list" aria-live="polite">
                    {messagesLoading && !messages.length && <div className="support-empty">Fariimaha waa la soo rarayaa…</div>}
                    {messages.map((message) => (
                      <article className={`support-message support-message-${message.sender_type}`} key={message.id}>
                        <div className="support-message-bubble">
                          {message.body && <p>{message.body}</p>}
                          {message.attachments.map((file) => file.mimeType.startsWith("image/") ? (
                            <a className="support-image-attachment" href={file.url} key={file.id} rel="noreferrer" target="_blank">
                              <img alt={file.fileName} src={file.url} /><span>{file.fileName}</span>
                            </a>
                          ) : <a className="support-file-attachment" href={file.url} key={file.id} rel="noreferrer" target="_blank">{file.fileName}</a>)}
                          <footer><time>{dateTime(message.created_at)}</time><span>{statusLabel(message.delivery_status)}</span></footer>
                        </div>
                      </article>
                    ))}
                    {!messages.length && !messagesLoading && <div className="support-chat-welcome"><strong>Conversation cusub</strong><p>Ku soo dir jawaabtaada business-kan.</p></div>}
                  </div>
                  <form className="support-admin-composer" onSubmit={(event) => void sendMessage(event)}>
                    {selectedConversation.channel === "whatsapp" && (
                      <div className="support-template-controls">
                        <select aria-label="Approved WhatsApp template" onChange={(event) => setTemplateName(event.target.value)} value={templateName}>
                          <option value="">Text / media message</option>
                          {(whatsapp?.approvedTemplates ?? []).map((template) => <option key={`${template.name}:${template.language}`} value={`${template.name}|${template.language}`}>{template.name} · {template.language}</option>)}
                        </select>
                        {selectedTemplate && (selectedTemplate.parameters ?? 0) > 0 && (
                          <textarea
                            aria-label="Template parameters"
                            onChange={(event) => setTemplateParameters(event.target.value)}
                            placeholder={`Geli ${selectedTemplate.parameters ?? 0} template value, midkiiba sadar cusub`}
                            rows={2}
                            value={templateParameters}
                          />
                        )}
                      </div>
                    )}
                    {attachment && <div className="support-selected-file"><span>{attachment.name}</span><button aria-label="Ka saar faylka" onClick={() => setAttachment(null)} type="button">×</button></div>}
                    <div className="support-composer-row">
                      <label className="support-attach-button" title="Ku dar attachment">
                        <input accept="image/jpeg,image/png,image/webp,application/pdf,text/plain,text/csv" disabled={sending || Boolean(templateName)} onChange={(event) => setAttachment(event.target.files?.[0] ?? null)} type="file" />
                        <span aria-hidden="true">＋</span>
                      </label>
                      <textarea
                        aria-label="Reply message"
                        maxLength={4096}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            event.currentTarget.form?.requestSubmit();
                          }
                        }}
                        placeholder={selectedConversation.channel === "whatsapp" ? "Qor WhatsApp reply…" : "Qor jawaabta live chat-ka…"}
                        value={draft}
                      />
                      <button className="support-send-button" disabled={sending || (!draft.trim() && !attachment && !templateName)} type="submit">{sending ? "…" : "Dir"}</button>
                    </div>
                    {selectedConversation.channel === "whatsapp" && (
                      <small className="support-whatsapp-disclaimer">
                        WhatsApp replies waxaa laga diraa Cloud API-ga rasmiga ah. 24-saac ka dib, Meta waxay u baahan kartaa approved template.
                      </small>
                    )}
                  </form>
                </>
              ) : (
                <div className="support-chat-welcome"><span className="support-empty-icon">V</span><strong>Dooro conversation</strong><p>Wadahadal ayaa halkan ka muuqan doona markaad doorato.</p></div>
              )}
            </section>

            <aside className="support-admin-details-column">
              {selectedConversation ? (
                <>
                  <section className="support-business-information">
                    <div className="support-detail-avatar">{selectedConversation.business_name.slice(0, 1).toUpperCase()}</div>
                    <h2>{selectedConversation.business_name}</h2>
                    <p>{selectedConversation.channel === "whatsapp" ? "WhatsApp" : "Business workspace"}</p>
                    <Detail label="Business ID" value={selectedConversation.business_id} />
                    <Detail label="Account owner" value={selectedConversation.account_owner || "—"} />
                    <Detail label="Phone" value={selectedConversation.contact_phone || selectedConversation.whatsapp_contact_id || "—"} />
                    <Detail label="Registered email" value={selectedConversation.registered_email || "—"} />
                    <Detail label="Subscription plan" value={selectedConversation.subscription_plan || "Unknown"} />
                    <Detail label="Conversation ID" value={selectedConversation.id} />
                    <Detail label="Created" value={dateTime(selectedConversation.created_at)} />
                  </section>
                  <section className="support-detail-controls">
                    <label>Conversation status
                      <select disabled={savingAction} onChange={(event) => void updateConversation({ status: event.target.value })} value={selectedConversation.status}>
                        {["open", "pending", "resolved", "archived"].map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
                      </select>
                    </label>
                    <label>Assigned support agent
                      <select disabled={savingAction} onChange={(event) => void updateConversation({ assignedAgentId: event.target.value || null })} value={selectedConversation.assigned_agent_id ?? ""}>
                        <option value="">Unassigned</option>
                        {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.label}</option>)}
                      </select>
                    </label>
                  </section>
                  <section className="support-notes-panel">
                    <div><h3>Internal notes</h3><span>Business users ma arkaan</span></div>
                    <div className="support-notes-list">
                      {notes.map((note) => <article key={note.id}><p>{note.body}</p><small>{note.agent_id?.slice(0, 8) ?? "Agent"} · {dateTime(note.created_at)}</small></article>)}
                      {!notes.length && <small>Weli internal note ma jiro.</small>}
                    </div>
                    <textarea aria-label="Add internal note" maxLength={5000} onChange={(event) => setNoteDraft(event.target.value)} placeholder="Qor note gaar u ah support team-ka…" value={noteDraft} />
                    <button className="button button-outline button-small" disabled={savingAction || !noteDraft.trim()} onClick={() => void updateConversation({ internalNote: noteDraft })} type="button">
                      {savingAction ? "Kaydinaya…" : "Ku dar note"}
                    </button>
                  </section>
                </>
              ) : <div className="support-empty">Faahfaahinta business-ka waxay muuqan doontaa marka conversation la doorto.</div>}
            </aside>
          </div>
          <footer className="support-admin-footer">
            <span>{whatsapp?.businessPhoneNumber ? `WhatsApp Business: ${whatsapp.businessPhoneNumber}` : "WhatsApp Business phone number lama dejin."}</span>
            <span>Webhook: <code>/api/webhooks/whatsapp</code></span>
          </footer>
        </>
      )}
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="support-business-detail"><span>{label}</span><strong>{value}</strong></div>;
}

function WhatsAppSettingsPanel({
  config,
  configError,
  configLoading,
  configNotice,
  configSaving,
  onSave,
  onSecretChange,
  onSupportHoursChange,
  onTemplatesChange,
  onRefresh,
  secretValues,
  supportHoursText,
  templatesText,
}: {
  config: SafeWhatsAppSettings | null;
  configError: string;
  configLoading: boolean;
  configNotice: string;
  configSaving: boolean;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onSecretChange: (field: "accessToken" | "appSecret" | "verifyToken", value: string) => void;
  onSupportHoursChange: (value: string) => void;
  onTemplatesChange: (value: string) => void;
  onRefresh: () => void;
  secretValues: { accessToken: string; appSecret: string; verifyToken: string };
  supportHoursText: string;
  templatesText: string;
}) {
  return (
    <section className="support-settings-panel">
      <header>
        <div><div className="page-eyebrow">SUPER ADMIN SETTINGS</div><h2>WhatsApp Business configuration</h2><p>Credentials-ka waxa lagu kaydiyaa database-ka iyagoo AES-256-GCM lagu siray; browser-ka looma soo celiyo.</p></div>
        <button className="button button-outline button-small" onClick={onRefresh} type="button">Dib u soo rar</button>
      </header>
      {configError && <p className="support-alert support-alert-error" role="alert">{configError}</p>}
      {configNotice && <p className="support-alert support-alert-success" role="status">{configNotice}</p>}
      {configLoading || !config ? <div className="support-empty">Settings-ka waa la soo rarayaa…</div> : (
        <>
          {!config.encryptionReady && <p className="support-alert support-alert-error">SUPPORT_CONFIG_ENCRYPTION_KEY lama dejin server-ka. Ku dar 32-byte key ka hor intaadan kaydin Meta credentials.</p>}
          <form className="support-settings-form" onSubmit={onSave}>
            <div className="support-settings-grid">
              <label>WhatsApp Business phone number<input defaultValue={config.businessPhoneNumber} name="businessPhoneNumber" placeholder="+252..." /></label>
              <label>Business display name<input defaultValue={config.displayName} name="displayName" required /></label>
              <label>WhatsApp Business Account ID<input defaultValue={config.businessAccountId} name="businessAccountId" /></label>
              <label>Phone Number ID<input defaultValue={config.phoneNumberId} name="phoneNumberId" /></label>
              <label>Meta Graph API version<input defaultValue={config.graphApiVersion} name="graphApiVersion" placeholder="vNN.N" /></label>
              <label className="support-setting-toggle"><input defaultChecked={config.supportAvailable} name="supportAvailable" type="checkbox" /><span>Support is available</span></label>
            </div>
            <label>Secure access token
              <input autoComplete="new-password" onChange={(event) => onSecretChange("accessToken", event.target.value)} placeholder={config.hasAccessToken ? "Stored securely; leave blank to keep current" : "Enter Meta access token"} type="password" value={secretValues.accessToken} />
            </label>
            <label>Meta App Secret
              <input autoComplete="new-password" onChange={(event) => onSecretChange("appSecret", event.target.value)} placeholder={config.hasAppSecret ? "Stored securely; leave blank to keep current" : "Enter Meta app secret"} type="password" value={secretValues.appSecret} />
            </label>
            <label>Webhook verify token
              <input autoComplete="new-password" onChange={(event) => onSecretChange("verifyToken", event.target.value)} placeholder={config.hasVerifyToken ? "Stored securely; leave blank to keep current" : "Choose a private verify token"} type="password" value={secretValues.verifyToken} />
            </label>
            <label>Automatic welcome message<textarea defaultValue={config.welcomeMessage} maxLength={1000} name="welcomeMessage" rows={3} /></label>
            <label>Business support hours (JSON)<small>Optional: {"{ \"timezone\": \"Africa/Mogadishu\", \"monday\": { \"start\": \"09:00\", \"end\": \"17:00\" } }"}</small><textarea onChange={(event) => onSupportHoursChange(event.target.value)} rows={4} value={supportHoursText} /></label>
            <label>Approved templates <small>One per line: template_name|language|body-parameter-count</small><textarea onChange={(event) => onTemplatesChange(event.target.value)} placeholder={"welcome_en|en_US|0\nsupport_update|en_US|2"} rows={4} value={templatesText} /></label>
            <div className="support-webhook-config">
              <strong>Webhook callback URL</strong>
              <code>{typeof window === "undefined" ? "/api/webhooks/whatsapp" : `${window.location.origin}/api/webhooks/whatsapp`}</code>
              <span>Ku dar URL-kan Meta App → WhatsApp → Configuration; xaqiijinta signature-ka waa la hubiyaa server-ka.</span>
            </div>
            <div className="support-config-status">
              <span>{config.hasAccessToken ? "✓ Access token saved" : "• Access token not configured"}</span>
              <span>{config.hasAppSecret ? "✓ App secret saved" : "• App secret not configured"}</span>
              <span>{config.hasVerifyToken ? "✓ Verify token saved" : "• Verify token not configured"}</span>
            </div>
            <footer><span>Credentials-ka cusub waxay beddelayaan kuwa jira; meel bannaan waxay ilaalinaysaa credential-kii hore.</span><button className="button button-dark" disabled={configSaving} type="submit">{configSaving ? "Kaydinaya…" : "Kaydi WhatsApp settings"}</button></footer>
          </form>
        </>
      )}
    </section>
  );
}

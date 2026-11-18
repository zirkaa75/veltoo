"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";

type Conversation = {
  id: string;
  channel: "workspace" | "whatsapp";
  status: string;
  subject: string;
  unread_business_count: number;
  updated_at: string;
  latestMessage: { body: string; created_at: string } | null;
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
type WhatsAppInfo = {
  businessPhoneNumber: string;
  displayName: string;
  supportAvailable: boolean;
  welcomeMessage: string;
  supportHours: Record<string, unknown>;
};

function decodePublicKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

function dateTime(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleString();
}

function statusLabel(status: string) {
  return ({
    open: "Furan",
    pending: "Sugaya",
    resolved: "La xaliyey",
    archived: "La kaydiyey",
  } as Record<string, string>)[status] ?? status;
}

function supportIsAvailable(settings: WhatsAppInfo | null) {
  if (!settings?.supportAvailable) return false;
  const hours = settings.supportHours;
  const timezone = typeof hours.timezone === "string" ? hours.timezone : undefined;
  let dayParts: Intl.DateTimeFormatPart[];
  try {
    dayParts = new Intl.DateTimeFormat("en-US", {
      ...(timezone ? { timeZone: timezone } : {}),
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date());
  } catch {
    return settings.supportAvailable;
  }
  const day = dayParts.find((part) => part.type === "weekday")?.value.toLowerCase();
  const dayHours = day ? hours[day] : undefined;
  if (!dayHours || typeof dayHours !== "object" || Array.isArray(dayHours)) return true;
  const schedule = dayHours as { start?: unknown; end?: unknown };
  if (typeof schedule.start !== "string" || typeof schedule.end !== "string") return false;
  const start = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(schedule.start);
  const end = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(schedule.end);
  if (!start || !end) return false;
  const currentMinutes = Number(dayParts.find((part) => part.type === "hour")?.value) * 60
    + Number(dayParts.find((part) => part.type === "minute")?.value);
  const startMinutes = Number(start[1]) * 60 + Number(start[2]);
  const endMinutes = Number(end[1]) * 60 + Number(end[2]);
  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

export default function WhatsAppSupportWorkspace({
  businessId,
  businessName,
}: {
  businessId: string;
  businessName: string;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [whatsapp, setWhatsApp] = useState<WhatsAppInfo | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedId) ?? null,
    [conversations, selectedId],
  );
  const supportAvailable = supportIsAvailable(whatsapp);
  const phone = whatsapp?.businessPhoneNumber.replace(/\D/g, "") ?? "";
  const directWhatsAppUrl = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(`Asc VELTO Support, ${businessName}. ${whatsapp?.welcomeMessage ?? ""}`)}`
    : "";

  const loadConversations = useCallback(async () => {
    try {
      const response = await fetch(`/api/support/business/${businessId}/conversations`, { cache: "no-store" });
      const result = await response.json() as { conversations?: Conversation[]; whatsapp?: WhatsAppInfo; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Conversations-ka support lama soo qaadi karin.");
      const items = result.conversations ?? [];
      setConversations(items);
      setWhatsApp(result.whatsapp ?? null);
      setSelectedId((current) => {
        if (current && items.some((item) => item.id === current)) return current;
        const requested = new URLSearchParams(window.location.search).get("conversation");
        return (requested && items.some((item) => item.id === requested) ? requested : items[0]?.id) ?? "";
      });
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Conversations-ka lama soo qaadi karin.");
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  const loadMessages = useCallback(async (conversationId: string) => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    try {
      const response = await fetch(`/api/support/conversations/${conversationId}/messages`, { cache: "no-store" });
      const result = await response.json() as { messages?: Message[]; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Fariimaha lama soo qaadi karin.");
      setMessages(result.messages ?? []);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Fariimaha lama soo qaadi karin.");
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    const firstLoad = window.setTimeout(() => void loadConversations(), 0);
    const timer = window.setInterval(() => void loadConversations(), 10_000);
    return () => {
      window.clearTimeout(firstLoad);
      window.clearInterval(timer);
    };
  }, [loadConversations]);

  useEffect(() => {
    if (!selectedId) return;
    const firstLoad = window.setTimeout(() => void loadMessages(selectedId), 0);
    const timer = window.setInterval(() => void loadMessages(selectedId), 5_000);
    const supabase = createSupabaseClient("business");
    const channel = supabase.channel(`business-support-${selectedId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "support_messages",
        filter: `conversation_id=eq.${selectedId}`,
      }, () => {
        void loadMessages(selectedId);
        void loadConversations();
      })
      .subscribe();
    return () => {
      window.clearTimeout(firstLoad);
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [loadConversations, loadMessages, selectedId]);

  useEffect(() => {
    let active = true;
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.getRegistration("/")
      .then((registration) => registration?.pushManager.getSubscription())
      .then((subscription) => { if (active) setPushEnabled(Boolean(subscription)); })
      .catch((pushError: unknown) => console.error("Could not check business support push state:", pushError));
    return () => { active = false; };
  }, []);

  async function startConversation() {
    setError("");
    try {
      const response = await fetch(`/api/support/business/${businessId}/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: "VELTO Support" }),
      });
      const result = await response.json() as { conversation?: Conversation; error?: string };
      if (!response.ok || !result.conversation) throw new Error(result.error ?? "Conversation cusub lama abuuri karin.");
      setConversations((current) => [result.conversation!, ...current]);
      setSelectedId(result.conversation.id);
      setMessages([]);
      setNotice("Conversation cusub ayaa la furay. Qor fariintaada.");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Conversation cusub lama abuuri karin.");
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedConversation || sending || (!draft.trim() && !attachment)) return;
    setSending(true);
    setError("");
    try {
      const idempotencyKey = crypto.randomUUID();
      const headers = new Headers();
      let body: BodyInit;
      if (attachment) {
        const formData = new FormData();
        formData.set("body", draft);
        formData.set("idempotencyKey", idempotencyKey);
        formData.set("file", attachment);
        body = formData;
      } else {
        headers.set("Content-Type", "application/json");
        body = JSON.stringify({ body: draft, idempotencyKey });
      }
      const response = await fetch(`/api/support/conversations/${selectedConversation.id}/messages`, {
        method: "POST",
        headers,
        body,
      });
      const result = await response.json() as { message?: Message; error?: string };
      if (!response.ok || !result.message) throw new Error(result.error ?? "Fariinta lama dirin.");
      setMessages((current) => [...current, result.message!]);
      setDraft("");
      setAttachment(null);
      setNotice("Fariintaada waa la diray.");
      await loadConversations();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Fariinta lama dirin.");
    } finally {
      setSending(false);
    }
  }

  async function togglePush() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setError("Browser-kan ma taageero push notifications.");
      return;
    }
    setPushBusy(true);
    setError("");
    try {
      const endpoint = `/api/support/business/${businessId}/push-subscriptions`;
      const registration = await navigator.serviceWorker.register("/sw.js");
      const current = await registration.pushManager.getSubscription();
      if (pushEnabled && current) {
        const response = await fetch(endpoint, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: current.endpoint }),
        });
        const result = await response.json() as { error?: string };
        if (!response.ok) throw new Error(result.error ?? "Push notifications lama damin.");
        await current.unsubscribe();
        setPushEnabled(false);
        setNotice("Browser notifications waa la damiyey.");
      } else {
        const settingsResponse = await fetch(endpoint, { cache: "no-store" });
        const settings = await settingsResponse.json() as { configured?: boolean; publicKey?: string | null; error?: string };
        if (!settingsResponse.ok || !settings.configured || !settings.publicKey) {
          throw new Error(settings.error ?? "Web Push VAPID keys lama dejin server-ka.");
        }
        const permission = await Notification.requestPermission();
        if (permission !== "granted") throw new Error("Oggolaanshaha browser notifications lama siin.");
        const subscription = current ?? await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodePublicKey(settings.publicKey),
        });
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: subscription.toJSON() }),
        });
        const result = await response.json() as { error?: string };
        if (!response.ok) throw new Error(result.error ?? "Push subscription lama kaydin.");
        setPushEnabled(true);
        setNotice("Browser notifications waa la hawlgeliyey.");
      }
    } catch (pushError) {
      setError(pushError instanceof Error ? pushError.message : "Push notifications lama hawlgelin.");
    } finally {
      setPushBusy(false);
    }
  }

  return (
    <div className="business-content support-workspace-content">
      <header className="support-page-heading">
        <div>
          <div className="page-eyebrow">VELTO CUSTOMER CARE</div>
          <h1>WhatsApp Support</h1>
          <p>La xiriir kooxda VELTO, eeg wada sheekaysiyadii hore, kana hel jawaabaha support-ka.</p>
        </div>
        <button className="button button-outline" disabled={pushBusy} onClick={() => void togglePush()} type="button">
          {pushBusy ? "Sug..." : pushEnabled ? "Dami ogeysiisyada" : "Hawl geli ogeysiisyada"}
        </button>
      </header>

      {error && <p className="support-alert support-alert-error" role="alert">{error}</p>}
      {notice && <p className="support-alert support-alert-success" role="status">{notice}</p>}

      <section className="support-workspace-layout">
        <aside className="support-conversation-panel">
          <div className="support-list-heading">
            <div><h2>Wadahadalladaada</h2><span>{conversations.length} conversation</span></div>
            <button aria-label="Bilow conversation cusub" className="support-new-conversation" onClick={() => void startConversation()} type="button">+</button>
          </div>
          {loading ? <div className="support-empty">Wadahadallada waa la soo rarayaa…</div> : conversations.length ? (
            <div className="support-conversation-list">
              {conversations.map((conversation) => (
                <button
                  aria-current={selectedId === conversation.id ? "true" : undefined}
                  className={`support-conversation-item${selectedId === conversation.id ? " is-active" : ""}`}
                  key={conversation.id}
                  onClick={() => setSelectedId(conversation.id)}
                  type="button"
                >
                  <span className="support-conversation-avatar">V</span>
                  <span className="support-conversation-preview">
                    <strong>{conversation.subject || (conversation.channel === "whatsapp" ? "WhatsApp Support" : "VELTO Support")}</strong>
                    <small>{conversation.latestMessage?.body || "Conversation cusub"}</small>
                    <small>{statusLabel(conversation.status)} · {dateTime(conversation.updated_at)}</small>
                  </span>
                  {conversation.unread_business_count > 0 && <span className="support-unread-count">{conversation.unread_business_count}</span>}
                </button>
              ))}
            </div>
          ) : (
            <div className="support-empty">
              <span className="support-empty-icon">WA</span>
              <strong>Wadahadal weli ma jiro</strong>
              <span>Bilow conversation si aad ula xiriirto kooxda support-ka.</span>
              <button className="button button-dark" onClick={() => void startConversation()} type="button">Bilow conversation</button>
            </div>
          )}
          {directWhatsAppUrl ? (
            <a className="support-direct-link" href={directWhatsAppUrl} rel="noreferrer" target="_blank">
              <span className="support-whatsapp-mark">WA</span>
              <span><strong>WhatsApp toos ah fur</strong><small>{whatsapp?.businessPhoneNumber}</small></span>
              <span aria-hidden="true">↗</span>
            </a>
          ) : (
            <div className="support-direct-unavailable">WhatsApp Cloud API weli lama dejin. In-app chat-ku wuu shaqayn karaa.</div>
          )}
        </aside>

        <section className="support-chat-panel" aria-label="Support conversation">
          {selectedConversation ? (
            <>
              <header className="support-chat-header">
                <span className="support-conversation-avatar">V</span>
                <div>
                  <strong>{whatsapp?.displayName || "VELTO Support"}</strong>
                  <span className={supportAvailable ? "support-online" : "support-offline"}>
                    <i /> {supportAvailable ? "Support waa diyaar" : "Saacadaha support-ka way xiran yihiin"}
                  </span>
                </div>
                <span className={`support-status-badge support-status-${selectedConversation.status}`}>{statusLabel(selectedConversation.status)}</span>
              </header>
              <div className="support-message-list" aria-live="polite">
                {messagesLoading && messages.length === 0 && <div className="support-empty">Fariimaha waa la soo rarayaa…</div>}
                {!messages.length && !messagesLoading && (
                  <div className="support-chat-welcome">
                    <span className="support-empty-icon">WA</span>
                    <strong>Ku soo dhowow {whatsapp?.displayName || "VELTO Support"}</strong>
                    <p>{whatsapp?.welcomeMessage || "Qor fariintaada, kooxda support-kuna way kula soo xiriiri doontaa."}</p>
                  </div>
                )}
                {messages.map((message) => (
                  <article className={`support-message support-message-${message.sender_type}`} key={message.id}>
                    <div className="support-message-bubble">
                      {message.body && <p>{message.body}</p>}
                      {message.attachments.map((file) => file.mimeType.startsWith("image/") ? (
                        <a className="support-image-attachment" href={file.url} key={file.id} rel="noreferrer" target="_blank">
                          <img alt={file.fileName} src={file.url} />
                          <span>{file.fileName}</span>
                        </a>
                      ) : (
                        <a className="support-file-attachment" href={file.url} key={file.id} rel="noreferrer" target="_blank">{file.fileName}</a>
                      ))}
                      <footer><time>{dateTime(message.created_at)}</time>{message.sender_type === "business" && <span>{message.delivery_status}</span>}</footer>
                    </div>
                  </article>
                ))}
              </div>
              {selectedConversation.channel === "whatsapp" ? (
                <div className="support-chat-hint">
                  Conversation-kan wuxuu ku socdaa WhatsApp. Si aad fariin uga dirto taleefankaaga, isticmaal xiriirka WhatsApp tooska ah ee dhinaca bidix.
                </div>
              ) : (
                <form className="support-composer" onSubmit={(event) => void sendMessage(event)}>
                  {attachment && (
                    <div className="support-selected-file">
                      <span>{attachment.name} · {(attachment.size / 1024 / 1024).toFixed(2)} MB</span>
                      <button aria-label="Ka saar faylka" onClick={() => setAttachment(null)} type="button">×</button>
                    </div>
                  )}
                  <label className="support-attach-button" title="Ku dar fayl">
                    <input
                      accept="image/jpeg,image/png,image/webp,application/pdf,text/plain,text/csv"
                      disabled={sending}
                      onChange={(event) => setAttachment(event.target.files?.[0] ?? null)}
                      type="file"
                    />
                    <span aria-hidden="true">＋</span>
                  </label>
                  <textarea
                    aria-label="Qor fariinta support-ka"
                    maxLength={4096}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    placeholder="Qor fariintaada…"
                    value={draft}
                  />
                  <button className="support-send-button" disabled={sending || (!draft.trim() && !attachment)} type="submit">
                    {sending ? "…" : "Dir"}
                  </button>
                </form>
              )}
            </>
          ) : (
            <div className="support-chat-welcome">
              <span className="support-empty-icon">WA</span>
              <strong>VELTO Support</strong>
              <p>Dooro conversation hore ama bilow mid cusub.</p>
              <button className="button button-dark" onClick={() => void startConversation()} type="button">Bilow conversation</button>
            </div>
          )}
        </section>
      </section>
      <p className="support-security-note">Fariimahaagu waxay la xiriiraan ganacsiga {businessName} oo keliya.</p>
    </div>
  );
}

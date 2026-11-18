import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { decryptSupportSecret, getWhatsAppSettings } from "@/lib/support/whatsapp-config";
import {
  getBusinessSubscriptionPlan,
  MAX_SUPPORT_ATTACHMENT_BYTES,
  notifyBusinessSupportMembers,
  notifySupportAgents,
  SUPPORT_ATTACHMENT_MIME_TYPES,
  uploadSupportAttachment,
} from "@/lib/support/service";
import { sendWhatsAppMessage } from "@/lib/support/whatsapp-cloud-api";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPlatformPush } from "@/lib/notifications/web-push";

type WhatsAppMedia = { id?: string; mime_type?: string; filename?: string; caption?: string };
type WhatsAppMessage = {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: WhatsAppMedia;
  document?: WhatsAppMedia;
  video?: WhatsAppMedia;
  audio?: WhatsAppMedia;
};
type WhatsAppStatus = { id?: string; status?: string; timestamp?: string };
type WebhookChange = { value?: { messages?: WhatsAppMessage[]; statuses?: WhatsAppStatus[] } };
type WebhookPayload = { entry?: Array<{ changes?: WebhookChange[] }> };

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function getMedia(message: WhatsAppMessage) {
  if (message.image) return message.image;
  if (message.document) return message.document;
  if (message.video) return message.video;
  if (message.audio) return message.audio;
  return null;
}

async function downloadMedia(
  media: WhatsAppMedia,
  settings: NonNullable<Awaited<ReturnType<typeof getWhatsAppSettings>>>,
) {
  if (!media.id) return null;
  const token = decryptSupportSecret(settings.encrypted_access_token);
  const version = settings.graph_api_version;
  if (!token || !/^v\d+\.\d+$/.test(version)) throw new Error("WhatsApp media credentials are not configured.");

  const metadataResponse = await fetch(
    `https://graph.facebook.com/${version}/${encodeURIComponent(media.id)}`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) },
  );
  if (!metadataResponse.ok) throw new Error(`Could not retrieve WhatsApp media metadata (HTTP ${metadataResponse.status}).`);
  const metadata = await metadataResponse.json() as { url?: string; mime_type?: string; file_size?: number };
  if (typeof metadata.url !== "string") throw new Error("WhatsApp media metadata did not include a download URL.");

  const mediaUrl = new URL(metadata.url);
  if (
    mediaUrl.protocol !== "https:"
    || !["lookaside.fbsbx.com", "graph.facebook.com"].includes(mediaUrl.hostname)
      && !mediaUrl.hostname.endsWith(".fbcdn.net")
  ) {
    throw new Error("WhatsApp returned an unexpected media host.");
  }
  const mimeType = media.mime_type || metadata.mime_type || "application/octet-stream";
  if (!SUPPORT_ATTACHMENT_MIME_TYPES.includes(mimeType as (typeof SUPPORT_ATTACHMENT_MIME_TYPES)[number])) {
    return null;
  }
  if (typeof metadata.file_size === "number" && metadata.file_size > MAX_SUPPORT_ATTACHMENT_BYTES) {
    return null;
  }

  const fileResponse = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!fileResponse.ok || !fileResponse.body) {
    throw new Error(`Could not download WhatsApp media (HTTP ${fileResponse.status}).`);
  }
  const reader = fileResponse.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_SUPPORT_ATTACHMENT_BYTES) {
      await reader.cancel();
      throw new Error("WhatsApp attachment exceeds the 10 MB support limit.");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const fileName = (media.filename || `whatsapp-${media.id}`).replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
  return new File([bytes.buffer], fileName, { type: mimeType });
}

async function saveIncomingMessage(
  admin: ReturnType<typeof createAdminClient>,
  settings: NonNullable<Awaited<ReturnType<typeof getWhatsAppSettings>>>,
  message: WhatsAppMessage,
) {
  if (!message.id || !message.from) throw new Error("Incoming WhatsApp message is missing its ID or sender.");
  const { data: businesses, error: businessError } = await admin.rpc("find_support_business_by_phone", {
    phone_input: message.from,
  });
  if (businessError) throw new Error(`Could not match WhatsApp sender to a business: ${businessError.message}`);
  if (!businesses?.length || businesses.length !== 1) {
    const title = businesses?.length ? "WhatsApp sender business badan ayuu la jaanqaaday" : "WhatsApp message business lama waafajin";
    const body = businesses?.length
      ? `Lambarka ${message.from} wuxuu la jaanqaaday business-yo badan; conversation lama samayn.`
      : `Lama helin business firfircoon oo leh lambarka ${message.from}.`;
    const { error: notificationError } = await admin.from("platform_notifications").insert({
      title,
      message: body,
      event_type: "support_unmatched_whatsapp",
    });
    if (notificationError) console.error("Could not save an unmatched WhatsApp notification:", notificationError.message);
    await sendPlatformPush(title, body, "/admin/whatsapp-support");
    return { matched: false };
  }
  if (businesses.length !== 1) throw new Error("WhatsApp sender matched multiple business accounts.");
  const business = businesses[0];
  const plan = await getBusinessSubscriptionPlan(admin, business.id);
  const { data: conversation, error: conversationError } = await admin.from("support_conversations")
    .upsert({
      business_id: business.id,
      channel: "whatsapp",
      status: "open",
      subject: "WhatsApp Support",
      business_name: business.name,
      account_owner: business.owner_name ?? "",
      contact_phone: business.phone ?? "",
      registered_email: business.owner_email ?? "",
      subscription_plan: plan,
      whatsapp_contact_id: message.from,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "business_id,whatsapp_contact_id" })
    .select("id,business_id,business_name")
    .single();
  if (conversationError || !conversation) {
    throw new Error(`Could not create or reopen WhatsApp support conversation: ${conversationError?.message ?? "No conversation returned."}`);
  }

  const media = getMedia(message);
  const body = message.text?.body?.trim()
    || media?.caption?.trim()
    || (media ? `[WhatsApp ${message.type ?? "media"} attachment]` : `[WhatsApp ${message.type ?? "message"}]`);
  const { data: savedMessage, error: messageError } = await admin.from("support_messages")
    .insert({
      conversation_id: conversation.id,
      sender_type: "business",
      sender_user_id: business.owner_user_id,
      body: body.slice(0, 4096),
      external_message_id: message.id,
      delivery_status: "sent",
      created_at: message.timestamp && /^\d+$/.test(message.timestamp)
        ? new Date(Number(message.timestamp) * 1000).toISOString()
        : new Date().toISOString(),
    })
    .select("id")
    .single();

  let wasCreated = Boolean(savedMessage);
  let messageId = savedMessage?.id;
  if (messageError?.code === "23505") {
    const { data: existing, error: existingError } = await admin.from("support_messages")
      .select("id")
      .eq("external_message_id", message.id)
      .maybeSingle();
    if (existingError || !existing) {
      throw new Error(`Could not resolve a duplicate WhatsApp message: ${existingError?.message ?? "No message returned."}`);
    }
    messageId = existing.id;
    wasCreated = false;
  } else if (messageError) {
    throw new Error(`Could not save incoming WhatsApp message: ${messageError.message}`);
  }
  if (!messageId) throw new Error("Incoming WhatsApp message was not saved.");

  if (media?.id) {
    const { count, error: attachmentCountError } = await admin.from("support_attachments")
      .select("id", { count: "exact", head: true })
      .eq("message_id", messageId);
    if (attachmentCountError) throw new Error(`Could not check WhatsApp attachments: ${attachmentCountError.message}`);
    if (!count) {
      const file = await downloadMedia(media, settings);
      if (file) await uploadSupportAttachment(admin, conversation.id, messageId, file);
    }
  }

  if (wasCreated) {
    await notifySupportAgents(admin, {
      title: "Fariin cusub oo WhatsApp ah",
      body: `${conversation.business_name}: ${body}`.slice(0, 180),
      conversationId: conversation.id,
    });
  }

  if (settings.welcome_message.trim()) {
    const { data: welcomeClaim, error: claimError } = await admin.from("support_conversations")
      .update({ welcome_message_sent_at: new Date().toISOString() })
      .eq("id", conversation.id)
      .is("welcome_message_sent_at", null)
      .select("id")
      .maybeSingle();
    if (claimError) {
      console.error("Could not claim the automatic WhatsApp welcome message:", claimError.message);
    } else if (welcomeClaim) {
      try {
        const welcomeMessageId = await sendWhatsAppMessage(settings, message.from, {
          text: settings.welcome_message,
        });
        const { data: welcomeMessage, error: welcomeSaveError } = await admin.from("support_messages")
          .insert({
            conversation_id: conversation.id,
            sender_type: "system",
            body: settings.welcome_message,
            external_message_id: welcomeMessageId,
            delivery_status: "sent",
          })
          .select("id")
          .single();
        if (welcomeSaveError) {
          console.error("Automatic WhatsApp welcome was sent but not saved:", welcomeSaveError.message);
        } else if (welcomeMessage) {
          await notifyBusinessSupportMembers(admin, {
            businessId: business.id,
            conversationId: conversation.id,
            messageId: welcomeMessage.id,
            title: "VELTO Support ayaa ku soo dhaweysay",
            body: settings.welcome_message,
          });
        }
      } catch (welcomeError) {
        console.error("Could not send the automatic WhatsApp welcome message:", welcomeError);
      }
    }
  }
  return { matched: true, conversationId: conversation.id };
}

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token") ?? "";
  const challenge = request.nextUrl.searchParams.get("hub.challenge");
  if (mode !== "subscribe" || challenge === null) return jsonError("Webhook verification request is malformed.", 400);

  try {
    const admin = createAdminClient();
    const settings = await getWhatsAppSettings(admin);
    const verifyToken = decryptSupportSecret(settings?.encrypted_verify_token ?? null);
    if (!verifyToken || !safeEqual(token, verifyToken)) return jsonError("Webhook verification failed.", 403);
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  } catch (error) {
    console.error("WhatsApp webhook verification is not configured:", error);
    return jsonError("WhatsApp webhook verification is not configured.", 503);
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (rawBody.length > 5 * 1024 * 1024) return jsonError("Webhook body is too large.", 413);

  let admin: ReturnType<typeof createAdminClient>;
  let settings: Awaited<ReturnType<typeof getWhatsAppSettings>>;
  let appSecret: string;
  try {
    admin = createAdminClient();
    settings = await getWhatsAppSettings(admin);
    appSecret = decryptSupportSecret(settings?.encrypted_app_secret ?? null);
  } catch (error) {
    console.error("WhatsApp webhook configuration could not be loaded:", error);
    return jsonError("WhatsApp webhook is not configured.", 503);
  }
  if (!settings || !appSecret) return jsonError("WhatsApp webhook is not configured.", 503);

  const signature = request.headers.get("x-hub-signature-256") ?? "";
  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  if (!safeEqual(signature, expected)) return jsonError("Webhook signature is invalid.", 401);

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return jsonError("Webhook body is not valid JSON.", 400);
  }

  const events: Array<{ key: string; type: string; payload: WhatsAppMessage | WhatsAppStatus; process: () => Promise<void> }> = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value?.messages ?? []) {
        if (message.id) {
          events.push({
            key: `message:${message.id}`,
            type: "incoming_message",
            payload: message,
            process: async () => {
              const result = await saveIncomingMessage(admin, settings!, message);
              if (!result.matched) return;
            },
          });
        }
      }
      for (const status of change.value?.statuses ?? []) {
        if (status.id && status.status && ["sent", "delivered", "read", "failed"].includes(status.status)) {
          events.push({
            key: `status:${status.id}:${status.status}:${status.timestamp ?? ""}`,
            type: "delivery_status",
            payload: status,
            process: async () => {
              const { error } = await admin.from("support_messages")
                .update({ delivery_status: status.status })
                .eq("external_message_id", status.id);
              if (error) throw new Error(`Could not synchronize WhatsApp delivery status: ${error.message}`);
            },
          });
        }
      }
    }
  }

  for (const event of events) {
    const { error: insertError } = await admin.from("whatsapp_webhook_events").insert({
      event_key: event.key,
      event_type: event.type,
      payload: event.payload,
    });
    if (insertError?.code !== "23505" && insertError) {
      console.error("Could not record a WhatsApp webhook event:", insertError.message);
      return jsonError("Webhook event could not be recorded.", 503);
    }
    if (insertError?.code === "23505") {
      const { data: existing, error: existingError } = await admin.from("whatsapp_webhook_events")
        .select("processed_at")
        .eq("event_key", event.key)
        .maybeSingle();
      if (existingError) {
        console.error("Could not check a repeated WhatsApp event:", existingError.message);
        return jsonError("Webhook event state could not be checked.", 503);
      }
      if (existing?.processed_at) continue;
    }

    try {
      await event.process();
      const { error: updateError } = await admin.from("whatsapp_webhook_events")
        .update({ processed_at: new Date().toISOString(), error: null })
        .eq("event_key", event.key);
      if (updateError) throw new Error(`Could not complete webhook event: ${updateError.message}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "WhatsApp webhook processing failed.";
      const { error: recordError } = await admin.from("whatsapp_webhook_events")
        .update({ error: message })
        .eq("event_key", event.key);
      if (recordError) console.error("Could not record WhatsApp webhook processing error:", recordError.message);
      console.error("WhatsApp webhook event processing failed:", error);
      return jsonError("Webhook event processing failed; Meta may retry it.", 503);
    }
  }

  return NextResponse.json({ received: true });
}

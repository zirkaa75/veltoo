import "server-only";

import { randomUUID } from "node:crypto";
import {
  sendNotification,
  setVapidDetails,
  type PushSubscription,
  type WebPushError,
} from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendPlatformPush } from "@/lib/notifications/web-push";

export const SUPPORT_BUCKET = "velto-support-attachments";
export const MAX_SUPPORT_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const SUPPORT_ATTACHMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
] as const;

export async function getBusinessSubscriptionPlan(admin: SupabaseClient, businessId: string) {
  const { data: subscription, error: subscriptionError } = await admin.from("subscriptions")
    .select("plan_id")
    .eq("business_id", businessId)
    .in("status", ["active", "trial", "past_due"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (subscriptionError) throw new Error(`Could not load business subscription: ${subscriptionError.message}`);
  if (!subscription?.plan_id) return "Unknown";

  const { data: plan, error: planError } = await admin.from("subscription_plans")
    .select("name")
    .eq("id", subscription.plan_id)
    .maybeSingle();
  if (planError) throw new Error(`Could not load business subscription plan: ${planError.message}`);
  const planName = typeof plan?.name === "string" ? plan.name : "";
  if (/\b4\b/.test(planName)) return "4-Star";
  if (/\b5\b/.test(planName)) return "5-Star";
  return planName || "Unknown";
}

export function validateSupportAttachment(file: File) {
  if (!SUPPORT_ATTACHMENT_MIME_TYPES.includes(file.type as (typeof SUPPORT_ATTACHMENT_MIME_TYPES)[number])) {
    throw new Error("Nooca faylkan lama taageero. Adeegso JPG, PNG, WebP, PDF, TXT ama CSV.");
  }
  if (file.size < 1 || file.size > MAX_SUPPORT_ATTACHMENT_BYTES) {
    throw new Error("Faylku waa inuu ka yaraadaa 10 MB.");
  }
}

export async function uploadSupportAttachment(
  admin: SupabaseClient,
  conversationId: string,
  messageId: string,
  file: File,
) {
  validateSupportAttachment(file);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "attachment";
  const storagePath = `${conversationId}/${messageId}/${randomUUID()}-${safeName}`;
  const { error: uploadError } = await admin.storage.from(SUPPORT_BUCKET).upload(storagePath, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) throw new Error(`Faylka lama kaydin: ${uploadError.message}`);

  const { data: attachment, error: recordError } = await admin.from("support_attachments").insert({
    message_id: messageId,
    storage_path: storagePath,
    file_name: file.name.slice(0, 255),
    mime_type: file.type,
    size_bytes: file.size,
  }).select("id,storage_path,file_name,mime_type,size_bytes").single();
  if (recordError) {
    const { error: cleanupError } = await admin.storage.from(SUPPORT_BUCKET).remove([storagePath]);
    if (cleanupError) console.error("Could not clean up an unreferenced support attachment:", cleanupError.message);
    throw new Error(`Faylka laguma xiri karin fariinta: ${recordError.message}`);
  }
  return attachment;
}

export async function attachSignedUrls(
  admin: SupabaseClient,
  messages: Array<Record<string, unknown> & { id: string }>,
) {
  if (!messages.length) return [];
  const { data: attachments, error } = await admin.from("support_attachments")
    .select("id,message_id,storage_path,file_name,mime_type,size_bytes")
    .in("message_id", messages.map((message) => message.id));
  if (error) throw new Error(`Could not load support attachments: ${error.message}`);

  const withUrls = await Promise.all((attachments ?? []).map(async (attachment) => {
    const { data, error: signedUrlError } = await admin.storage.from(SUPPORT_BUCKET)
      .createSignedUrl(attachment.storage_path, 60 * 60);
    if (signedUrlError || !data?.signedUrl) {
      throw new Error(`Could not create a private attachment link: ${signedUrlError?.message ?? "No URL returned."}`);
    }
    return {
      id: attachment.id,
      messageId: attachment.message_id,
      fileName: attachment.file_name,
      mimeType: attachment.mime_type,
      sizeBytes: attachment.size_bytes,
      url: data.signedUrl,
    };
  }));
  const byMessage = new Map<string, typeof withUrls>();
  for (const attachment of withUrls) {
    byMessage.set(attachment.messageId, [...(byMessage.get(attachment.messageId) ?? []), attachment]);
  }
  return messages.map((message) => ({ ...message, attachments: byMessage.get(message.id) ?? [] }));
}

export async function notifySupportAgents(
  admin: SupabaseClient,
  input: { title: string; body: string; conversationId: string },
) {
  const { error } = await admin.from("platform_notifications").insert({
    title: input.title,
    message: input.body,
    event_type: "support_message",
  });
  if (error) console.error("Could not save an admin support notification:", error.message);
  await sendPlatformPush(input.title, input.body, `/admin/whatsapp-support?conversation=${encodeURIComponent(input.conversationId)}`);
}

export async function notifyBusinessSupportMembers(
  admin: SupabaseClient,
  input: { businessId: string; conversationId: string; messageId: string; title: string; body: string },
) {
  const { data: members, error: membersError } = await admin.from("business_users")
    .select("user_id")
    .eq("business_id", input.businessId)
    .eq("status", "active");
  if (membersError) {
    console.error("Could not load business support notification recipients:", membersError.message);
    return;
  }
  const userIds = [...new Set((members ?? []).map((member) => member.user_id).filter(Boolean))];
  if (!userIds.length) return;

  const { error: notificationError } = await admin.from("support_notifications").insert(
    userIds.map((userId) => ({
      user_id: userId,
      business_id: input.businessId,
      conversation_id: input.conversationId,
      message_id: input.messageId,
    })),
  );
  if (notificationError) console.error("Could not save business support notifications:", notificationError.message);

  const subject = process.env.WEB_PUSH_SUBJECT;
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) return;

  const { data: subscriptions, error: subscriptionError } = await admin
    .from("business_support_push_subscriptions")
    .select("endpoint,subscription")
    .eq("business_id", input.businessId)
    .in("user_id", userIds);
  if (subscriptionError) {
    console.error("Could not load business support push subscriptions:", subscriptionError.message);
    return;
  }

  try {
    setVapidDetails(subject, publicKey, privateKey);
  } catch (error) {
    console.error("Business support push keys are invalid:", error);
    return;
  }
  const payload = JSON.stringify({
    title: input.title,
    body: input.body,
    url: `/app/workspace/${input.businessId}/support?conversation=${encodeURIComponent(input.conversationId)}`,
  });
  await Promise.all((subscriptions ?? []).map(async (row) => {
    try {
      await sendNotification(row.subscription as PushSubscription, payload, { TTL: 3600 });
    } catch (pushError) {
      const status = (pushError as WebPushError).statusCode;
      if (status === 404 || status === 410) {
        const { error: deleteError } = await admin.from("business_support_push_subscriptions")
          .delete().eq("endpoint", row.endpoint);
        if (deleteError) console.error("Could not remove expired business support push subscription:", deleteError.message);
      } else {
        console.error("Could not deliver a business support push notification:", pushError);
      }
    }
  }));
}

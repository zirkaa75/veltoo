import { NextRequest, NextResponse } from "next/server";
import { getBusinessSupportContext, getSupportAgent, isSameOrigin, supportAuthResponse } from "@/lib/support/auth";
import {
  attachSignedUrls,
  notifyBusinessSupportMembers,
  notifySupportAgents,
  uploadSupportAttachment,
  validateSupportAttachment,
} from "@/lib/support/service";
import { sendWhatsAppMessage } from "@/lib/support/whatsapp-cloud-api";
import { getWhatsAppSettings, type WhatsAppTemplate } from "@/lib/support/whatsapp-config";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ conversationId: string }> };

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function authenticateConversation(conversationId: string) {
  const supportAgent = await getSupportAgent();
  if (supportAgent.ok) {
    const { data: conversation, error } = await supportAgent.admin.from("support_conversations")
      .select("id,business_id,channel,status,whatsapp_contact_id,business_name")
      .eq("id", conversationId)
      .maybeSingle();
    if (error) {
      console.error("Could not load support conversation:", error.message);
      return { error: NextResponse.json({ error: "Conversation-ka lama xaqiijin karo." }, { status: 503 }) };
    }
    if (!conversation) return { error: NextResponse.json({ error: "Conversation-ka lama helin." }, { status: 404 }) };
    return { actor: { type: "agent" as const, user: supportAgent.user, admin: supportAgent.admin, conversation } };
  }
  if (supportAgent.status === 503) return { error: supportAuthResponse(supportAgent) };

  const admin = createAdminClient();
  const { data: conversation, error } = await admin.from("support_conversations")
    .select("id,business_id,channel,status,whatsapp_contact_id,business_name")
    .eq("id", conversationId)
    .maybeSingle();
  if (error) {
    console.error("Could not load support conversation for business access:", error.message);
    return { error: NextResponse.json({ error: "Conversation-ka lama xaqiijin karo." }, { status: 503 }) };
  }
  if (!conversation) return { error: NextResponse.json({ error: "Conversation-ka lama helin." }, { status: 404 }) };

  const business = await getBusinessSupportContext(conversation.business_id);
  if (!business.ok) return { error: supportAuthResponse(business) };
  return { actor: { type: "business" as const, user: business.user, admin: business.admin, conversation } };
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { conversationId } = await params;
  if (!isUuid(conversationId)) return NextResponse.json({ error: "Conversation ID sax ma aha." }, { status: 400 });
  const authenticated = await authenticateConversation(conversationId);
  if (authenticated.error) return authenticated.error;
  const { actor } = authenticated;
  const { data: messages, error } = await actor.admin.from("support_messages")
    .select("id,conversation_id,sender_type,sender_user_id,body,is_internal,external_message_id,delivery_status,created_at")
    .eq("conversation_id", conversationId)
    .eq("is_internal", false)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) {
    console.error("Could not load support messages:", error.message);
    return NextResponse.json({ error: "Fariimaha lama soo qaadi karin." }, { status: 503 });
  }

  const unreadColumn = actor.type === "agent" ? "unread_admin_count" : "unread_business_count";
  const { error: readError } = await actor.admin.from("support_conversations")
    .update({ [unreadColumn]: 0 })
    .eq("id", conversationId);
  if (readError) console.error("Could not clear unread support count:", readError.message);
  if (actor.type === "business") {
    const { error: notificationReadError } = await actor.admin.from("support_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .eq("user_id", actor.user.id)
      .is("read_at", null);
    if (notificationReadError) console.error("Could not mark business support notifications read:", notificationReadError.message);
  }

  try {
    const withAttachments = await attachSignedUrls(actor.admin, messages ?? []);
    return NextResponse.json({ messages: withAttachments }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (attachmentError) {
    console.error("Could not prepare private support attachments:", attachmentError);
    return NextResponse.json({ error: "Xiriirrada faylasha lama diyaarin karo." }, { status: 503 });
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Codsi aan la xaqiijin ayaa la diiday." }, { status: 403 });
  const { conversationId } = await params;
  if (!isUuid(conversationId)) return NextResponse.json({ error: "Conversation ID sax ma aha." }, { status: 400 });
  const authenticated = await authenticateConversation(conversationId);
  if (authenticated.error) return authenticated.error;
  const { actor } = authenticated;
  if (actor.conversation.status === "archived") {
    return NextResponse.json({ error: "Conversation-kan waa la archive-gareeyey." }, { status: 409 });
  }
  if (actor.type === "business" && actor.conversation.channel !== "workspace") {
    return NextResponse.json({ error: "Fariimaha WhatsApp-ka kaga jawaab WhatsApp-ka ama fur conversation cusub." }, { status: 409 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  let body = "";
  let idempotencyKey = request.headers.get("idempotency-key") ?? "";
  let templateName = "";
  let templateLanguage = "";
  let templateParameters: unknown = [];
  let attachment: File | null = null;
  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      body = String(form.get("body") ?? "");
      idempotencyKey ||= String(form.get("idempotencyKey") ?? "");
      templateName = String(form.get("templateName") ?? "");
      templateLanguage = String(form.get("templateLanguage") ?? "");
      const parameters = form.get("templateParameters");
      if (typeof parameters === "string" && parameters) templateParameters = JSON.parse(parameters) as unknown;
      const uploaded = form.get("file");
      if (uploaded instanceof File && uploaded.size > 0) attachment = uploaded;
    } else {
      const input = await request.json() as {
        body?: unknown;
        idempotencyKey?: unknown;
        templateName?: unknown;
        templateLanguage?: unknown;
        templateParameters?: unknown;
      };
      body = typeof input.body === "string" ? input.body : "";
      idempotencyKey ||= typeof input.idempotencyKey === "string" ? input.idempotencyKey : "";
      templateName = typeof input.templateName === "string" ? input.templateName : "";
      templateLanguage = typeof input.templateLanguage === "string" ? input.templateLanguage : "";
      templateParameters = input.templateParameters ?? [];
    }
  } catch {
    return NextResponse.json({ error: "Fariinta lama akhrin karin." }, { status: 400 });
  }

  if (!isUuid(idempotencyKey)) {
    return NextResponse.json({ error: "Furaha fariinta (idempotency key) sax ma aha." }, { status: 400 });
  }
  body = body.trim();
  if (body.length > 4096) return NextResponse.json({ error: "Fariintu kama badnaan karto 4096 xaraf." }, { status: 400 });
  if (attachment) {
    try {
      validateSupportAttachment(attachment);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Faylka lama taageero." }, { status: 400 });
    }
  }
  if (!body && !attachment && !templateName) return NextResponse.json({ error: "Fariin ama fayl ku dar." }, { status: 400 });
  if (Boolean(templateName) !== Boolean(templateLanguage)) {
    return NextResponse.json({ error: "Template name iyo language labadaba waa loo baahan yahay." }, { status: 400 });
  }
  if (
    !Array.isArray(templateParameters)
    || templateParameters.length > 20
    || templateParameters.some((parameter) => typeof parameter !== "string" || parameter.trim().length > 1024)
  ) {
    return NextResponse.json({ error: "Template parameters-ku sax ma aha." }, { status: 400 });
  }
  const parsedTemplateParameters = (templateParameters as string[]).map((parameter) => parameter.trim());
  if (templateName && attachment) {
    return NextResponse.json({ error: "Template iyo attachment isku mar lama diri karo." }, { status: 400 });
  }
  if (!templateName && parsedTemplateParameters.length) {
    return NextResponse.json({ error: "Template parameters waxay u baahan yihiin template la doortay." }, { status: 400 });
  }

  let whatsappSettings = null;
  if (actor.type === "agent" && actor.conversation.channel === "whatsapp") {
    try {
      whatsappSettings = await getWhatsAppSettings(actor.admin);
    } catch (error) {
      console.error("Could not load WhatsApp configuration for an admin reply:", error);
      return NextResponse.json({ error: "Dejimaha WhatsApp Cloud API lama soo qaadi karin." }, { status: 503 });
    }
    if (!whatsappSettings) return NextResponse.json({ error: "WhatsApp Cloud API weli lama dejin." }, { status: 503 });
    if (templateName) {
      const approved = (whatsappSettings.approved_templates ?? []) as WhatsAppTemplate[];
      const template = approved.find((item) => item.name === templateName && item.language === templateLanguage);
      if (!template) {
        return NextResponse.json({ error: "Template-kan kuma jiro liiska templates-ka la ansixiyey." }, { status: 400 });
      }
      const requiredParameters = template.parameters ?? 0;
      if (parsedTemplateParameters.length !== requiredParameters) {
        return NextResponse.json({ error: `Template-kan wuxuu u baahan yahay ${requiredParameters} parameter.` }, { status: 400 });
      }
    }
    if (!actor.conversation.whatsapp_contact_id) {
      return NextResponse.json({ error: "WhatsApp contact ID ma jiro; conversation-kan lagama jawaabi karo." }, { status: 409 });
    }
  }

  const storedBody = templateName
    ? `Template: ${templateName} (${templateLanguage})`
    : body;
  const initialStatus = "queued";
  const needsWhatsAppSend = actor.type === "agent" && actor.conversation.channel === "whatsapp";
  const { data: message, error: insertError } = await actor.admin.from("support_messages")
    .insert({
      conversation_id: conversationId,
      sender_type: actor.type,
      sender_user_id: actor.user.id,
      body: storedBody,
      idempotency_key: idempotencyKey,
      delivery_status: initialStatus,
    })
    .select("id,conversation_id,sender_type,sender_user_id,body,is_internal,external_message_id,delivery_status,created_at")
    .single();
  if (insertError) {
    if (insertError.code === "23505") {
      const { data: existing, error: existingError } = await actor.admin.from("support_messages")
        .select("id,conversation_id,sender_type,sender_user_id,body,is_internal,external_message_id,delivery_status,created_at")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (existingError) {
        console.error("Could not resolve a duplicate support message request:", existingError.message);
        return NextResponse.json({ error: "Xaaladda fariinta lama xaqiijin karo." }, { status: 503 });
      }
      if (!existing || existing.conversation_id !== conversationId) {
        return NextResponse.json({ error: "Idempotency key-kan hore ayaa conversation kale loogu isticmaalay." }, { status: 409 });
      }
      return NextResponse.json({ message: existing }, { status: 200 });
    }
    console.error("Could not create support message:", insertError.message);
    return NextResponse.json({ error: "Fariinta lama kaydin." }, { status: 503 });
  }

  let deliveryUpdateError = "";
  try {
    if (attachment) await uploadSupportAttachment(actor.admin, conversationId, message.id, attachment);
    if (needsWhatsAppSend && whatsappSettings) {
      const externalMessageId = await sendWhatsAppMessage(
        whatsappSettings,
        actor.conversation.whatsapp_contact_id!,
        {
          text: body,
          template: templateName ? {
            name: templateName,
            language: templateLanguage,
            parameters: parsedTemplateParameters,
          } : undefined,
          attachment: attachment ?? undefined,
        },
      );
      const { error: sentError } = await actor.admin.from("support_messages")
        .update({ delivery_status: "sent", external_message_id: externalMessageId })
        .eq("id", message.id);
      if (sentError) {
        console.error("WhatsApp sent, but support message status could not be updated:", sentError.message);
        deliveryUpdateError = sentError.message;
      } else {
        message.delivery_status = "sent";
      }
      message.external_message_id = externalMessageId;
    } else {
      const { error: sentError } = await actor.admin.from("support_messages")
        .update({ delivery_status: "sent" })
        .eq("id", message.id);
      if (sentError) {
        console.error("Could not mark a workspace support message sent:", sentError.message);
        deliveryUpdateError = sentError.message;
      } else {
        message.delivery_status = "sent";
      }
    }
  } catch (sendError) {
    const errorMessage = sendError instanceof Error ? sendError.message : "Fariinta lama diri karin.";
    const { error: updateError } = await actor.admin.from("support_messages")
      .update({ delivery_status: "failed" })
      .eq("id", message.id);
    if (updateError) console.error("Could not record a failed support message:", updateError.message);
    console.error("Support message processing failed:", sendError);
    return NextResponse.json({ error: errorMessage }, { status: 502 });
  }

  if (deliveryUpdateError && !needsWhatsAppSend) {
    return NextResponse.json({ error: "Fariinta waa la kaydiyey, balse xaaladdeeda lama xaqiijin karo." }, { status: 503 });
  }
  if (actor.type === "business") {
    if (actor.conversation.status === "resolved") {
      const { error: reopenError } = await actor.admin.from("support_conversations")
        .update({ status: "open" })
        .eq("id", conversationId);
      if (reopenError) console.error("Could not reopen a resolved support conversation:", reopenError.message);
    }
    await notifySupportAgents(actor.admin, {
      title: "Fariin cusub oo support ah",
      body: `${actor.conversation.business_name}: ${body || "Fayl cusub ayaa la soo diray."}`.slice(0, 180),
      conversationId,
    });
  } else {
    await notifyBusinessSupportMembers(actor.admin, {
      businessId: actor.conversation.business_id,
      conversationId,
      messageId: message.id,
      title: "Jawaab cusub oo VELTO Support ah",
      body: body || (templateName ? `WhatsApp template ${templateName} ayaa laguu soo diray.` : "Fayl cusub ayaa laguu soo diray."),
    });
  }

  if (deliveryUpdateError) {
    return NextResponse.json({
      error: "WhatsApp fariinta waa diray, balse xaaladdeeda database-ka lama cusboonaysiin.",
      messageId: message.id,
    }, { status: 503 });
  }
  try {
    const [withAttachments] = await attachSignedUrls(actor.admin, [message]);
    return NextResponse.json({ message: withAttachments }, { status: 201 });
  } catch (attachmentError) {
    console.error("Message was saved, but its attachment links could not be prepared:", attachmentError);
    return NextResponse.json({ error: "Fariinta waa la kaydiyey, balse faylka dib looma soo bandhigi karin." }, { status: 503 });
  }
}

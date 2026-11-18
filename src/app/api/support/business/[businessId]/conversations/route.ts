import { NextResponse, type NextRequest } from "next/server";
import { getBusinessSupportContext, isSameOrigin, supportAuthResponse } from "@/lib/support/auth";
import { getBusinessSubscriptionPlan } from "@/lib/support/service";
import { publicWhatsAppSettings, getWhatsAppSettings } from "@/lib/support/whatsapp-config";

type RouteContext = { params: Promise<{ businessId: string }> };

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { businessId } = await params;
  if (!isUuid(businessId)) return NextResponse.json({ error: "Business ID sax ah lama helin." }, { status: 400 });
  const context = await getBusinessSupportContext(businessId);
  if (!context.ok) return supportAuthResponse(context);

  const { data: conversations, error } = await context.admin.from("support_conversations")
    .select("id,business_id,channel,status,subject,business_name,account_owner,contact_phone,registered_email,subscription_plan,assigned_agent_id,unread_business_count,last_message_at,created_at,updated_at")
    .eq("business_id", businessId)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) {
    console.error("Could not load business support conversations:", error.message);
    return NextResponse.json({ error: "Wadahadaladii support-ka lama soo qaadi karin." }, { status: 503 });
  }

  const conversationIds = (conversations ?? []).map((conversation) => conversation.id);
  const { data: messages, error: messagesError } = conversationIds.length
    ? await context.admin.from("support_messages")
      .select("id,conversation_id,body,sender_type,created_at,delivery_status")
      .eq("is_internal", false)
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: false })
      .limit(300)
    : { data: [], error: null };
  if (messagesError) {
    console.error("Could not load support conversation previews:", messagesError.message);
    return NextResponse.json({ error: "Fariimaha support-ka lama soo qaadi karin." }, { status: 503 });
  }
  const latestMessage = new Map<string, (typeof messages)[number]>();
  for (const message of messages ?? []) {
    if (!latestMessage.has(message.conversation_id)) latestMessage.set(message.conversation_id, message);
  }

  let settings = null;
  try {
    settings = await getWhatsAppSettings(context.admin);
  } catch (settingsError) {
    console.error("Could not load business WhatsApp support configuration:", settingsError);
    return NextResponse.json({ error: "Dejimaha WhatsApp Support lama soo qaadi karin." }, { status: 503 });
  }

  return NextResponse.json({
    conversations: (conversations ?? []).map((conversation) => ({
      ...conversation,
      latestMessage: latestMessage.get(conversation.id) ?? null,
    })),
    whatsapp: publicWhatsAppSettings(settings),
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Codsi aan la xaqiijin ayaa la diiday." }, { status: 403 });
  const { businessId } = await params;
  if (!isUuid(businessId)) return NextResponse.json({ error: "Business ID sax ah lama helin." }, { status: 400 });
  const context = await getBusinessSupportContext(businessId);
  if (!context.ok) return supportAuthResponse(context);

  let subject = "VELTO Support";
  try {
    const body = await request.json() as { subject?: unknown };
    if (typeof body.subject === "string" && body.subject.trim()) {
      subject = body.subject.trim().slice(0, 120);
    }
  } catch {
    return NextResponse.json({ error: "Codsiga fariinta waa inuu noqdaa JSON sax ah." }, { status: 400 });
  }

  try {
    const plan = await getBusinessSubscriptionPlan(context.admin, businessId);
    const { data: conversation, error } = await context.admin.from("support_conversations")
      .insert({
        business_id: businessId,
        channel: "workspace",
        status: "open",
        subject,
        business_name: context.business.name,
        account_owner: context.business.owner_name ?? context.user.user_metadata.full_name ?? "",
        contact_phone: context.business.phone ?? "",
        registered_email: context.business.owner_email ?? context.user.email ?? "",
        subscription_plan: plan,
      })
      .select("id,business_id,channel,status,subject,business_name,account_owner,contact_phone,registered_email,subscription_plan,assigned_agent_id,unread_business_count,last_message_at,created_at,updated_at")
      .single();
    if (error || !conversation) {
      console.error("Could not create a business support conversation:", error?.message ?? "No conversation returned.");
      return NextResponse.json({ error: "Wadahadal cusub lama abuuri karin." }, { status: 503 });
    }
    return NextResponse.json({ conversation }, { status: 201 });
  } catch (error) {
    console.error("Could not prepare a business support conversation:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Wadahadal cusub lama abuuri karin." }, { status: 503 });
  }
}

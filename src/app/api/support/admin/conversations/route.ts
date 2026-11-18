import { NextRequest, NextResponse } from "next/server";
import { getSupportAgent, supportAuthResponse } from "@/lib/support/auth";
import { getWhatsAppSettings, publicWhatsAppSettings } from "@/lib/support/whatsapp-config";

const statuses = new Set(["open", "pending", "resolved", "archived"]);

function isDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export async function GET(request: NextRequest) {
  const context = await getSupportAgent();
  if (!context.ok) return supportAuthResponse(context);
  const params = request.nextUrl.searchParams;
  const status = params.get("status") ?? "";
  const query = params.get("q")?.trim().slice(0, 100) ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";

  if (status && status !== "all" && status !== "new" && !statuses.has(status)) {
    return NextResponse.json({ error: "Conversation status sax ma aha." }, { status: 400 });
  }
  if ((from && !isDate(from)) || (to && !isDate(to))) {
    return NextResponse.json({ error: "Taariikhda filter-ka sax ma aha." }, { status: 400 });
  }

  const selectedColumns = "id,business_id,channel,status,subject,business_name,account_owner,contact_phone,registered_email,subscription_plan,whatsapp_contact_id,assigned_agent_id,unread_admin_count,unread_business_count,last_message_at,created_at,updated_at";
  const makeQuery = () => {
    let queryBuilder = context.admin.from("support_conversations")
      .select(selectedColumns)
      .order("updated_at", { ascending: false })
      .limit(500);
    if (status && status !== "all" && status !== "new") queryBuilder = queryBuilder.eq("status", status);
    if (from) queryBuilder = queryBuilder.gte("created_at", `${from}T00:00:00.000Z`);
    if (to) {
      const upperBound = new Date(`${to}T00:00:00.000Z`);
      upperBound.setUTCDate(upperBound.getUTCDate() + 1);
      queryBuilder = queryBuilder.lt("created_at", upperBound.toISOString());
    }
    return queryBuilder;
  };

  let conversations = [];
  if (query) {
    const value = `%${query.replace(/[%_]/g, "\\$&")}%`;
    const [byName, byPhone, byId] = await Promise.all([
      makeQuery().ilike("business_name", value),
      makeQuery().ilike("contact_phone", value),
      /^[0-9a-f-]{36}$/i.test(query)
        ? context.admin.from("support_conversations").select(selectedColumns).eq("id", query).limit(200)
        : Promise.resolve({ data: [], error: null }),
    ]);
    const errors = [byName.error, byPhone.error, byId.error].filter(Boolean);
    if (errors.length) {
      console.error("Could not search support conversations:", errors.map((error) => error?.message).join("; "));
      return NextResponse.json({ error: "Raadinta conversations-ka way fashilantay." }, { status: 503 });
    }
    const combined = [...(byName.data ?? []), ...(byPhone.data ?? []), ...(byId.data ?? [])];
    const deduplicated = new Map(combined.map((conversation) => [conversation.id, conversation]));
    conversations = [...deduplicated.values()].filter((conversation) =>
      `${conversation.business_name} ${conversation.contact_phone} ${conversation.id}`.toLowerCase().includes(query.toLowerCase()),
    );
    if (status && status !== "all" && status !== "new") {
      conversations = conversations.filter((conversation) => conversation.status === status);
    }
    if (from) conversations = conversations.filter((conversation) => conversation.created_at >= `${from}T00:00:00.000Z`);
    if (to) {
      const upperBound = new Date(`${to}T00:00:00.000Z`);
      upperBound.setUTCDate(upperBound.getUTCDate() + 1);
      conversations = conversations.filter((conversation) => conversation.created_at < upperBound.toISOString());
    }
  } else {
    const { data, error } = await makeQuery();
    if (error) {
      console.error("Could not load support conversations:", error.message);
      return NextResponse.json({ error: "Conversations-ka lama soo qaadi karin." }, { status: 503 });
    }
    conversations = data ?? [];
  }

  if (status === "new") conversations = conversations.filter((conversation) => conversation.unread_admin_count > 0);

  const conversationIds = conversations.map((conversation) => conversation.id);
  const { data: messages, error: messagesError } = conversationIds.length
    ? await context.admin.from("support_messages")
      .select("id,conversation_id,body,sender_type,created_at,delivery_status")
      .eq("is_internal", false)
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: false })
      .limit(500)
    : { data: [], error: null };
  if (messagesError) {
    console.error("Could not load support inbox previews:", messagesError.message);
    return NextResponse.json({ error: "Fariimaha ugu dambeeya lama soo qaadi karin." }, { status: 503 });
  }
  const latestMessage = new Map<string, (typeof messages)[number]>();
  for (const message of messages ?? []) {
    if (!latestMessage.has(message.conversation_id)) latestMessage.set(message.conversation_id, message);
  }

  const { data: agents, error: agentsError } = await context.admin.from("platform_admins")
    .select("user_id,role,status")
    .eq("status", "active")
    .in("role", ["platform_administrator", "support_staff"]);
  if (agentsError) {
    console.error("Could not load active support agents:", agentsError.message);
    return NextResponse.json({ error: "Kooxda support-ka lama soo qaadi karin." }, { status: 503 });
  }
  const agentOptions = await Promise.all((agents ?? []).map(async (agent) => {
    const { data } = await context.admin.auth.admin.getUserById(agent.user_id);
    const agentUser = data?.user;
    const fullName = typeof agentUser?.user_metadata.full_name === "string"
      ? agentUser.user_metadata.full_name
      : "";
    return {
      id: agent.user_id,
      label: fullName
        || agentUser?.email
        || `${agent.role.replaceAll("_", " ")} (${agent.user_id.slice(0, 8)})`,
    };
  }));

  let whatsapp;
  try {
    whatsapp = publicWhatsAppSettings(await getWhatsAppSettings(context.admin));
  } catch (error) {
    console.error("Could not load safe WhatsApp support settings:", error);
    return NextResponse.json({ error: "WhatsApp support state lama soo qaadi karin." }, { status: 503 });
  }

  return NextResponse.json({
    conversations: conversations.map((conversation) => ({
      ...conversation,
      latestMessage: latestMessage.get(conversation.id) ?? null,
    })),
    agents: agentOptions,
    whatsapp,
  }, { headers: { "Cache-Control": "private, no-store" } });
}

import { NextRequest, NextResponse } from "next/server";
import { getSupportAgent, isSameOrigin, supportAuthResponse } from "@/lib/support/auth";
import { notifySupportAgents } from "@/lib/support/service";

type RouteContext = { params: Promise<{ conversationId: string }> };
const allowedStatuses = new Set(["open", "pending", "resolved", "archived"]);

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { conversationId } = await params;
  if (!isUuid(conversationId)) return NextResponse.json({ error: "Conversation ID sax ma aha." }, { status: 400 });
  const context = await getSupportAgent();
  if (!context.ok) return supportAuthResponse(context);

  const [{ data: conversation, error: conversationError }, { data: notes, error: notesError }] = await Promise.all([
    context.admin.from("support_conversations").select("*").eq("id", conversationId).maybeSingle(),
    context.admin.from("support_internal_notes").select("id,conversation_id,agent_id,body,created_at")
      .eq("conversation_id", conversationId).order("created_at", { ascending: true }).limit(500),
  ]);
  if (conversationError || notesError) {
    console.error("Could not load support conversation details:", conversationError?.message ?? notesError?.message);
    return NextResponse.json({ error: "Faahfaahinta conversation-ka lama soo qaadi karin." }, { status: 503 });
  }
  if (!conversation) return NextResponse.json({ error: "Conversation-ka lama helin." }, { status: 404 });
  return NextResponse.json({ conversation, notes: notes ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Codsi aan la xaqiijin ayaa la diiday." }, { status: 403 });
  const { conversationId } = await params;
  if (!isUuid(conversationId)) return NextResponse.json({ error: "Conversation ID sax ma aha." }, { status: 400 });
  const context = await getSupportAgent();
  if (!context.ok) return supportAuthResponse(context);

  let input: { status?: unknown; assignedAgentId?: unknown; internalNote?: unknown };
  try {
    input = await request.json() as typeof input;
  } catch {
    return NextResponse.json({ error: "Codsiga waa inuu noqdaa JSON sax ah." }, { status: 400 });
  }
  if (input.status === undefined && input.assignedAgentId === undefined && input.internalNote === undefined) {
    return NextResponse.json({ error: "Wax xog ah oo la cusboonaysiinayo lama helin." }, { status: 400 });
  }

  const { data: current, error: currentError } = await context.admin.from("support_conversations")
    .select("id,business_id,business_name")
    .eq("id", conversationId)
    .maybeSingle();
  if (currentError) {
    console.error("Could not verify support conversation before update:", currentError.message);
    return NextResponse.json({ error: "Conversation-ka lama xaqiijin karo." }, { status: 503 });
  }
  if (!current) return NextResponse.json({ error: "Conversation-ka lama helin." }, { status: 404 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.status !== undefined) {
    if (typeof input.status !== "string" || !allowedStatuses.has(input.status)) {
      return NextResponse.json({ error: "Conversation status sax ma aha." }, { status: 400 });
    }
    updates.status = input.status;
  }
  if (input.assignedAgentId !== undefined) {
    if (input.assignedAgentId !== null && (typeof input.assignedAgentId !== "string" || !isUuid(input.assignedAgentId))) {
      return NextResponse.json({ error: "Support agent sax ah dooro." }, { status: 400 });
    }
    if (typeof input.assignedAgentId === "string") {
      const { data: agent, error: agentError } = await context.admin.from("platform_admins")
        .select("user_id")
        .eq("user_id", input.assignedAgentId)
        .eq("status", "active")
        .in("role", ["platform_administrator", "support_staff"])
        .maybeSingle();
      if (agentError) {
        console.error("Could not validate support assignment:", agentError.message);
        return NextResponse.json({ error: "Xubinta support-ka lama xaqiijin karo." }, { status: 503 });
      }
      if (!agent) return NextResponse.json({ error: "Xubintaas ma aha support agent firfircoon." }, { status: 400 });
    }
    updates.assigned_agent_id = input.assignedAgentId;
  }
  if (input.status !== undefined || input.assignedAgentId !== undefined) {
    const { error: updateError } = await context.admin.from("support_conversations")
      .update(updates)
      .eq("id", conversationId);
    if (updateError) {
      console.error("Could not update support conversation:", updateError.message);
      return NextResponse.json({ error: "Conversation-ka lama cusboonaysiin." }, { status: 503 });
    }
  }

  if (input.internalNote !== undefined) {
    if (typeof input.internalNote !== "string" || !input.internalNote.trim() || input.internalNote.trim().length > 5000) {
      return NextResponse.json({ error: "Internal note-ku waa inuu noqdaa 1 ilaa 5000 xaraf." }, { status: 400 });
    }
    const { error: noteError } = await context.admin.from("support_internal_notes").insert({
      conversation_id: conversationId,
      agent_id: context.user.id,
      body: input.internalNote.trim(),
    });
    if (noteError) {
      console.error("Could not save an internal support note:", noteError.message);
      return NextResponse.json({ error: "Internal note-ka lama kaydin." }, { status: 503 });
    }
  }

  if (typeof input.assignedAgentId === "string" && input.assignedAgentId !== context.user.id) {
    await notifySupportAgents(context.admin, {
      title: "Conversation laguu qoondeeyey",
      body: `${current.business_name}: waxaa laguu qoondeeyey support conversation cusub.`,
      conversationId,
    });
  }
  if (input.status === "pending") {
    await notifySupportAgents(context.admin, {
      title: "Conversation ayaa pending ah",
      body: `${current.business_name}: conversation-ka waxaa loo beddelay Pending.`,
      conversationId,
    });
  }

  const { data: conversation, error: reloadError } = await context.admin.from("support_conversations")
    .select("*").eq("id", conversationId).single();
  if (reloadError) {
    console.error("Could not reload support conversation after update:", reloadError.message);
    return NextResponse.json({ error: "Xogta waa la beddelay, balse dib looma soo qaadi karin." }, { status: 503 });
  }
  return NextResponse.json({ conversation });
}

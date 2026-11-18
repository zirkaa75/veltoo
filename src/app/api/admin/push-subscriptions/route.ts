import { NextResponse, type NextRequest } from "next/server";
import { getSupportAgent, supportAuthResponse } from "@/lib/support/auth";

export const instant = false;

function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

export async function GET() {
  const context = await getSupportAgent();
  if (!context.ok) return supportAuthResponse(context);
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY;
  const configured = Boolean(publicKey && process.env.WEB_PUSH_PRIVATE_KEY && process.env.WEB_PUSH_SUBJECT);
  return NextResponse.json(
    { publicKey: publicKey ?? null, configured },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const context = await getSupportAgent();
  if (!context.ok) return supportAuthResponse(context);

  let input: { subscription?: unknown };
  try {
    input = await request.json() as typeof input;
  } catch {
    return NextResponse.json({ error: "A valid JSON request body is required." }, { status: 400 });
  }

  const subscription = input.subscription;
  if (!subscription || typeof subscription !== "object" || Array.isArray(subscription)) {
    return NextResponse.json({ error: "A valid browser push subscription is required." }, { status: 400 });
  }
  const value = subscription as Record<string, unknown>;
  const keys = value.keys;
  if (
    typeof value.endpoint !== "string"
    || value.endpoint.length > 2048
    || !value.endpoint.startsWith("https://")
    || !keys
    || typeof keys !== "object"
    || typeof (keys as Record<string, unknown>).p256dh !== "string"
    || typeof (keys as Record<string, unknown>).auth !== "string"
  ) {
    return NextResponse.json({ error: "The browser push subscription is malformed." }, { status: 400 });
  }

  const admin = context.admin;
  const { error } = await admin.from("platform_push_subscriptions").upsert({
    user_id: context.user.id,
    endpoint: value.endpoint,
    subscription,
    updated_at: new Date().toISOString(),
  }, { onConflict: "endpoint" });
  if (error) {
    console.error("Could not save a Super Admin push subscription:", error.message);
    return NextResponse.json({ error: "Browser notifications could not be enabled." }, { status: 503 });
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const context = await getSupportAgent();
  if (!context.ok) return supportAuthResponse(context);

  let input: { endpoint?: unknown };
  try {
    input = await request.json() as typeof input;
  } catch {
    return NextResponse.json({ error: "A valid JSON request body is required." }, { status: 400 });
  }
  if (typeof input.endpoint !== "string" || input.endpoint.length > 2048) {
    return NextResponse.json({ error: "A valid subscription endpoint is required." }, { status: 400 });
  }

  const { error } = await context.admin.from("platform_push_subscriptions")
    .delete().eq("user_id", context.user.id).eq("endpoint", input.endpoint);
  if (error) {
    console.error("Could not remove a Super Admin push subscription:", error.message);
    return NextResponse.json({ error: "Browser notifications could not be disabled." }, { status: 503 });
  }
  return NextResponse.json({ success: true });
}

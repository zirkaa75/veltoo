import { NextRequest, NextResponse } from "next/server";
import { getBusinessSupportContext, isSameOrigin, supportAuthResponse } from "@/lib/support/auth";

type RouteContext = { params: Promise<{ businessId: string }> };

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isPushSubscription(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const subscription = value as Record<string, unknown>;
  const keys = subscription.keys;
  return typeof subscription.endpoint === "string"
    && subscription.endpoint.length <= 2048
    && subscription.endpoint.startsWith("https://")
    && Boolean(keys)
    && typeof keys === "object"
    && typeof (keys as Record<string, unknown>).p256dh === "string"
    && typeof (keys as Record<string, unknown>).auth === "string";
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { businessId } = await params;
  if (!isUuid(businessId)) return NextResponse.json({ error: "Business ID sax ma aha." }, { status: 400 });
  const context = await getBusinessSupportContext(businessId);
  if (!context.ok) return supportAuthResponse(context);
  return NextResponse.json({
    publicKey: process.env.WEB_PUSH_PUBLIC_KEY ?? null,
    configured: Boolean(process.env.WEB_PUSH_PUBLIC_KEY && process.env.WEB_PUSH_PRIVATE_KEY && process.env.WEB_PUSH_SUBJECT),
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Codsi aan la xaqiijin ayaa la diiday." }, { status: 403 });
  const { businessId } = await params;
  if (!isUuid(businessId)) return NextResponse.json({ error: "Business ID sax ma aha." }, { status: 400 });
  const context = await getBusinessSupportContext(businessId);
  if (!context.ok) return supportAuthResponse(context);

  let input: { subscription?: unknown };
  try {
    input = await request.json() as typeof input;
  } catch {
    return NextResponse.json({ error: "Codsi JSON sax ah ayaa loo baahan yahay." }, { status: 400 });
  }
  if (!isPushSubscription(input.subscription)) {
    return NextResponse.json({ error: "Browser push subscription-ka sax ma aha." }, { status: 400 });
  }

  const { error } = await context.admin.from("business_support_push_subscriptions").upsert({
    endpoint: input.subscription.endpoint,
    subscription: input.subscription,
    user_id: context.user.id,
    business_id: businessId,
    updated_at: new Date().toISOString(),
  }, { onConflict: "endpoint" });
  if (error) {
    console.error("Could not save business support push subscription:", error.message);
    return NextResponse.json({ error: "Ogeysiisyada browser-ka lama diiwaangelin." }, { status: 503 });
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Codsi aan la xaqiijin ayaa la diiday." }, { status: 403 });
  const { businessId } = await params;
  if (!isUuid(businessId)) return NextResponse.json({ error: "Business ID sax ma aha." }, { status: 400 });
  const context = await getBusinessSupportContext(businessId);
  if (!context.ok) return supportAuthResponse(context);

  let input: { endpoint?: unknown };
  try {
    input = await request.json() as typeof input;
  } catch {
    return NextResponse.json({ error: "Codsi JSON sax ah ayaa loo baahan yahay." }, { status: 400 });
  }
  if (typeof input.endpoint !== "string" || input.endpoint.length > 2048) {
    return NextResponse.json({ error: "Push endpoint sax ah ayaa loo baahan yahay." }, { status: 400 });
  }
  const { error } = await context.admin.from("business_support_push_subscriptions")
    .delete().eq("endpoint", input.endpoint).eq("user_id", context.user.id).eq("business_id", businessId);
  if (error) {
    console.error("Could not remove business support push subscription:", error.message);
    return NextResponse.json({ error: "Ogeysiisyada browser-ka lama damin." }, { status: 503 });
  }
  return NextResponse.json({ success: true });
}

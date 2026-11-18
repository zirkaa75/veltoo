import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { sendPlatformPush } from "@/lib/notifications/web-push";
import { createAdminClient } from "@/lib/supabase/admin";

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

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!name || !domain) return "business account";
  return `${name.slice(0, 1)}***@${domain}`;
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });

  let input: { email?: unknown };
  try {
    input = await request.json() as typeof input;
  } catch {
    return NextResponse.json({ error: "A valid JSON request body is required." }, { status: 400 });
  }
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: application, error: applicationError } = await admin.from("business_applications")
    .select("id")
    .eq("email", email)
    .limit(1)
    .maybeSingle();
  if (applicationError) {
    console.error("Could not verify the account for a failed business login attempt:", applicationError.message);
    return NextResponse.json({ error: "Login attempt could not be verified." }, { status: 503 });
  }
  if (!application) return NextResponse.json({ success: true });

  const emailHash = createHash("sha256").update(email).digest("hex");
  const forwardedIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const clientIp = request.headers.get("x-real-ip")?.trim() || forwardedIp || "unknown-client";
  const ipHash = createHash("sha256").update(clientIp).digest("hex");
  const { data: attemptCount, error: recordError } = await admin.rpc(
    "record_business_login_failure",
    { p_email_hash: emailHash, p_ip_hash: ipHash },
  );
  if (recordError || typeof attemptCount !== "number") {
    console.error("Could not record a failed business login attempt:", recordError?.message ?? "No count returned.");
    return NextResponse.json({ error: "Login attempt could not be recorded." }, { status: 503 });
  }

  if (attemptCount === 5) {
    const maskedEmail = maskEmail(email);
    const title = "Login attempts repeated";
    const message = `5 login attempts for ${maskedEmail} failed within the current 10-minute window. No password was recorded.`;
    const { error } = await admin.from("platform_notifications").insert({
      title,
      message,
      event_type: "business_login_failures",
    });
    if (error) {
      console.error("Repeated login attempts were detected but the Admin notification failed:", error.message);
      return NextResponse.json({ error: "Login attempts were recorded, but the Admin alert failed." }, { status: 503 });
    }
    await sendPlatformPush(title, message);
  }

  return NextResponse.json({ success: true });
}

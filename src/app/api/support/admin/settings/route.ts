import { NextRequest, NextResponse } from "next/server";
import { getSupportAgent, isSameOrigin, supportAuthResponse } from "@/lib/support/auth";
import {
  getWhatsAppSettings,
  publicWhatsAppSettings,
  saveWhatsAppSettings,
  type WhatsAppTemplate,
} from "@/lib/support/whatsapp-config";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value: unknown, maximum: number, field: string) {
  if (typeof value !== "string" || value.length > maximum) throw new Error(`${field} waa inuu noqdaa qoraal sax ah.`);
  return value.trim();
}

function validateTemplates(value: unknown): WhatsAppTemplate[] {
  if (!Array.isArray(value) || value.length > 50) throw new Error("Approved templates-ku waa inay noqdaan liis sax ah.");
  return value.map((item) => {
    if (!isRecord(item) || typeof item.name !== "string" || typeof item.language !== "string") {
      throw new Error("Template kasta wuxuu u baahan yahay name iyo language.");
    }
    const name = item.name.trim();
    const language = item.language.trim();
    const parameters = item.parameters === undefined ? 0 : item.parameters;
    if (!/^[a-zA-Z0-9_]{1,512}$/.test(name) || !/^[a-zA-Z0-9_-]{2,20}$/.test(language)) {
      throw new Error("Template name ama language sax ma aha.");
    }
    if (typeof parameters !== "number" || !Number.isInteger(parameters) || parameters < 0 || parameters > 20) {
      throw new Error("Template parameter count-ku waa inuu u dhexeeyaa 0 iyo 20.");
    }
    return { name, language, parameters };
  });
}

async function getAuthorizedAdmin() {
  const context = await getSupportAgent();
  if (!context.ok) return { error: supportAuthResponse(context) };
  if (context.role !== "platform_administrator") {
    return { error: NextResponse.json({ error: "Super Admin keliya ayaa beddeli kara dejimaha WhatsApp-ka." }, { status: 403 }) };
  }
  return { context };
}

export async function GET() {
  const authorized = await getAuthorizedAdmin();
  if (authorized.error) return authorized.error;
  try {
    const settings = await getWhatsAppSettings(authorized.context.admin);
    return NextResponse.json({ settings: publicWhatsAppSettings(settings) }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("Could not load WhatsApp support settings:", error);
    return NextResponse.json({ error: "Dejimaha WhatsApp-ka lama soo qaadi karin." }, { status: 503 });
  }
}

export async function PUT(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Codsi aan la xaqiijin ayaa la diiday." }, { status: 403 });
  const authorized = await getAuthorizedAdmin();
  if (authorized.error) return authorized.error;

  let input: Record<string, unknown>;
  try {
    const value = await request.json() as unknown;
    if (!isRecord(value)) throw new Error("Codsiga dejimaha waa inuu noqdaa object sax ah.");
    input = value;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "JSON sax ah ayaa loo baahan yahay." }, { status: 400 });
  }

  try {
    const supportHours = input.supportHours === undefined
      ? {}
      : input.supportHours;
    if (!isRecord(supportHours)) throw new Error("Support hours-ku waa inay noqdaan object sax ah.");
    if (typeof input.supportAvailable !== "boolean") throw new Error("Support availability waa in la doortaa.");
    const graphApiVersion = text(input.graphApiVersion, 20, "Graph API version");
    if (graphApiVersion && !/^v\d+\.\d+$/.test(graphApiVersion)) throw new Error("Graph API version sax ma aha (tusaale format: vNN.N).");

    await saveWhatsAppSettings(authorized.context.admin, authorized.context.user.id, {
      businessPhoneNumber: text(input.businessPhoneNumber, 32, "Business phone number"),
      businessAccountId: text(input.businessAccountId, 128, "WhatsApp Business Account ID"),
      phoneNumberId: text(input.phoneNumberId, 128, "Phone Number ID"),
      displayName: text(input.displayName, 100, "Business display name"),
      graphApiVersion,
      supportAvailable: input.supportAvailable,
      welcomeMessage: text(input.welcomeMessage, 1000, "Welcome message"),
      supportHours,
      approvedTemplates: validateTemplates(input.approvedTemplates),
      accessToken: text(input.accessToken ?? "", 4096, "API access token"),
      appSecret: text(input.appSecret ?? "", 4096, "Meta app secret"),
      verifyToken: text(input.verifyToken ?? "", 4096, "Webhook verify token"),
    });
    const settings = await getWhatsAppSettings(authorized.context.admin);
    return NextResponse.json({ success: true, settings: publicWhatsAppSettings(settings) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dejimaha WhatsApp-ka lama kaydin.";
    const status = message.includes("SUPPORT_CONFIG_ENCRYPTION_KEY") ? 503 : 400;
    if (status === 503) console.error("Secure WhatsApp credential storage is unavailable:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

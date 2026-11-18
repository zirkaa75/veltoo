import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type WhatsAppTemplate = { name: string; language: string; parameters?: number };

export type WhatsAppSettings = {
  business_phone_number: string;
  business_account_id: string;
  phone_number_id: string;
  display_name: string;
  graph_api_version: string;
  encrypted_access_token: string | null;
  encrypted_app_secret: string | null;
  encrypted_verify_token: string | null;
  support_available: boolean;
  welcome_message: string;
  support_hours: Record<string, unknown>;
  approved_templates: WhatsAppTemplate[];
};

function encryptionKey() {
  const configured = process.env.SUPPORT_CONFIG_ENCRYPTION_KEY?.trim();
  if (!configured) throw new Error("SUPPORT_CONFIG_ENCRYPTION_KEY is not configured.");

  const key = /^[\da-f]{64}$/i.test(configured)
    ? Buffer.from(configured, "hex")
    : Buffer.from(configured.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (key.length !== 32) {
    throw new Error("SUPPORT_CONFIG_ENCRYPTION_KEY must encode exactly 32 bytes.");
  }
  return key;
}

export function isSupportConfigEncryptionReady() {
  try {
    encryptionKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptSupportSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptSupportSecret(secret: string | null) {
  if (!secret) return "";
  const [ivValue, tagValue, encryptedValue] = secret.split(".");
  if (!ivValue || !tagValue || !encryptedValue) throw new Error("A stored support credential is malformed.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export async function getWhatsAppSettings(admin: SupabaseClient) {
  const { data, error } = await admin.from("whatsapp_support_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();
  if (error) throw new Error(`Could not load WhatsApp settings: ${error.message}`);
  return data as WhatsAppSettings | null;
}

export function publicWhatsAppSettings(settings: WhatsAppSettings | null) {
  return {
    businessPhoneNumber: settings?.business_phone_number ?? "",
    businessAccountId: settings?.business_account_id ?? "",
    phoneNumberId: settings?.phone_number_id ?? "",
    displayName: settings?.display_name ?? "VELTO Support",
    graphApiVersion: settings?.graph_api_version ?? "",
    supportAvailable: settings?.support_available ?? true,
    welcomeMessage: settings?.welcome_message ?? "",
    supportHours: settings?.support_hours ?? {},
    approvedTemplates: settings?.approved_templates ?? [],
    hasAccessToken: Boolean(settings?.encrypted_access_token),
    hasAppSecret: Boolean(settings?.encrypted_app_secret),
    hasVerifyToken: Boolean(settings?.encrypted_verify_token),
    encryptionReady: isSupportConfigEncryptionReady(),
  };
}

export async function saveWhatsAppSettings(
  admin: SupabaseClient,
  userId: string,
  input: {
    businessPhoneNumber: string;
    businessAccountId: string;
    phoneNumberId: string;
    displayName: string;
    graphApiVersion: string;
    supportAvailable: boolean;
    welcomeMessage: string;
    supportHours: Record<string, unknown>;
    approvedTemplates: WhatsAppTemplate[];
    accessToken?: string;
    appSecret?: string;
    verifyToken?: string;
  },
) {
  const current = await getWhatsAppSettings(admin);
  const encrypted_access_token = input.accessToken
    ? encryptSupportSecret(input.accessToken)
    : current?.encrypted_access_token ?? null;
  const encrypted_app_secret = input.appSecret
    ? encryptSupportSecret(input.appSecret)
    : current?.encrypted_app_secret ?? null;
  const encrypted_verify_token = input.verifyToken
    ? encryptSupportSecret(input.verifyToken)
    : current?.encrypted_verify_token ?? null;

  const { error } = await admin.from("whatsapp_support_settings").upsert({
    id: true,
    business_phone_number: input.businessPhoneNumber,
    business_account_id: input.businessAccountId,
    phone_number_id: input.phoneNumberId,
    display_name: input.displayName,
    graph_api_version: input.graphApiVersion,
    encrypted_access_token,
    encrypted_app_secret,
    encrypted_verify_token,
    support_available: input.supportAvailable,
    welcome_message: input.welcomeMessage,
    support_hours: input.supportHours,
    approved_templates: input.approvedTemplates,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (error) throw new Error(`Could not save WhatsApp settings: ${error.message}`);
}

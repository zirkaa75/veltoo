import "server-only";

import { decryptSupportSecret, type WhatsAppSettings } from "./whatsapp-config";

type CloudMessage = { id?: string };

type CloudError = {
  error?: {
    message?: string;
    code?: number;
    is_transient?: boolean;
  };
};

function getCredentials(settings: WhatsAppSettings) {
  const token = decryptSupportSecret(settings.encrypted_access_token);
  if (!token || !settings.phone_number_id || !settings.graph_api_version) {
    throw new Error("WhatsApp Cloud API credentials, Phone Number ID, and Graph API version must be configured.");
  }
  if (!/^v\d+\.\d+$/.test(settings.graph_api_version)) {
    throw new Error("The configured WhatsApp Graph API version is invalid.");
  }
  return {
    token,
    endpoint: `https://graph.facebook.com/${settings.graph_api_version}`,
  };
}

async function graphRequest(url: string, token: string, init: RequestInit) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      throw new Error(`WhatsApp Cloud API network request failed: ${error instanceof Error ? error.message : "unknown error"}`);
    }

    const text = await response.text();
    let payload: Record<string, unknown> = {};
    try {
      payload = text ? JSON.parse(text) as Record<string, unknown> : {};
    } catch {
      throw new Error(`WhatsApp Cloud API returned an invalid response (HTTP ${response.status}).`);
    }
    if (response.ok) return payload;

    const cloudError = (payload as CloudError).error;
    const retryAfter = Number(response.headers.get("retry-after") ?? "1");
    if (response.status === 429 && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(Math.max(retryAfter, 1), 5) * 1000));
      continue;
    }
    const message = typeof cloudError?.message === "string"
      ? cloudError.message
      : `HTTP ${response.status}`;
    throw new Error(`WhatsApp Cloud API rejected the request: ${message}`);
  }
  throw new Error("WhatsApp Cloud API rate limit retries were exhausted.");
}

async function uploadMedia(settings: WhatsAppSettings, file: File) {
  const { token, endpoint } = getCredentials(settings);
  const form = new FormData();
  form.set("messaging_product", "whatsapp");
  form.set("type", file.type);
  form.set("file", file, file.name);
  const payload = await graphRequest(
    `${endpoint}/${encodeURIComponent(settings.phone_number_id)}/media`,
    token,
    { method: "POST", body: form },
  );
  if (typeof payload.id !== "string") throw new Error("WhatsApp Cloud API did not return a media ID.");
  return payload.id;
}

export async function sendWhatsAppMessage(
  settings: WhatsAppSettings,
  recipient: string,
  input: { text?: string; template?: { name: string; language: string; parameters: string[] }; attachment?: File },
) {
  const { token, endpoint } = getCredentials(settings);
  let content: Record<string, unknown>;

  if (input.template) {
    content = {
      type: "template",
      template: {
        name: input.template.name,
        language: { code: input.template.language },
        ...(input.template.parameters.length ? {
          components: [{
            type: "body",
            parameters: input.template.parameters.map((text) => ({ type: "text", text })),
          }],
        } : {}),
      },
    };
  } else if (input.attachment) {
    if (input.attachment.type.startsWith("image/")) {
      if (!["image/jpeg", "image/png"].includes(input.attachment.type)) {
        throw new Error("WhatsApp only accepts JPEG or PNG images for image messages.");
      }
    }
    const mediaId = await uploadMedia(settings, input.attachment);
    if (input.attachment.type.startsWith("image/")) {
      content = { type: "image", image: { id: mediaId, caption: input.text || undefined } };
    } else {
      content = {
        type: "document",
        document: { id: mediaId, filename: input.attachment.name, caption: input.text || undefined },
      };
    }
  } else {
    const text = input.text?.trim();
    if (!text || text.length > 4096) throw new Error("WhatsApp text messages must contain 1–4096 characters.");
    content = { type: "text", text: { body: text } };
  }

  const payload = await graphRequest(
    `${endpoint}/${encodeURIComponent(settings.phone_number_id)}/messages`,
    token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: recipient,
        ...content,
      }),
    },
  );
  const messages = payload.messages as CloudMessage[] | undefined;
  const messageId = messages?.[0]?.id;
  if (typeof messageId !== "string") throw new Error("WhatsApp Cloud API did not return a message ID.");
  return messageId;
}

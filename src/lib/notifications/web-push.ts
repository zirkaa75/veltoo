import "server-only";

import { sendNotification, setVapidDetails, type PushSubscription, type WebPushError } from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

export async function sendPlatformPush(title: string, body: string, url = "/admin/notifications") {
  const subject = process.env.WEB_PUSH_SUBJECT;
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) return { configured: false, sent: 0 };

  let admin;
  try {
    admin = createAdminClient();
    setVapidDetails(subject, publicKey, privateKey);
  } catch (error) {
    console.error("Platform browser push is not configured correctly:", error);
    return { configured: true, sent: 0 };
  }

  const { data: subscriptions, error } = await admin
    .from("platform_push_subscriptions")
    .select("endpoint,subscription");
  if (error) {
    console.error("Could not load Super Admin browser push subscriptions:", error.message);
    return { configured: true, sent: 0 };
  }

  const payload = JSON.stringify({ title, body, url });
  const results = await Promise.all((subscriptions ?? []).map(async (row) => {
    try {
      await sendNotification(row.subscription as PushSubscription, payload, { TTL: 3600 });
      return true;
    } catch (pushError) {
      const status = (pushError as WebPushError).statusCode;
      if (status === 404 || status === 410) {
        const { error: deleteError } = await admin
          .from("platform_push_subscriptions")
          .delete()
          .eq("endpoint", row.endpoint);
        if (deleteError) console.error("Could not remove expired browser push subscription:", deleteError.message);
      } else {
        console.error("Could not deliver a Super Admin browser push:", pushError);
      }
      return false;
    }
  }));

  return { configured: true, sent: results.filter(Boolean).length };
}

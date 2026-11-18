declare module "web-push" {
  export type PushSubscription = {
    endpoint: string;
    expirationTime?: number | null;
    keys: {
      auth: string;
      p256dh: string;
    };
  };

  export type SendNotificationOptions = {
    TTL?: number;
  };

  export type WebPushError = Error & {
    statusCode?: number;
  };

  export function setVapidDetails(
    subject: string,
    publicKey: string,
    privateKey: string,
  ): void;

  export function sendNotification(
    subscription: PushSubscription,
    payload?: string,
    options?: SendNotificationOptions,
  ): Promise<unknown>;
}

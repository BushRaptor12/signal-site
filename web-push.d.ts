declare module "web-push" {
  export type PushSubscription = {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  };

  type SendNotificationOptions = {
    TTL?: number;
    urgency?: "very-low" | "low" | "normal" | "high";
  };

  type WebPushApi = {
    setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
    sendNotification(
      subscription: PushSubscription,
      payload?: string,
      options?: SendNotificationOptions
    ): Promise<void>;
  };

  const webpush: WebPushApi;
  export default webpush;
}

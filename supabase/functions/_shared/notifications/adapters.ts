// @ts-types="npm:@types/web-push@3.6.4"
import * as webpush from "npm:web-push@4.0.0";
import { ready, validSubscription } from "./core.ts";
import type { Env } from "./server.ts";
export class DeliveryError extends Error {
  constructor(public code: string, public retryable = false, public ambiguous = false, public stale = false) { super(code); }
}
export interface Mail { to: string; subject: string; html: string; text: string; headers?: Record<string, string> }
export interface Push { endpoint: string; keys: { p256dh: string; auth: string } }
export function adapters(env: Env, sendFetch: typeof fetch = fetch, pushSend = webpush.sendNotification) {
  return {
    async email(mail: Mail, key: string): Promise<string> {
      if (!ready(env,{email_enabled:true}).email_ready) throw new DeliveryError("email_unconfigured");
      let response: Response;
      try {
        response = await sendFetch("https://api.resend.com/emails", {
          method: "POST", headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json", "Idempotency-Key": key },
          body: JSON.stringify({ from: env.NEWSLETTER_FROM, ...mail }), signal: AbortSignal.timeout(12000), redirect: "error",
        });
      } catch { throw new DeliveryError("email_network", true, true); }
      if (!response.ok) {
        // Resend's concurrent-idempotency conflict is safe to retry; mismatched payload is terminal.
        const data = await response.json().catch(() => ({}));
        const retryable = response.status === 429 || response.status >= 500 || (response.status === 409 && data.name === "concurrent_idempotent_requests");
        throw new DeliveryError("email_http_" + response.status, retryable);
      }
      const data = await response.json().catch(() => ({}));
      if (!data.id) throw new DeliveryError("email_unknown_result", true, true);
      return String(data.id).slice(0,160);
    },
    async push(subscription: Push, payload: Record<string, unknown>): Promise<string> {
      if (!ready(env,{push_enabled:true}).push_ready) throw new DeliveryError("push_unconfigured");
      if (!validSubscription(subscription)) throw new DeliveryError("invalid_subscription", false, false, true);
      try {
        await pushSend(subscription, JSON.stringify(payload), {
          vapidDetails: { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY },
          TTL: 1800, urgency: payload.is_breaking ? "high" : "normal", timeout: 12000,
        });
        return "accepted";
      } catch (error) {
        const status = Number((error as { statusCode?: number })?.statusCode || 0);
        if (status === 404 || status === 410) throw new DeliveryError("push_gone", false, false, true);
        if (status === 429) throw new DeliveryError("push_http_429", true);
        if (status >= 500) throw new DeliveryError("push_http_" + status, false, true);
        // No acceptance/idempotency guarantee on ambiguous Web Push transport failures.
        throw new DeliveryError(status ? "push_http_" + status : "push_unknown_result", false, !status);
      }
    },
  };
}
export type Senders = ReturnType<typeof adapters>;

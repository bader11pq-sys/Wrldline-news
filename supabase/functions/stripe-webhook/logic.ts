// Pure helpers for the Stripe webhook. No network, no secrets: unit-testable under Deno.

export type SubscriptionLike = {
  id: string;
  status: string;
  customer: unknown;
  metadata?: Record<string, string> | null;
  cancel_at_period_end?: boolean;
  current_period_end?: number | null;
  items?: { data?: Array<{ price?: { id?: string } | null }> };
};

export const HANDLED_SUBSCRIPTION_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);
export const HANDLED_INVOICE_EVENTS = new Set(["invoice.paid", "invoice.payment_failed"]);
export const HANDLED_CHECKOUT_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
]);
export const RISK_EVENTS = new Set([
  "charge.dispute.created",
  "charge.refunded",
  "radar.early_fraud_warning.created",
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function customerId(value: unknown): string | null {
  if (typeof value === "string" && value) return value;
  if (value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string") {
    return (value as { id: string }).id;
  }
  return null;
}

export function allowedPriceIds(env: (name: string) => string | undefined): Set<string> {
  const ids = [env("STRIPE_PRICE_ID_MONTHLY"), env("STRIPE_PRICE_ID_YEARLY")]
    .map((v) => String(v || "").trim()).filter(Boolean);
  return new Set(ids);
}

/** Decide which Supabase user a subscription belongs to.
 * A user already bound to the Stripe customer in our database always wins; metadata is only trusted when
 * no binding exists, and a conflicting metadata value is reported instead of silently accepted. */
export function resolveUser(
  boundUserId: string | null | undefined,
  metadataUserId: string | null | undefined,
): { userId: string | null; conflict: boolean } {
  const meta = metadataUserId && UUID_RE.test(metadataUserId) ? metadataUserId.toLowerCase() : null;
  const bound = boundUserId && UUID_RE.test(boundUserId) ? boundUserId.toLowerCase() : null;
  if (bound && meta && bound !== meta) return { userId: bound, conflict: true };
  return { userId: bound || meta, conflict: false };
}

export function rpcArgs(
  event: { id: string; type: string; created: number },
  sub: SubscriptionLike,
  userId: string | null,
  allowed: Set<string>,
) {
  const priceId = sub.items?.data?.[0]?.price?.id || null;
  return {
    p_event_id: event.id,
    p_event_type: event.type,
    p_event_created: new Date(event.created * 1000).toISOString(),
    p_user_id: userId,
    p_customer_id: customerId(sub.customer),
    p_subscription_id: sub.id || null,
    p_price_id: priceId,
    p_price_allowed: !!priceId && allowed.has(priceId),
    p_status: sub.status,
    p_period_end: typeof sub.current_period_end === "number" && sub.current_period_end > 0
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null,
    p_cancel_at_period_end: sub.cancel_at_period_end === true,
  };
}

/** Signature failures are client errors (400); our own processing failures must be 500 so Stripe retries. */
export function statusForError(stage: "signature" | "processing"): number {
  return stage === "signature" ? 400 : 500;
}

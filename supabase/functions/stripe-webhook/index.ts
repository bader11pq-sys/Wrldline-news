import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  allowedPriceIds,
  customerId,
  HANDLED_CHECKOUT_EVENTS,
  HANDLED_INVOICE_EVENTS,
  HANDLED_SUBSCRIPTION_EVENTS,
  resolveUser,
  RISK_EVENTS,
  rpcArgs,
  statusForError,
} from "./logic.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2025-02-24.acacia" });
const cryptoProvider = Stripe.createSubtleCryptoProvider();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const signature = req.headers.get("Stripe-Signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  // Stage 1: authenticity. A failure here is the caller's fault (400).
  let event: Stripe.Event;
  try {
    const raw = await req.text();
    event = await stripe.webhooks.constructEventAsync(
      raw, signature, Deno.env.get("STRIPE_WEBHOOK_SECRET")!, 300, cryptoProvider,
    );
  } catch (error) {
    console.error("stripe webhook signature:", String(error).slice(0, 200));
    return new Response("Invalid signature", { status: statusForError("signature") });
  }

  // Stage 2: processing. Failures return 500 so Stripe retries; the ledger makes retries idempotent.
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const allowed = allowedPriceIds((name) => Deno.env.get(name));

    const apply = async (subscriptionId: string, hintedUserId?: string | null) => {
      // Always use Stripe's canonical, current subscription state rather than the event snapshot.
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      const cid = customerId(sub.customer);
      let bound: string | null = null;
      if (cid) {
        const { data, error } = await db.from("subscriptions").select("user_id").eq("stripe_customer_id", cid).maybeSingle();
        if (error) throw error;
        bound = data?.user_id ?? null;
      }
      const { userId, conflict } = resolveUser(bound, hintedUserId || sub.metadata?.supabase_user_id || null);
      if (conflict) console.warn("stripe webhook: metadata user differs from bound customer user", event.id);
      const { data, error } = await db.rpc("apply_stripe_subscription_event", rpcArgs(event, sub as never, userId, allowed));
      if (error) throw error;
      if (typeof data === "string" && data.startsWith("rejected")) console.warn("stripe webhook rejected", event.id, data);
      return data as string;
    };

    let outcome = "ignored";
    if (HANDLED_CHECKOUT_EVENTS.has(event.type)) {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.mode === "subscription" && typeof s.subscription === "string") {
        outcome = await apply(s.subscription, s.client_reference_id || s.metadata?.supabase_user_id || null);
      }
    } else if (HANDLED_SUBSCRIPTION_EVENTS.has(event.type)) {
      outcome = await apply((event.data.object as Stripe.Subscription).id);
    } else if (HANDLED_INVOICE_EVENTS.has(event.type)) {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : null;
      if (subscriptionId) outcome = await apply(subscriptionId);
    } else if (RISK_EVENTS.has(event.type)) {
      const obj = event.data.object as { id?: string };
      console.warn("WRLDLINE billing risk event requires review", event.type, obj.id || "unknown");
      outcome = "risk_logged";
    }
    return json({ received: true, outcome });
  } catch (error) {
    console.error("stripe webhook processing:", String(error).slice(0, 300));
    return new Response("Webhook processing failed", { status: statusForError("processing") });
  }
});

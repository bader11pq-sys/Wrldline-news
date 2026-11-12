# Accounts, profiles and subscriptions

## Included
- Supabase Auth email/password sign-up, sign-in, email confirmation and password reset.
- User-owned profile data protected by Row Level Security.
- Free and WRLDLINE PLUS plans; subscription state is writable only by trusted server-side webhook code.
- Stripe Checkout and Billing Portal Edge Functions. The browser never receives Stripe secret keys or controls entitlement state.

## 1. Apply the database migration
Open Supabase Dashboard → SQL Editor and run:
`supabase/migrations/202611120001_accounts_subscriptions.sql`

## 2. Configure Supabase Auth
- Enable Email provider.
- Configure Site URL as `https://al-ghaib.us.ci`.
- Add `https://al-ghaib.us.ci/account.html` to allowed redirect URLs.
- Configure SMTP for production email delivery and set suitable confirmation/password policies.

## 3. Configure Stripe before enabling paid checkout
The live Stripe catalog has been created:
- Product: `prod_Vc7f2bsyLOJFUW` — WRLDLINE PLUS
- Monthly: `price_1UatQQPGptBsofwHNagEdVKY` — USD 5.00 every month
- Annual: `price_1UatQSPGptBsofwHjl6fGOz2` — USD 29.99 every year

The Customer Portal configuration is active and allows profile email/name updates, payment-method updates, invoice history, and cancellation at the end of the current billing period.

Deploy the three functions:
- `create-checkout-session`
- `create-billing-portal`
- `stripe-webhook`

Set Edge Function secrets:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID_MONTHLY=price_1UatQQPGptBsofwHNagEdVKY`
- `STRIPE_PRICE_ID_YEARLY=price_1UatQSPGptBsofwHjl6fGOz2`
- `SITE_URL=https://al-ghaib.us.ci`

Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions as platform environment variables; do not copy privileged keys into the repository or browser.

Create a Stripe webhook endpoint at:
`https://vmaxbnogmmfyrcucapnq.supabase.co/functions/v1/stripe-webhook`
Live endpoint ID: `we_1UatQbPGptBsofwHZ7X4nb6S`. It is configured with API version `2025-02-24.acacia` and listens for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, `charge.dispute.created`, `charge.refunded`, and `radar.early_fraud_warning.created`. Reveal its signing secret in Stripe Dashboard and save it as `STRIPE_WEBHOOK_SECRET` in Supabase Edge Function secrets. Never commit this value.

Deploy with Supabase CLI (from the repository root):
```sh
supabase functions deploy create-checkout-session
supabase functions deploy create-billing-portal
supabase functions deploy stripe-webhook --no-verify-jwt
```
The webhook must accept Stripe's signature-verified request without a Supabase user JWT; signature verification is performed inside the function.

## Security notes
- Never put Stripe secret keys or the Supabase service-role key in HTML/JavaScript or Git.
- The subscriptions table deliberately has no client write policy. Only the service-role webhook may update paid status.
- Configure Supabase Auth email templates and production SMTP before public launch.
- Paid plan pricing is defined by the live Stripe Price IDs above. Amounts are USD 5.00 monthly and USD 29.99 annually.
- Automatic tax calculation is not enabled, per the merchant instruction. This does not remove any tax registration, collection, or reporting obligations that may apply.
- A successful redirect from checkout does not itself grant Plus. The verified webhook is the source of truth.

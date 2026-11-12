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
Create two recurring Stripe Prices for WRLDLINE PLUS (monthly and yearly), then deploy the three functions:
- `create-checkout-session`
- `create-billing-portal`
- `stripe-webhook`

Set Edge Function secrets:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID_MONTHLY`
- `STRIPE_PRICE_ID_YEARLY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SITE_URL=https://al-ghaib.us.ci`

Create a Stripe webhook endpoint at:
`https://vmaxbnogmmfyrcucapnq.supabase.co/functions/v1/stripe-webhook`
Subscribe to `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`. Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.

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
- Paid plan pricing is defined by Stripe Price IDs; no price is fabricated in the UI.
- A successful redirect from checkout does not itself grant Plus. The verified webhook is the source of truth.

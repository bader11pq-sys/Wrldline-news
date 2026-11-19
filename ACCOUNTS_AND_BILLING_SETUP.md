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

## 3. Enable social sign-in (Google and Apple)

The account page now provides **Continue with Google** and **Continue with Apple** using Supabase Auth OAuth. These are identity providers; Apple Pay is a separate payment wallet.

Supabase project:
- Project: `vmaxbnogmmfyrcucapnq`
- Site URL: `https://al-ghaib.us.ci`
- Add this exact URL under Authentication → URL Configuration → Redirect URLs: `https://al-ghaib.us.ci/account.html`
- Provider callback URL (use this as the OAuth callback in both providers): `https://vmaxbnogmmfyrcucapnq.supabase.co/auth/v1/callback`

### Google
1. In Google Cloud Console, create an OAuth Client ID of type **Web application**.
2. Add `https://al-ghaib.us.ci` as an Authorized JavaScript origin.
3. Add the Supabase callback URL above as an Authorized redirect URI.
4. Copy the Google Client ID and Client Secret.
5. In Supabase Dashboard → Authentication → Providers → Google, enable Google and enter those two values.

### Apple
1. An Apple Developer account is required. Create/choose an App ID and enable **Sign in with Apple**.
2. Create a **Services ID** and configure its domain as `al-ghaib.us.ci` and its Return URL as the Supabase callback URL above.
3. Create a Sign in with Apple key and keep the downloaded `.p8` private key secure. Record the Apple Team ID and Key ID.
4. In Supabase Dashboard → Authentication → Providers → Apple, enable Apple and provide the Services ID (Client ID) and the generated Apple client secret/JWT, with the required Team ID, Key ID and private key values.
5. Apple OAuth may not return a user's full name. The account profile lets the user add or edit their display name after signing in. Plan to renew the Apple client secret before its six-month expiry.

Do not place either provider's client secret, Apple `.p8` key, or JWT in Git, HTML, browser JavaScript, or public configuration. Configure them only in the corresponding provider dashboard.

## 4. Apple Pay and other payment methods

WRLDLINE already uses a **Stripe-hosted Checkout Session** for monthly and annual PLUS subscriptions. The server intentionally does not hard-code `payment_method_types`, allowing Stripe Checkout to dynamically present the payment methods enabled and eligible for the customer.

- Apple Pay is a payment wallet, not an identity provider. Stripe Checkout supports Apple Pay and Google Pay out of the box for eligible devices/browsers.
- In Stripe Dashboard, open Business settings / Payment methods and confirm Apple Pay (and Google Pay, where available) are enabled for this Stripe account.
- The current flow redirects customers to Stripe-hosted Checkout. A custom Stripe Checkout domain is optional; domain registration is required for Apple Pay when using Stripe Elements or embedded Checkout on WRLDLINE's own origin.
- The payment page decides which methods to show based on Stripe account configuration, customer country, browser/device eligibility and payment rules. Do not promise that every customer will see every wallet.
- Keep card payment support available as the fallback. The existing Stripe Billing Portal lets subscribers update their payment methods and manage invoices/cancellation.

The existing prices are USD 5.00 monthly and USD 29.99 yearly. Do not switch the currency or add Mada/local acquiring without confirming the Stripe account's registered country, available payment methods, settlement currency and tax setup.

## 5. Configure Stripe before enabling paid checkout
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

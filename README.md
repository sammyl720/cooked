# The Chat Receipt

The Chat Receipt is a mobile-first dating-chat game: paste a two-person conversation or upload a screenshot, verify every message and speaker, then get a bounded read of the visible signals. It never treats the score as odds of attraction and never puts chat content in a share card or challenge record.

## What is included

- Conservative paste parsing and an editable, reorderable `Me` / `Them` review step
- PNG, JPEG, and WebP validation plus an optional OpenAI vision OCR adapter
- TypeSafe AI Jev evaluation using `@typesafe-ai/sdk` and `jev-latest`
- Versioned `cooked_v1` scoring retained for challenge compatibility, deterministic phrases, runtime response validation, and tests
- Evidence-backed result explanations with exact-message quotes, confidence framing, a recommended next move, and optional tone-based reply starters
- Insufficient-evidence and safety suppression paths
- 1080 × 1920 transcript-free PNG cards with native share/download fallbacks
- Signed, 30-day, score-only challenges backed by D1
- Anonymous rotating rate-limit keys and content-free funnel events
- Optional no-account paid read packs with Stripe Checkout, signed webhooks, and idempotent D1 fulfillment
- Keyboard labels, visible focus states, reduced-motion support, and responsive layouts
- A browser WebMCP tool that stages text in the review editor without analyzing it

## Local setup

Requires Node.js 22.13 or newer.

```sh
npm install
cp .env.example .env.local
npm run db:generate
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_large_wallop.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_messy_norman_osborn.sql
npm run dev
```

Open the local URL printed by the dev server. Do not replay a migration already applied to the same local D1 state.

## Environment

- `TYPESAFE_API_KEY`: enables live Jev scoring. Without it, the UI visibly identifies deterministic demo scoring.
- `OPENAI_API_KEY`: enables screenshot text extraction through the Responses API with `store: false`.
- `OCR_MODEL`: optional vision model override; defaults to `gpt-6-astra`.
- `CHALLENGE_SIGNING_SECRET`: HMAC secret for short-lived result proofs.
- `RATE_LIMIT_SALT`: secret used to rotate anonymous network-key hashes.
- `BILLING_ENABLED`: explicit billing kill switch. Set to `true` only after the live provider and Stripe setup below are complete.
- `STRIPE_SECRET_KEY`: server-side Stripe secret key.
- `STRIPE_WEBHOOK_SECRET`: signing secret for the production `/api/billing/webhook` endpoint.
- `STRIPE_PRICE_ID`: a one-time Stripe Price used by Checkout.
- `BILLING_FREE_READS`: initial browser allowance; defaults to `3`.
- `BILLING_PACK_CREDITS`: reads granted per successful purchase; defaults to `25`.
- `BILLING_PRICE_DISPLAY`: UI copy only; defaults to `$4.99`. The Stripe Price remains authoritative.
- `STRIPE_AUTOMATIC_TAX`: set to `true` after Stripe Tax is configured; defaults to `false`.

Provider keys stay server-side. Raw messages and screenshots are never written to D1, analytics, URLs, challenge records, or share assets.

## Monetization setup

The paid path is fail-closed and hidden until every prerequisite is present. It uses a one-time read pack so the core flow remains account-free. Credits are attached to an HTTP-only browser cookie and stored in D1; only scored results consume one credit.

1. In Stripe, create a product named `The Chat Receipt read pack` and a one-time USD Price for the amount shown in `BILLING_PRICE_DISPLAY`.
2. Register `https://<your-site>/api/billing/webhook` in Stripe for `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
3. Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, the matching pack values, and `BILLING_ENABLED=true` to the hosted environment. `TYPESAFE_API_KEY` must also be configured; demo scoring is never sold.
4. Configure Stripe’s public business details, support contact, statement descriptor, receipts, refund policy, and tax behavior before accepting live payments.
5. Complete one test-mode purchase, confirm the credit balance increases exactly once, use a credit, retry the same webhook, and confirm it is not granted twice before switching Stripe to live mode.

Stripe-hosted Checkout creates a new Session for each purchase. Fulfillment is driven by a verified webhook and reinforced by an idempotent confirmation call after the browser returns from Checkout; the success redirect is never trusted as proof of payment.

## Quality checks

```sh
npm test
npx tsc --noEmit
npm run build
```

The automated policy suite covers score thresholds, ambiguity/low-confidence suppression, malformed and partial Jev responses, evidence-backed guidance, explicit-plan phrasing versus “maybe sometime,” paste parsing, and monologue rejection.

## Demo conversation

```text
Me: Free Thursday? I know a place with dangerously good fries.
Them: Okay, bold claim 😂
Them: I'm free after 7. Send me the place?
Me: 7:30 at June's?
Them: It's a date.
```

The demo button loads this fixture. Demo mode never claims the result came from live Jev.

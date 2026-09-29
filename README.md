# Cooked?

Cooked? is a mobile-first dating-chat game: paste a two-person conversation or upload a screenshot, verify every message and speaker, then get a bounded read of the visible signals. It never treats the score as odds of attraction and never puts chat content in a share card or challenge record.

## What is included

- Conservative paste parsing and an editable, reorderable `Me` / `Them` review step
- PNG, JPEG, and WebP validation plus an optional OpenAI vision OCR adapter
- TypeSafe AI Jev evaluation using `@typesafe-ai/sdk` and `jev-latest`
- Versioned `cooked_v1` scoring, deterministic phrases, runtime response validation, and tests
- Insufficient-evidence and safety suppression paths
- 1080 × 1920 transcript-free PNG cards with native share/download fallbacks
- Signed, 30-day, score-only challenges backed by D1
- Anonymous rotating rate-limit keys and content-free funnel events
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
npm run dev
```

Open the local URL printed by the dev server. Do not replay a migration already applied to the same local D1 state.

## Environment

- `TYPESAFE_API_KEY`: enables live Jev scoring. Without it, the UI visibly identifies deterministic demo scoring.
- `OPENAI_API_KEY`: enables screenshot text extraction through the Responses API with `store: false`.
- `OCR_MODEL`: optional vision model override; defaults to `gpt-6-astra`.
- `CHALLENGE_SIGNING_SECRET`: HMAC secret for short-lived result proofs.
- `RATE_LIMIT_SALT`: secret used to rotate anonymous network-key hashes.

Provider keys stay server-side. Raw messages and screenshots are never written to D1, analytics, URLs, challenge records, or share assets.

## Quality checks

```sh
npm test
npx tsc --noEmit
npm run build
```

The automated policy suite covers score thresholds, ambiguity/low-confidence suppression, malformed and partial Jev responses, explicit-plan phrasing versus “maybe sometime,” paste parsing, and monologue rejection.

## Demo conversation

```text
Me: Free Thursday? I know a place with dangerously good fries.
Them: Okay, bold claim 😂
Them: I'm free after 7. Send me the place?
Me: 7:30 at June's?
Them: It's a date.
```

The demo button loads this fixture. Demo mode never claims the result came from live Jev.

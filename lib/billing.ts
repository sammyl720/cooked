import { env } from "cloudflare:workers";
import Stripe from "stripe";

const ACCESS_COOKIE = "cooked_access";
const PACK_CODE = "read_pack";
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

export type BillingStatus = {
  enabled: boolean;
  credits: number | null;
  freeReads: number;
  packCredits: number;
  priceDisplay: string;
  checkoutEnabled: boolean;
  browserBound: true;
};

type BillingAccount = {
  accountHash: string;
  credits: number;
  setCookie?: string;
};

type BillingConfig = {
  enabled: boolean;
  freeReads: number;
  packCredits: number;
  priceDisplay: string;
  automaticTax: boolean;
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  stripePriceId?: string;
};

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getBillingConfig(): BillingConfig {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripePriceId = process.env.STRIPE_PRICE_ID;
  const providerReady = Boolean(process.env.TYPESAFE_API_KEY);
  const configured = Boolean(stripeSecretKey && stripeWebhookSecret && stripePriceId && providerReady);
  return {
    enabled: process.env.BILLING_ENABLED === "true" && configured,
    freeReads: positiveInteger(process.env.BILLING_FREE_READS, 3),
    packCredits: positiveInteger(process.env.BILLING_PACK_CREDITS, 25),
    priceDisplay: process.env.BILLING_PRICE_DISPLAY?.trim() || "$4.99",
    automaticTax: process.env.STRIPE_AUTOMATIC_TAX === "true",
    stripeSecretKey,
    stripeWebhookSecret,
    stripePriceId,
  };
}

export function getStripeClient() {
  const { stripeSecretKey } = getBillingConfig();
  if (!stripeSecretKey) throw new Error("Stripe is not configured.");
  return new Stripe(stripeSecretKey, { httpClient: Stripe.createFetchHttpClient() });
}

function cookieValue(request: Request) {
  const cookies = request.headers.get("cookie") || "";
  const match = cookies.match(new RegExp(`(?:^|;\\s*)${ACCESS_COOKIE}=([^;]+)`));
  if (!match) return null;
  try {
    const value = decodeURIComponent(match[1]);
    return /^[A-Za-z0-9_-]{40,64}$/.test(value) ? value : null;
  } catch {
    return null;
  }
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function tokenHash(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function accessCookie(token: string, request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${ACCESS_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ONE_YEAR_SECONDS}${secure}`;
}

function database() {
  if (!env.DB) throw new Error("Billing requires the D1 `DB` binding.");
  return env.DB;
}

export async function getOrCreateBillingAccount(request: Request): Promise<BillingAccount> {
  const existingToken = cookieValue(request);
  const token = existingToken || randomToken();
  const accountHash = await tokenHash(token);
  const now = Date.now();
  const { freeReads } = getBillingConfig();
  const db = database();
  await db.prepare(
    "INSERT OR IGNORE INTO billing_accounts (account_hash, credits, created_at, updated_at) VALUES (?, ?, ?, ?)"
  ).bind(accountHash, freeReads, now, now).run();
  const account = await db.prepare(
    "SELECT credits FROM billing_accounts WHERE account_hash = ? LIMIT 1"
  ).bind(accountHash).first<{ credits: number }>();
  if (!account) throw new Error("Billing account could not be initialized.");
  return { accountHash, credits: account.credits, setCookie: accessCookie(token, request) };
}

export async function getBillingStatus(request: Request): Promise<{ status: BillingStatus; setCookie?: string }> {
  const config = getBillingConfig();
  if (!config.enabled) {
    return {
      status: {
        enabled: false,
        credits: null,
        freeReads: config.freeReads,
        packCredits: config.packCredits,
        priceDisplay: config.priceDisplay,
        checkoutEnabled: false,
        browserBound: true,
      },
    };
  }
  const account = await getOrCreateBillingAccount(request);
  return {
    status: {
      enabled: true,
      credits: account.credits,
      freeReads: config.freeReads,
      packCredits: config.packCredits,
      priceDisplay: config.priceDisplay,
      checkoutEnabled: true,
      browserBound: true,
    },
    setCookie: account.setCookie,
  };
}

export async function reserveAnalysisCredit(request: Request) {
  const config = getBillingConfig();
  if (!config.enabled) return { enabled: false as const };
  const account = await getOrCreateBillingAccount(request);
  const row = await database().prepare(
    "UPDATE billing_accounts SET credits = credits - 1, updated_at = ? WHERE account_hash = ? AND credits > 0 RETURNING credits"
  ).bind(Date.now(), account.accountHash).first<{ credits: number }>();
  return {
    enabled: true as const,
    reserved: Boolean(row),
    accountHash: account.accountHash,
    credits: row?.credits ?? account.credits,
    setCookie: account.setCookie,
  };
}

export async function refundAnalysisCredit(accountHash: string) {
  await database().prepare(
    "UPDATE billing_accounts SET credits = credits + 1, updated_at = ? WHERE account_hash = ?"
  ).bind(Date.now(), accountHash).run();
}

export async function fulfillCheckoutSession(session: Stripe.Checkout.Session, eventId: string) {
  const config = getBillingConfig();
  if (session.payment_status !== "paid") return false;
  if (session.metadata?.plan !== PACK_CODE) return false;
  const accountHash = session.client_reference_id;
  if (!accountHash || !/^[a-f0-9]{64}$/.test(accountHash)) return false;

  const now = Date.now();
  const db = database();
  await db.batch([
    db.prepare(
      "INSERT OR IGNORE INTO billing_accounts (account_hash, credits, created_at, updated_at) VALUES (?, ?, ?, ?)"
    ).bind(accountHash, config.freeReads, now, now),
    db.prepare(
      "INSERT OR IGNORE INTO billing_purchases (stripe_session_id, stripe_event_id, account_hash, credits, amount_total, currency, created_at, applied_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)"
    ).bind(session.id, eventId, accountHash, config.packCredits, session.amount_total, session.currency, now),
    db.prepare(
      "UPDATE billing_accounts SET credits = credits + ?, updated_at = ? WHERE account_hash = ? AND EXISTS (SELECT 1 FROM billing_purchases WHERE stripe_session_id = ? AND applied_at IS NULL)"
    ).bind(config.packCredits, now, accountHash, session.id),
    db.prepare(
      "UPDATE billing_purchases SET applied_at = ? WHERE stripe_session_id = ? AND applied_at IS NULL"
    ).bind(now, session.id),
  ]);
  return true;
}

export const BILLING_PACK_CODE = PACK_CODE;

"use client";

import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown, ArrowUp, Camera, Check, CheckCircle2, ChevronLeft, CircleAlert, Copy, CreditCard, Download, GripVertical,
  Image as ImageIcon, Link2, LoaderCircle, LockKeyhole, MessageCircleMore, Plus, RotateCcw,
  Send, Share2, ShieldCheck, Sparkles, Trash2, Upload, X, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";
import { MAX_CHARS, parsePastedText } from "@/lib/conversation";
import type { AnalyzeResponse, DraftTurn, ScoredResult, Speaker } from "@/lib/domain";

const DEMO = `Me: Free Thursday? I know a place with dangerously good fries.
Them: Okay, bold claim 😂
Them: I'm free after 7. Send me the place?
Me: 7:30 at June's?
Them: It's a date.`;

type Screen = "input" | "review" | "processing" | "result" | "insufficient" | "safety";
type Challenge = { index: number; label: string; mode: string; resultVersion: string; expiresAt: number };
type OcrPayload = { text?: string; suggestedTurns?: DraftTurn[]; warnings?: string[]; error?: string };
type ChallengePayload = { url?: string; error?: string };
type BillingStatus = { enabled: boolean; credits: number | null; freeReads: number; packCredits: number; priceDisplay: string; checkoutEnabled: boolean; browserBound: true };
type AnalyzePayload = AnalyzeResponse & { error?: string; code?: string; billing?: BillingStatus };

const emit = (event: string, properties?: Record<string, string | number | boolean>) => {
  void fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event, properties }), keepalive: true });
};

function Header({ onReset, billing, onUpgrade }: { onReset?: () => void; billing: BillingStatus | null; onUpgrade: () => void }) {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
      <button className="brand-mark" onClick={onReset} aria-label="Cooked? home">Cooked<span>?</span></button>
      <div className="flex items-center gap-2">
        {billing?.enabled && <button onClick={onUpgrade} className="rounded-full border-2 border-ink bg-lime px-3 py-1.5 text-sm font-black shadow-[2px_2px_0_var(--ink)]"><Zap className="mr-1 inline size-3.5" />{billing.credits} {billing.credits === 1 ? "read" : "reads"}</button>}
        <div className="rounded-full border border-ink/15 bg-white/75 px-3 py-1.5 text-sm font-bold shadow-sm">Dating <span className="text-muted-foreground">· MVP</span></div>
      </div>
    </header>
  );
}

function ChallengeStrip({ challenge, error }: { challenge: Challenge | null; error: string }) {
  if (!challenge && !error) return null;
  return (
    <div className={`mx-auto mb-4 flex w-full max-w-6xl items-center justify-between gap-4 rounded-2xl border-2 px-5 py-4 sm:px-6 ${error ? "border-ink/20 bg-white" : "border-ink bg-lime shadow-[4px_4px_0_var(--ink)]"}`}>
      <div>
        <p className="text-xs font-black uppercase tracking-[.12em]">{error ? "Challenge unavailable" : "You’ve been challenged"}</p>
        <p className="mt-1 font-bold">{error || <>Can you beat a Cooked Index of <span className="font-black">{challenge?.index}/100</span>? Lower wins.</>}</p>
      </div>
      {!error && <span className="hidden rounded-full bg-ink px-4 py-2 text-sm font-black text-white sm:block">{challenge?.label}</span>}
    </div>
  );
}

export function CookedApp({ challengeToken }: { challengeToken?: string }) {
  const [screen, setScreen] = useState<Screen>("input");
  const [rawText, setRawText] = useState("");
  const [turns, setTurns] = useState<DraftTurn[]>([]);
  const [source, setSource] = useState<"paste" | "upload">("paste");
  const [imageUrl, setImageUrl] = useState("");
  const imageUrlRef = useRef("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [plainMode, setPlainMode] = useState(false);
  const [plainDraft, setPlainDraft] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<ScoredResult | null>(null);
  const [reason, setReason] = useState("");
  const [resources, setResources] = useState("");
  const [stage, setStage] = useState({ label: "", progress: 18, operation: "jev" as "jev" | "ocr" });
  const controllerRef = useRef<AbortController | null>(null);
  const [sharePreview, setSharePreview] = useState("");
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [challengeError, setChallengeError] = useState("");
  const [challengeUrl, setChallengeUrl] = useState("");
  const [challengeBusy, setChallengeBusy] = useState(false);
  const [feedback, setFeedback] = useState<"right" | "off" | "">("");
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    imageUrlRef.current = "";
    setRawText(""); setTurns([]); setSource("paste"); setImageUrl(""); setImageFile(null);
    setPlainMode(false); setError(""); setNotice(""); setResult(null); setReason(""); setResources("");
    setSharePreview(""); setChallengeUrl(""); setFeedback(""); setScreen("input");
  }, []);

  const refreshBilling = useCallback(async () => {
    const response = await fetch("/api/billing/status", { cache: "no-store" });
    if (!response.ok) return null;
    const status = await response.json() as BillingStatus;
    setBilling(status);
    return status;
  }, []);

  useEffect(() => {
    emit("landing_view");
    void refreshBilling();
    return () => { if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current); };
  }, [refreshBilling]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    const sessionId = params.get("session_id");
    if (checkout === "canceled") {
      toast.message("Checkout canceled — nothing was charged.");
      window.history.replaceState({}, "", `${window.location.pathname}${window.location.hash}`);
      return;
    }
    if (checkout !== "success" || !sessionId) return;
    const confirm = async () => {
      try {
        const response = await fetch("/api/billing/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId }) });
        const data = await response.json() as BillingStatus & { pending?: boolean; error?: string };
        if (!response.ok) throw new Error(data.error || "We couldn’t confirm that purchase yet.");
        if (data.pending) toast.message("Payment is still processing. Your reads will appear shortly.");
        else {
          setBilling(data);
          setPaywallOpen(false);
          toast.success(`${data.packCredits} reads added. Time to read the room.`);
          emit("purchase_completed", { packCredits: data.packCredits });
        }
      } catch (caught) {
        toast.error(caught instanceof Error ? caught.message : "We couldn’t confirm that purchase yet.");
      } finally {
        window.history.replaceState({}, "", `${window.location.pathname}${window.location.hash}`);
        void refreshBilling();
      }
    };
    void confirm();
  }, [refreshBilling]);

  useEffect(() => {
    if (!challengeToken) return;
    const controller = new AbortController();
    fetch(`/api/challenges/${encodeURIComponent(challengeToken)}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as Challenge & { error?: string };
        if (!response.ok) throw new Error(data.error || "This challenge has expired or doesn’t exist.");
        setChallenge(data);
      })
      .catch((caught) => { if (caught.name !== "AbortError") setChallengeError(caught.message); });
    return () => controller.abort();
  }, [challengeToken]);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(context.registerTool({
        name: "stage_dating_chat",
        title: "Stage dating chat",
        description: "Put a two-person dating chat into the visible Cooked? review editor. This does not analyze or send it.",
        inputSchema: { type: "object", properties: { text: { type: "string", maxLength: MAX_CHARS } }, required: ["text"], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        execute(input) {
          const text = typeof (input as { text?: unknown })?.text === "string" ? (input as { text: string }).text.slice(0, MAX_CHARS) : "";
          if (!text.trim()) throw new Error("text is required");
          const parsed = parsePastedText(text);
          setRawText(text); setTurns(parsed.turns); setSource("paste"); setNotice(parsed.confident ? "" : "Assign Me or Them to each message before analysis."); setScreen("review");
          return { status: "staged", messageCount: parsed.turns.length, needsSpeakerReview: !parsed.confident };
        },
      }, { signal: lifecycle.signal })).catch(() => undefined);
    } catch { /* unsupported preview */ }
    return () => lifecycle.abort();
  }, []);

  const startTextReview = () => {
    setError("");
    const parsed = parsePastedText(rawText);
    if (parsed.turns.length < 2) { setError("Add at least two messages, one from each person."); return; }
    setTurns(parsed.turns);
    setNotice(parsed.confident ? "" : "We didn’t guess who said what. Assign each message to Me or Them.");
    setSource("paste");
    emit("input_started", { source: "paste" });
    setScreen("review");
  };

  const chooseFile = (file?: File) => {
    setError("");
    if (!file) return;
    if (!(["image/png", "image/jpeg", "image/webp"].includes(file.type)) || file.size > 8 * 1024 * 1024) {
      setError("Choose one PNG, JPEG, or WebP screenshot under 8 MB."); return;
    }
    if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    const url = URL.createObjectURL(file);
    imageUrlRef.current = url;
    setImageUrl(url); setImageFile(file); setSource("upload");
    emit("input_started", { source: "upload" });
  };

  const extractImage = async () => {
    if (!imageFile) { setError("Choose a screenshot first."); return; }
    const controller = new AbortController();
    controllerRef.current = controller;
    setError(""); setStage({ label: "OCR · Extracting ordered message text", progress: 34, operation: "ocr" }); setScreen("processing");
    const started = Date.now();
    try {
      const form = new FormData(); form.append("image", imageFile);
      const response = await fetch("/api/ocr", { method: "POST", body: form, signal: controller.signal });
      const data = await response.json() as OcrPayload;
      if (!response.ok) throw new Error(data.error || "We couldn’t extract that screenshot.");
      setTurns(data.suggestedTurns || []);
      setRawText(data.text || "");
      setNotice(["Assign Me or Them to every extracted message.", ...(data.warnings || [])].join(" "));
      emit("ocr_completed", { success: true, latencyBucket: Math.ceil((Date.now() - started) / 1000) * 1000 });
      setScreen("review");
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") { setScreen("input"); return; }
      emit("ocr_completed", { success: false });
      setTurns([{ speaker: null, text: "" }, { speaker: null, text: "" }]);
      setNotice("Automatic extraction wasn’t available. The screenshot is still here as a reference — enter the messages manually.");
      setError(caught instanceof Error ? caught.message : "We couldn’t extract that screenshot.");
      setScreen("review");
    }
  };

  const updateTurn = (index: number, patch: Partial<DraftTurn>) => setTurns((current) => current.map((turn, turnIndex) => turnIndex === index ? { ...turn, ...patch } : turn));
  const moveTurn = (index: number, direction: -1 | 1) => setTurns((current) => {
    const next = [...current]; const target = index + direction;
    if (target < 0 || target >= next.length) return current;
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
  const removeTurn = (index: number) => setTurns((current) => current.filter((_, turnIndex) => turnIndex !== index));

  const openPlainMode = () => {
    setPlainDraft(turns.map((turn) => `${turn.speaker === "me" ? "Me" : turn.speaker === "them" ? "Them" : "Unassigned"}: ${turn.text}`).join("\n"));
    setPlainMode(true);
  };
  const applyPlain = () => {
    const parsed = parsePastedText(plainDraft.replace(/^Unassigned\s*:/gim, ""));
    if (!parsed.turns.length) { setError("Add at least one message before applying the text."); return; }
    setTurns(parsed.turns); setPlainMode(false); setNotice(parsed.confident ? "" : "Check every speaker assignment after editing the plain text.");
  };

  const startCheckout = async () => {
    if (!billing?.checkoutEnabled) return;
    setCheckoutBusy(true);
    emit("checkout_started", { packCredits: billing.packCredits });
    try {
      const response = await fetch("/api/billing/checkout", { method: "POST" });
      const data = await response.json() as { url?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error || "Checkout couldn’t start.");
      window.location.assign(data.url);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Checkout couldn’t start.");
      setCheckoutBusy(false);
    }
  };

  const analyze = async () => {
    setError("");
    const clean = turns.map((turn) => ({ speaker: turn.speaker, text: turn.text.trim() })).filter((turn) => turn.text);
    if (clean.length < 2 || clean.some((turn) => !turn.speaker)) { setError("Keep at least two non-empty messages and assign every one to Me or Them."); return; }
    if (!clean.some((turn) => turn.speaker === "me") || !clean.some((turn) => turn.speaker === "them")) { setError("Assign at least one message to Me and one to Them."); return; }
    if (clean.reduce((total, turn) => total + turn.text.length, 0) > MAX_CHARS) { setError("Trim the conversation to 6,000 characters."); return; }
    if (billing?.enabled && billing.credits === 0) { setPaywallOpen(true); return; }
    const controller = new AbortController(); controllerRef.current = controller;
    setStage({ label: "Jev · Scoring four visible dimensions", progress: 72, operation: "jev" }); setScreen("processing");
    emit("analysis_started", { source });
    const started = Date.now();
    try {
      const response = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "dating", turns: clean }), signal: controller.signal });
      const data = await response.json() as AnalyzePayload;
      if (response.status === 402 && data.code === "credits_exhausted") {
        if (data.billing) setBilling(data.billing);
        setScreen("review"); setPaywallOpen(true);
        return;
      }
      if (!response.ok) throw new Error(data.error || "Analysis failed.");
      void refreshBilling();
      if (data.status === "scored") {
        setResult(data.result); setScreen("result");
        emit("analysis_scored", { latencyBucket: Math.ceil((Date.now() - started) / 1000) * 1000, resultVersion: data.result.resultVersion, scoreBucket: Math.floor(data.result.index / 25) * 25 });
        if (challenge) emit("challenge_completed", { resultVersion: data.result.resultVersion });
      } else if (data.status === "safety") {
        setReason(data.reason); setResources(data.resources || ""); setScreen("safety");
      } else {
        setReason(data.reason); setScreen("insufficient"); emit("analysis_insufficient", { source });
      }
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") { setScreen("review"); return; }
      setError(caught instanceof Error ? caught.message : "Analysis failed. Try again."); setScreen("review");
    }
  };

  useEffect(() => {
    if (!result || screen !== "result") return;
    void renderShareCard(result, challengeUrl || window.location.origin).then(setSharePreview).catch(() => setSharePreview(""));
  }, [result, screen, challengeUrl]);

  const getShareBlob = async () => {
    if (!result) throw new Error("No result");
    const dataUrl = sharePreview || await renderShareCard(result, challengeUrl || window.location.origin);
    return fetch(dataUrl).then((response) => response.blob());
  };

  const downloadCard = async () => {
    try {
      const blob = await getShareBlob(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `cooked-index-${result?.index ?? "result"}.png`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 2_000);
      emit("share_card_downloaded", { resultVersion: result?.resultVersion || "cooked_v1" });
    } catch { toast.error("Couldn’t save the card. Try again."); }
  };

  const shareCard = async () => {
    try {
      const blob = await getShareBlob(); const file = new File([blob], "cooked-index.png", { type: "image/png" });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title: "My Cooked Index", text: challengeUrl ? "Can you beat my Cooked Index? Lower wins." : "Read the room with Cooked?", url: challengeUrl || window.location.origin, files: [file] });
        emit("native_share_opened", { resultVersion: result?.resultVersion || "cooked_v1" });
      } else await downloadCard();
    } catch (caught) { if (!(caught instanceof DOMException && caught.name === "AbortError")) toast.error("Sharing didn’t open. You can download the card instead."); }
  };

  const createChallenge = async () => {
    if (!result) return;
    setChallengeBusy(true);
    try {
      const response = await fetch("/api/challenges", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ index: result.index, label: result.label, mode: "dating", resultVersion: result.resultVersion, proof: result.proof }) });
      const data = await response.json() as ChallengePayload; if (!response.ok || !data.url) throw new Error(data.error || "Challenge creation failed.");
      setChallengeUrl(data.url); emit("challenge_created", { resultVersion: result.resultVersion }); toast.success("Challenge link ready");
    } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Couldn’t create the challenge."); }
    finally { setChallengeBusy(false); }
  };

  const copyChallenge = async () => {
    try { await navigator.clipboard.writeText(challengeUrl); toast.success("Challenge link copied"); }
    catch { toast.error("Copy the link from the field."); }
  };

  const feedbackResult = (reaction: "right" | "off") => {
    if (!result) return; setFeedback(reaction);
    emit("feedback", { reaction, resultVersion: result.resultVersion, scoreBucket: Math.floor(result.index / 25) * 25 });
  };

  const content = (() => {
    if (screen === "input") return (
      <section className="relative mx-auto grid w-full max-w-6xl gap-8 px-5 pb-16 pt-4 sm:px-8 lg:grid-cols-[1.02fr_.98fr] lg:items-center lg:py-12">
        <div className="relative z-10 max-w-xl">
          <p className="eyebrow"><span aria-hidden="true">●</span> Visible signals. Zero mind reading.</p>
          <h1 className="mt-5 text-[clamp(4.7rem,17vw,9.5rem)] font-black uppercase leading-[.72] tracking-[-.09em]">Cooked<span className="text-punch">?</span></h1>
          <p className="mt-8 max-w-lg text-xl font-semibold leading-snug sm:text-2xl">Drop the chat. Check the text. Get a playful read of the conversation you can actually see.</p>
          <div className="mt-7 flex items-center gap-2 text-sm font-medium text-muted-foreground"><LockKeyhole className="size-4" aria-hidden="true" /> No account. No transcript in your share card.</div>
          <div className="mt-8 hidden rotate-[-2deg] rounded-2xl border-2 border-ink bg-lime p-5 shadow-[5px_5px_0_var(--ink)] sm:block">
            <p className="text-xs font-black uppercase tracking-[.14em]">Example result</p>
            <div className="mt-2 flex items-end justify-between"><p className="text-2xl font-black">Mixed signals</p><p className="text-4xl font-black">43<span className="text-base">/100</span></p></div>
            <p className="mt-3 text-sm font-bold">The vibe is warm, but the plan is still vague.</p>
          </div>
        </div>

        <div className="relative z-10 rounded-[2rem] border-2 border-ink bg-white p-4 shadow-[10px_10px_0_var(--ink)] sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <div><p className="font-black uppercase tracking-tight">Bring the receipts</p><p className="text-sm text-muted-foreground">Two people · Dating mode</p></div>
            <MessageCircleMore className="size-7 text-punch" aria-hidden="true" />
          </div>
          <Tabs defaultValue="paste">
            <TabsList className="mb-4 grid h-11 w-full grid-cols-2 bg-canvas">
              <TabsTrigger value="paste" className="h-9 font-black"><MessageCircleMore /> Paste texts</TabsTrigger>
              <TabsTrigger value="upload" className="h-9 font-black"><Camera /> Screenshot</TabsTrigger>
            </TabsList>
            <TabsContent value="paste">
              <Textarea value={rawText} onChange={(event) => setRawText(event.target.value.slice(0, MAX_CHARS))} placeholder={'Me: Still on for Friday?\nThem: Absolutely — 7 at Bar Flores?'} className="min-h-52 resize-none border-ink/20 bg-canvas text-base focus-visible:border-punch focus-visible:ring-punch/20" aria-label="Paste your two-person conversation" />
              <div className="mt-3 flex items-center justify-between text-xs font-semibold text-muted-foreground"><span>Nothing is sent while you edit.</span><span>{rawText.length}/{MAX_CHARS}</span></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Button variant="outline" className="h-12 border-2 border-ink bg-white font-black" onClick={() => setRawText(DEMO)}>Try an example</Button>
                <Button className="h-12 border-2 border-ink bg-punch font-black text-white shadow-[3px_3px_0_var(--ink)] hover:bg-punch-dark" onClick={startTextReview}>Review chat</Button>
              </div>
            </TabsContent>
            <TabsContent value="upload">
              <label className="flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-ink/35 bg-canvas p-5 text-center hover:border-punch hover:bg-punch/5">
                {imageUrl ? <img src={imageUrl} alt="Selected chat screenshot, awaiting extraction" className="max-h-44 rounded-xl object-contain shadow-sm" /> : <><span className="mb-3 grid size-12 place-items-center rounded-full bg-lime"><Upload className="size-5" /></span><span className="font-black">Choose a screenshot</span><span className="mt-1 text-sm text-muted-foreground">PNG, JPEG, or WebP · 8 MB max</span></>}
                <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => chooseFile(event.target.files?.[0])} />
              </label>
              <p className="mt-3 text-xs font-semibold text-muted-foreground">The screenshot is sent for text extraction only after you continue, then you review every word and speaker.</p>
              <Button className="mt-4 h-12 w-full border-2 border-ink bg-punch font-black text-white shadow-[3px_3px_0_var(--ink)] hover:bg-punch-dark" onClick={extractImage} disabled={!imageFile}><Sparkles /> Extract & review</Button>
            </TabsContent>
          </Tabs>
          {error && <p role="alert" className="mt-4 flex gap-2 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800"><CircleAlert className="mt-0.5 size-4 shrink-0" /> {error}</p>}
          {billing?.enabled && <button onClick={() => setPaywallOpen(true)} className="mt-5 flex w-full items-center justify-between gap-4 rounded-2xl border-2 border-ink bg-lime p-4 text-left shadow-[3px_3px_0_var(--ink)]"><span><span className="block text-xs font-black uppercase tracking-[.12em]">{billing.freeReads} reads free</span><span className="mt-1 block text-sm font-bold">Then {billing.packCredits} reads for {billing.priceDisplay}. No subscription.</span></span><CreditCard className="size-6 shrink-0" /></button>}
          <p className="mt-5 border-t border-ink/10 pt-4 text-xs leading-relaxed text-muted-foreground">We send reviewed text to TypeSafe AI for scoring. Screenshot extraction uses OpenAI when configured. Please submit only chats you’re comfortable sharing. <a className="font-bold text-ink underline" href="/privacy">Privacy details</a>.</p>
        </div>
        <div className="absolute -right-32 -top-20 size-72 rounded-full bg-lime blur-3xl" aria-hidden="true" /><div className="absolute -bottom-12 left-1/4 size-48 rounded-full bg-punch/20 blur-3xl" aria-hidden="true" />
      </section>
    );

    if (screen === "processing") return (
      <section className="mx-auto flex min-h-[70vh] w-full max-w-xl flex-col items-center justify-center px-5 text-center">
        <div className="relative grid size-28 place-items-center rounded-[2rem] border-2 border-ink bg-lime shadow-[8px_8px_0_var(--ink)]"><LoaderCircle className="size-11 animate-spin motion-reduce:animate-none" /><span className="absolute -right-2 -top-3 rotate-6 rounded-full bg-punch px-3 py-1 text-xs font-black text-white">LIVE</span></div>
        <p className="eyebrow mt-10">Reading the room…</p><h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">No fake suspense.</h1>
        <p className="mt-3 text-muted-foreground">{stage.label}</p><Progress value={stage.progress} className="mt-7 h-3 border border-ink/10 bg-ink/10 [&>div]:bg-punch" />
        <Button variant="ghost" className="mt-6 font-bold" onClick={() => controllerRef.current?.abort()}><X /> Cancel and go back</Button>
      </section>
    );

    if (screen === "review") return (
      <section className="mx-auto w-full max-w-4xl px-5 pb-16 pt-4 sm:px-8">
        <button className="mb-5 inline-flex items-center gap-1 text-sm font-black hover:underline" onClick={() => setScreen("input")}><ChevronLeft className="size-4" /> Back to input</button>
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="eyebrow">Step 2 · Check the chat</p><h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">Who said what?</h1><p className="mt-2 max-w-2xl text-muted-foreground">Correct the words, set every speaker, and fix the order. Only this reviewed text gets analyzed.</p></div><Button variant="outline" className="border-2 border-ink font-black" onClick={openPlainMode}>Edit as plain text</Button></div>
        {notice && <p className="mt-5 flex gap-2 rounded-xl border border-amber-400 bg-amber-50 p-4 text-sm font-bold text-amber-950"><CircleAlert className="mt-0.5 size-4 shrink-0" />{notice}</p>}
        <div className={`mt-7 grid gap-6 ${imageUrl ? "lg:grid-cols-[.72fr_1.28fr]" : ""}`}>
          {imageUrl && <aside className="self-start rounded-[1.5rem] border-2 border-ink bg-white p-3 lg:sticky lg:top-4"><p className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[.12em]"><ImageIcon className="size-4" /> Local reference</p><img src={imageUrl} alt="Uploaded screenshot used only as a local review reference" className="max-h-[65vh] w-full rounded-xl object-contain bg-canvas" /></aside>}
          <div>
            <div className="space-y-3">
              {turns.map((turn, index) => (
                <div key={index} className="group grid grid-cols-[auto_1fr_auto] gap-2 rounded-2xl border border-ink/15 bg-white p-3 shadow-sm sm:grid-cols-[auto_112px_1fr_auto]">
                  <GripVertical className="mt-3 size-4 text-muted-foreground" aria-hidden="true" />
                  <Select value={turn.speaker ?? "unassigned"} onValueChange={(value) => updateTurn(index, { speaker: value === "unassigned" ? null : value as Speaker })}>
                    <SelectTrigger aria-label={`Speaker for message ${index + 1}`} className="col-span-1 h-11 w-full border-2 border-ink/15 font-black sm:col-auto"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="unassigned">Assign…</SelectItem><SelectItem value="me">Me</SelectItem><SelectItem value="them">Them</SelectItem></SelectContent>
                  </Select>
                  <Textarea value={turn.text} onChange={(event) => updateTurn(index, { text: event.target.value })} aria-label={`Message ${index + 1} text`} className="col-span-3 min-h-20 resize-y border-ink/15 text-base sm:col-span-1" />
                  <div className="col-span-3 flex items-center justify-end gap-1 sm:col-span-1 sm:flex-col">
                    <Button variant="ghost" size="icon-sm" aria-label={`Move message ${index + 1} up`} disabled={index === 0} onClick={() => moveTurn(index, -1)}><ArrowUp /></Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Move message ${index + 1} down`} disabled={index === turns.length - 1} onClick={() => moveTurn(index, 1)}><ArrowDown /></Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Remove message ${index + 1}`} onClick={() => removeTurn(index)}><Trash2 /></Button>
                  </div>
                </div>
              ))}
            </div>
            <Button variant="outline" className="mt-3 w-full border-2 border-dashed border-ink/30 font-black" disabled={turns.length >= 40} onClick={() => setTurns((current) => [...current, { speaker: null, text: "" }])}><Plus /> Add message</Button>
            {error && <p role="alert" className="mt-4 flex gap-2 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800"><CircleAlert className="mt-0.5 size-4 shrink-0" /> {error}</p>}
            <div className="mt-7 rounded-2xl border-2 border-ink bg-white p-5 shadow-[5px_5px_0_var(--ink)]"><p className="flex gap-2 text-sm font-black"><ShieldCheck className="size-5 text-punch" /> Before you analyze</p><p className="mt-2 text-sm leading-relaxed text-muted-foreground">We send only the text above to TypeSafe AI. The model judges visible conversation signals, not hidden intentions or the actual odds someone likes you.</p>{billing?.enabled && <p className="mt-3 flex items-center gap-2 rounded-xl bg-lime/50 px-3 py-2 text-sm font-black"><Zap className="size-4" /> {billing.credits} {billing.credits === 1 ? "read" : "reads"} left · only a scored result uses one</p>}<div className="mt-4 flex flex-col gap-3 sm:flex-row"><Button variant="outline" className="h-12 border-2 border-ink font-black" onClick={reset}><RotateCcw /> Start over</Button><Button className="h-12 flex-1 border-2 border-ink bg-punch font-black text-white shadow-[3px_3px_0_var(--ink)] hover:bg-punch-dark" onClick={analyze}><Sparkles /> Analyze visible signals</Button></div></div>
          </div>
        </div>
        <Dialog open={plainMode} onOpenChange={setPlainMode}><DialogContent className="rounded-2xl border-2 border-ink bg-white"><DialogHeader><DialogTitle className="text-2xl font-black">Edit as plain text</DialogTitle><DialogDescription>Use one message per line with Me: or Them: prefixes. Unprefixed lines will need a speaker assignment.</DialogDescription></DialogHeader><Textarea value={plainDraft} onChange={(event) => setPlainDraft(event.target.value.slice(0, MAX_CHARS))} className="min-h-72 bg-canvas text-base" /><DialogFooter><DialogClose asChild><Button variant="outline" className="border-2 border-ink">Cancel</Button></DialogClose><Button className="bg-punch font-black text-white" onClick={applyPlain}>Apply text</Button></DialogFooter></DialogContent></Dialog>
      </section>
    );

    if (screen === "insufficient" || screen === "safety") return (
      <section className="mx-auto flex min-h-[70vh] w-full max-w-2xl flex-col items-center justify-center px-5 text-center">
        <div className={`grid size-24 place-items-center rounded-[2rem] border-2 border-ink shadow-[7px_7px_0_var(--ink)] ${screen === "safety" ? "bg-amber-200" : "bg-lime"}`}>{screen === "safety" ? <ShieldCheck className="size-10" /> : <CircleAlert className="size-10" />}</div>
        <p className="eyebrow mt-9">{screen === "safety" ? "Let’s pause the game" : "No score this time"}</p><h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">{screen === "safety" ? "This needs a human, not a number." : "Too little to call."}</h1><p className="mt-4 max-w-xl text-lg leading-relaxed text-muted-foreground">{reason}</p>{resources && <p className="mt-4 rounded-xl bg-white p-4 text-sm font-bold">{resources}</p>}
        <div className="mt-7 flex flex-wrap justify-center gap-3"><Button variant="outline" className="h-12 border-2 border-ink font-black" onClick={reset}>Start over</Button>{screen === "insufficient" && <Button className="h-12 bg-punch font-black text-white" onClick={() => setScreen("review")}>Add more messages</Button>}</div>
      </section>
    );

    if (screen === "result" && result) return (
      <section className="mx-auto w-full max-w-6xl px-5 pb-20 pt-4 sm:px-8">
        <p className="eyebrow"><Sparkles className="size-3" /> The room has been read</p>
        <div className="mt-5 grid gap-8 lg:grid-cols-[1.1fr_.9fr]">
          <div>
            <article className="result-card relative overflow-hidden rounded-[2.25rem] border-2 border-ink bg-ink p-6 text-white shadow-[10px_10px_0_var(--punch)] sm:p-9" aria-labelledby="result-heading">
              <div className="absolute -right-20 -top-20 size-56 rounded-full bg-punch opacity-90" aria-hidden="true" /><div className="absolute -left-10 bottom-24 size-32 rounded-full bg-lime/20 blur-2xl" aria-hidden="true" />
              <div className="relative"><p className="text-xs font-black uppercase tracking-[.18em] text-lime">Your visible-signal read</p><h1 id="result-heading" className="mt-4 max-w-lg text-5xl font-black leading-[.9] tracking-[-.055em] sm:text-7xl">{result.label}</h1><div className="mt-8 flex items-baseline gap-2"><span className="text-[clamp(6rem,23vw,10rem)] font-black leading-none tracking-[-.09em]">{result.index}</span><span className="text-2xl font-black text-white/55">/100</span></div><p className="-mt-1 text-sm font-black uppercase tracking-[.14em] text-white/60">Cooked Index</p><p className="mt-6 max-w-lg border-l-4 border-lime pl-4 text-xl font-bold leading-snug">{result.phrase}</p></div>
              <div className="relative mt-9 space-y-5">{result.dimensions.map((dimension) => <div key={dimension.key}><div className="mb-2 flex items-center justify-between text-sm font-bold"><span>{dimension.label}</span><span>{dimension.value.toFixed(1)}/4</span></div><div className="h-3 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-lime" style={{ width: `${dimension.value / 4 * 100}%` }} /></div></div>)}</div>
              <p className="relative mt-8 text-sm text-white/60">{result.disclaimer}</p>{result.demo && <p className="relative mt-4 rounded-xl border border-lime/40 bg-lime/10 p-3 text-sm font-bold text-lime">Demo scoring is active. Add TYPESAFE_API_KEY for a live Jev result.</p>}
            </article>
            {challenge && <div className="mt-7 rounded-2xl border-2 border-ink bg-white p-5 shadow-[5px_5px_0_var(--ink)]"><p className="text-xs font-black uppercase tracking-[.14em]">Challenge result · lower wins</p><div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-center"><div><p className="text-sm font-bold text-muted-foreground">Them</p><p className="text-4xl font-black">{challenge.index}</p></div><span className="text-xl font-black">vs</span><div><p className="text-sm font-bold text-muted-foreground">You</p><p className="text-4xl font-black text-punch">{result.index}</p></div></div><p className="mt-4 text-center font-black">{result.index < challenge.index ? "You beat their index." : result.index > challenge.index ? "They take this round." : "A perfect tie."}</p></div>}
            <div className="mt-7 flex flex-col gap-3 sm:flex-row"><Button className="h-12 flex-1 border-2 border-ink bg-lime font-black text-ink shadow-[3px_3px_0_var(--ink)] hover:bg-lime/80" onClick={shareCard}><Share2 /> Share card</Button><Button variant="outline" className="h-12 flex-1 border-2 border-ink font-black" onClick={downloadCard}><Download /> Save PNG</Button><Button variant="outline" className="h-12 border-2 border-ink font-black" onClick={reset}>Try another</Button></div>
            <div className="mt-5 flex items-center gap-3 text-sm"><span className="font-bold text-muted-foreground">Feels right?</span><Button size="sm" variant={feedback === "right" ? "secondary" : "outline"} onClick={() => feedbackResult("right")}><Check /> Feels right</Button><Button size="sm" variant={feedback === "off" ? "secondary" : "outline"} onClick={() => feedbackResult("off")}><X /> Way off</Button></div>
          </div>
          <aside>
            <div className="rounded-[2rem] border-2 border-ink bg-white p-5 shadow-[8px_8px_0_var(--ink)]"><div className="flex items-center justify-between"><div><p className="font-black uppercase tracking-tight">Share preview</p><p className="text-sm text-muted-foreground">1080 × 1920 · no chat content</p></div><ShieldCheck className="size-6 text-punch" /></div>{sharePreview ? <img src={sharePreview} alt={`Share card reading ${result.label}, Cooked Index ${result.index} out of 100`} className="mx-auto mt-5 max-h-[510px] rounded-2xl border border-ink/10 object-contain shadow-lg" /> : <div className="mx-auto mt-5 aspect-[9/16] max-h-[510px] animate-pulse rounded-2xl bg-canvas motion-reduce:animate-none" />}</div>
            <Dialog><DialogTrigger asChild><Button className="mt-5 h-12 w-full border-2 border-ink bg-punch font-black text-white shadow-[3px_3px_0_var(--ink)] hover:bg-punch-dark"><Link2 /> Challenge a friend</Button></DialogTrigger><DialogContent className="rounded-2xl border-2 border-ink bg-white"><DialogHeader><DialogTitle className="text-2xl font-black">Can they beat {result.index}?</DialogTitle><DialogDescription>Lower wins. Anyone with the unguessable link can see your score, label, mode, and result version — never your transcript.</DialogDescription></DialogHeader>{challengeUrl ? <div className="flex gap-2"><input readOnly value={challengeUrl} aria-label="Challenge link" className="min-w-0 flex-1 rounded-xl border-2 border-ink/20 bg-canvas px-3 text-sm" /><Button aria-label="Copy challenge link" onClick={copyChallenge}><Copy /></Button></div> : <Button className="h-12 bg-punch font-black text-white" disabled={challengeBusy} onClick={createChallenge}>{challengeBusy ? <LoaderCircle className="animate-spin" /> : <Send />} Create score-only link</Button>}<DialogFooter showCloseButton /></DialogContent></Dialog>
          </aside>
        </div>
      </section>
    );
    return null;
  })();

  return <main className="min-h-screen overflow-hidden bg-background text-foreground"><Header onReset={reset} billing={billing} onUpgrade={() => setPaywallOpen(true)} /><ChallengeStrip challenge={challenge} error={challengeError} />{content}<footer className="mx-auto flex w-full max-w-6xl flex-col gap-3 border-t border-ink/10 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8"><p>For fun. Based only on visible messages.</p><div className="flex flex-wrap gap-5"><a className="font-bold hover:text-ink hover:underline" href="/privacy">Privacy</a><a className="font-bold hover:text-ink hover:underline" href="/terms">Terms</a>{billing?.enabled && <button className="font-bold hover:text-ink hover:underline" onClick={() => setPaywallOpen(true)}>Pricing</button>}<span>More modes coming.</span></div></footer><Dialog open={paywallOpen} onOpenChange={setPaywallOpen}><DialogContent className="overflow-hidden rounded-[2rem] border-2 border-ink bg-white p-0 shadow-[9px_9px_0_var(--ink)]"><div className="bg-lime px-6 py-5"><p className="flex items-center gap-2 text-xs font-black uppercase tracking-[.14em]"><Zap className="size-4" /> Keep reading the room</p><DialogTitle className="mt-3 text-3xl font-black tracking-tight">{billing?.packCredits ?? 25} more reads.</DialogTitle><p className="mt-1 text-2xl font-black text-punch">{billing?.priceDisplay ?? "$4.99"} <span className="text-sm text-ink">one time</span></p></div><div className="p-6"><DialogDescription className="text-base text-ink">No subscription and no surprise renewal. Your pack is added after Stripe confirms payment.</DialogDescription><div className="mt-5 space-y-3 text-sm font-bold"><p className="flex gap-2"><CheckCircle2 className="size-5 shrink-0 text-punch" /> One credit is used only when Cooked? returns a scored result.</p><p className="flex gap-2"><CheckCircle2 className="size-5 shrink-0 text-punch" /> Too-little-to-call results and technical failures don’t use a credit.</p><p className="flex gap-2"><LockKeyhole className="size-5 shrink-0 text-punch" /> No account: credits stay with this browser for up to one year.</p></div><p className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950">Because there’s no login, clearing this site’s cookies can remove access to remaining credits. Keep your Stripe receipt for purchase support.</p><Button className="mt-5 h-12 w-full border-2 border-ink bg-punch font-black text-white shadow-[3px_3px_0_var(--ink)] hover:bg-punch-dark" onClick={startCheckout} disabled={checkoutBusy || !billing?.checkoutEnabled}>{checkoutBusy ? <LoaderCircle className="animate-spin" /> : <CreditCard />} {checkoutBusy ? "Opening secure checkout…" : `Get ${billing?.packCredits ?? 25} reads`}</Button><p className="mt-4 text-center text-xs text-muted-foreground">Secure checkout by Stripe. By purchasing, you agree to the <a href="/terms" className="font-bold text-ink underline">Terms</a> and <a href="/privacy" className="font-bold text-ink underline">Privacy Policy</a>.</p></div></DialogContent></Dialog><Toaster richColors position="bottom-center" /></main>;
}

async function renderShareCard(result: ScoredResult, url: string) {
  const canvas = document.createElement("canvas"); canvas.width = 1080; canvas.height = 1920;
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Canvas unavailable");
  ctx.fillStyle = "#18181a"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ff3d7f"; ctx.beginPath(); ctx.arc(1010, 80, 330, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#e8ff5b"; ctx.beginPath(); ctx.arc(-40, 1660, 250, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#ffffff"; ctx.font = "900 76px Arial"; ctx.fillText("Cooked", 90, 150); ctx.fillStyle = "#ff3d7f"; ctx.fillText("?", 350, 150);
  ctx.fillStyle = "#e8ff5b"; ctx.font = "900 34px Arial"; ctx.fillText("VISIBLE-SIGNAL READ", 90, 300);
  ctx.fillStyle = "#ffffff"; ctx.font = "900 112px Arial";
  const lines = wrapText(ctx, result.label, 830); lines.forEach((line, index) => ctx.fillText(line, 90, 450 + index * 118));
  const numberY = 760 + (lines.length - 1) * 118;
  ctx.font = "900 430px Arial"; ctx.letterSpacing = "-18px"; ctx.fillText(String(result.index), 70, numberY + 360); ctx.letterSpacing = "0px";
  ctx.fillStyle = "rgba(255,255,255,.48)"; ctx.font = "900 62px Arial"; ctx.fillText("/100", 725, numberY + 340);
  ctx.fillStyle = "rgba(255,255,255,.56)"; ctx.font = "900 31px Arial"; ctx.fillText("COOKED INDEX", 90, numberY + 430);
  ctx.fillStyle = "#e8ff5b"; ctx.fillRect(90, numberY + 520, 14, 205);
  ctx.fillStyle = "#ffffff"; ctx.font = "700 49px Arial"; wrapText(ctx, result.phrase, 760).slice(0, 3).forEach((line, index) => ctx.fillText(line, 145, numberY + 580 + index * 62));
  const qr = await QRCode.toDataURL(url, { width: 240, margin: 2, color: { dark: "#18181a", light: "#ffffff" } });
  const image = await loadImage(qr); ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.roundRect(750, 1535, 250, 250, 26); ctx.fill(); ctx.drawImage(image, 765, 1550, 220, 220);
  ctx.fillStyle = "rgba(255,255,255,.74)"; ctx.font = "700 28px Arial"; ctx.fillText("Try yours at Cooked?", 90, 1630); ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.font = "600 25px Arial"; ctx.fillText("For fun · based on visible messages", 90, 1760);
  return canvas.toDataURL("image/png");
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(/\s+/); const lines: string[] = []; let current = "";
  for (const word of words) { const next = current ? `${current} ${word}` : word; if (ctx.measureText(next).width > maxWidth && current) { lines.push(current); current = word; } else current = next; }
  if (current) lines.push(current); return lines;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src; });
}

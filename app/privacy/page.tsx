export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-5 py-10 sm:px-8 sm:py-16">
      <a className="brand-mark" href="/">Cooked<span>?</span></a>
      <article className="mt-10 rounded-[2rem] border-2 border-ink bg-white p-6 shadow-[8px_8px_0_var(--ink)] sm:p-10">
        <p className="eyebrow">Privacy, in plain English</p>
        <h1 className="mt-5 text-4xl font-black tracking-tight">Your chat is a guest, not a resident.</h1>
        <div className="mt-8 space-y-5 text-base leading-relaxed text-muted-foreground">
          <p>Text you approve is sent to TypeSafe AI for scoring. It is processed transiently and is not stored by Cooked?.</p>
          <p>If screenshot extraction is configured, the image is sent directly to OpenAI for text extraction with response storage disabled. Cooked? does not write screenshots to durable storage. Always review the extracted words before analysis.</p>
          <p>Challenge records contain only a score, label, mode, version, and expiration. They never contain names, screenshots, or messages. Share cards contain no transcript.</p>
          <p>Analytics contain event names and coarse product data only — never chat text, file names, OCR output, or speaker names.</p>
          <p>Please submit only conversations you are comfortable sharing with these processors. You can start over at any time to clear the local draft and image preview.</p>
        </div>
        <a href="/" className="mt-8 inline-flex min-h-11 items-center rounded-xl border-2 border-ink bg-lime px-5 font-black">Back to Cooked?</a>
      </article>
    </main>
  );
}

export default function TermsPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-5 py-10 sm:px-8 sm:py-16">
      <a className="brand-mark" href="/">The Chat <span>Receipt</span></a>
      <article className="mt-10 rounded-[2rem] border-2 border-ink bg-white p-6 shadow-[8px_8px_0_var(--ink)] sm:p-10">
        <p className="eyebrow">Terms of use · September 29, 2026</p>
        <h1 className="mt-5 text-4xl font-black tracking-tight">For fun, with the fine print visible.</h1>
        <div className="mt-8 space-y-6 text-base leading-relaxed text-muted-foreground">
          <section><h2 className="font-black text-ink">Who can use The Chat Receipt?</h2><p className="mt-2">You must be at least 18 and able to enter a binding agreement. Submit only conversations you are permitted and comfortable to share with the processors named in the Privacy Policy.</p></section>
          <section><h2 className="font-black text-ink">What the result means</h2><p className="mt-2">The Chat Receipt is an entertainment product that summarizes visible text signals. It does not read minds, determine truth, predict another person’s behavior, or provide relationship, medical, legal, or safety advice.</p></section>
          <section><h2 className="font-black text-ink">Paid read packs</h2><p className="mt-2">A read pack is a one-time purchase of the number of scored analyses shown before checkout. It is not a subscription and does not renew automatically. A credit is used only when a numeric result is returned; technical failures, safety suppressions, and “Too little to call” results do not use a credit.</p></section>
          <section><h2 className="font-black text-ink">Browser-bound access</h2><p className="mt-2">The Chat Receipt does not require an account. Credits are linked to a necessary cookie on the browser used to purchase them. Clearing cookies, using private browsing, or changing browsers or devices can remove access. Keep your Stripe receipt so a purchase can be investigated.</p></section>
          <section><h2 className="font-black text-ink">Payments and refunds</h2><p className="mt-2">Stripe processes payments and may calculate applicable tax. If you are charged incorrectly, the pack is not delivered, or the service materially fails, use the merchant contact information on your Stripe receipt. Refunds remain available where required by law; used credits are otherwise non-refundable.</p></section>
          <section><h2 className="font-black text-ink">Acceptable use</h2><p className="mt-2">Do not use The Chat Receipt to violate privacy, harass someone, exploit a minor, submit unlawful sexual content, reverse engineer the service, evade usage limits, or interfere with the app or its providers. Access may be limited to protect users and the service.</p></section>
          <section><h2 className="font-black text-ink">Availability</h2><p className="mt-2">The service is provided as available and may change or experience interruptions. Nothing here limits rights or remedies that cannot legally be limited.</p></section>
        </div>
        <div className="mt-8 flex flex-wrap gap-3"><a href="/" className="inline-flex min-h-11 items-center rounded-xl border-2 border-ink bg-lime px-5 font-black">Back to The Chat Receipt</a><a href="/privacy" className="inline-flex min-h-11 items-center rounded-xl border-2 border-ink px-5 font-black">Privacy Policy</a></div>
      </article>
    </main>
  );
}

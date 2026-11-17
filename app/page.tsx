"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight, ArrowUpRight, Check, CircleHelp, Clipboard,
  Clock3, Copy, Loader2, Menu,
  MessageSquare, RotateCcw, ShieldCheck, Sparkles, WandSparkles, X
} from "lucide-react";
import type { PromptResult, PromptStyle, SavedPrompt, TargetAI } from "@/lib/types";

const styles: { id: PromptStyle; label: string; desc: string }[] = [
  { id: "simple", label: "Simple", desc: "Clear & direct" },
  { id: "professional", label: "Professional", desc: "Polished & precise" },
  { id: "advanced", label: "Advanced", desc: "More structured" }
];

const TARGET_OPTIONS: { id: TargetAI; label: string }[] = [
  { id: "universal", label: "Universal (all AI)" },
  { id: "gpt", label: "ChatGPT / GPT" },
  { id: "claude", label: "Claude" },
  { id: "gemini", label: "Gemini" },
  { id: "deepseek", label: "DeepSeek" },
  { id: "qwen", label: "Qwen" },
  { id: "grok", label: "Grok" },
  { id: "image", label: "Image AI" }
];

const TARGET_KEY = "promptly-target-ai-v1";
const MAX_LENGTH = 3000;
const HISTORY_KEY = "promptly-history-v1";
const DRAFT_KEY = "promptly-draft-v1";

function readHistory(): SavedPrompt[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(item => item && typeof item.input === "string" && item.result && typeof item.result.simple === "string").slice(0, 8);
  } catch { return []; }
}

function StudioLogo({ large = false }: { large?: boolean }) {
  return (
    <span className={`studio-logo ${large ? "studio-logo-large" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 48 48" fill="none">
        <rect width="48" height="48" rx="15" fill="#6D42DA"/>
        <path d="M11 15.5a5 5 0 0 1 5-5h15a5 5 0 0 1 5 5V27a5 5 0 0 1-5 5h-8l-7.5 6V32a5 5 0 0 1-4.5-5V15.5Z" stroke="white" strokeWidth="2.35" strokeLinejoin="round"/>
        <path d="M18 19.5h11M18 25h7.5" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
        <path d="m35.5 4 2 6.5L44 12.5l-6.5 2-2 6.5-2-6.5-6.5-2 6.5-2 2-6.5Z" fill="#DCD0FF" stroke="white" strokeWidth="0.7"/>
      </svg>
    </span>
  );
}

export default function HomePage() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<PromptResult | null>(null);
  const [style, setStyle] = useState<PromptStyle>("professional");
  const [targetAI, setTargetAI] = useState<TargetAI>("universal");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<PromptStyle | "all" | null>(null);
  const [history, setHistory] = useState<SavedPrompt[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [isReady, setIsReady] = useState<boolean | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultRef = useRef<HTMLElement>(null);

  useEffect(() => {
    try { setInput(localStorage.getItem(DRAFT_KEY) || ""); } catch {}
    setHistory(readHistory());
    try {
      const storedTarget = localStorage.getItem(TARGET_KEY);
      if (TARGET_OPTIONS.some(option => option.id === storedTarget)) setTargetAI(storedTarget as TargetAI);
    } catch {}
    fetch("/api/status", { cache: "no-store" })
      .then(r => r.json())
      .then(data => { setIsReady(Boolean(data.ready)); setProvider(typeof data.provider === "string" ? data.provider : null); })
      .catch(() => setIsReady(false));
    return () => { if (copyTimeout.current) clearTimeout(copyTimeout.current); };
  }, []);

  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, input); } catch {}
  }, [input]);

  const wordCount = useMemo(() => input.trim().split(/\s+/).filter(Boolean).length, [input]);

  async function improve() {
    if (busy || input.trim().length < 2) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: input.trim(), targetAI })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Something went wrong. Please try again.");
      const generated = data.result as PromptResult;
      setResult(generated);
      setStyle("professional");
      const item: SavedPrompt = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        input: input.trim(),
        result: generated,
        targetAI,
        date: Date.now()
      };
      const next = [item, ...readHistory()].slice(0, 8);
      setHistory(next);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch {}
      if (window.innerWidth < 900) requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not improve this prompt. Try again.");
    } finally { setBusy(false); }
  }

  async function copy(text: string, type: PromptStyle | "all") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      if (copyTimeout.current) clearTimeout(copyTimeout.current);
      copyTimeout.current = setTimeout(() => setCopied(null), 1800);
    } catch { setError("Copy was blocked by the browser. Select the text and copy it manually."); }
  }

  function clear() { setInput(""); setResult(null); setError(""); }

  function changeTarget(next: TargetAI) {
    setTargetAI(next);
    setResult(null); // A previous result was optimized for the previous target.
    setError("");
    try { localStorage.setItem(TARGET_KEY, next); } catch {}
  }

  function restore(item: SavedPrompt) {
    setInput(item.input);
    setResult(item.result);
    setStyle("professional");
    setTargetAI(item.targetAI || "universal");
    try { localStorage.setItem(TARGET_KEY, item.targetAI || "universal"); } catch {}
    setHistoryOpen(false);
    setMobileMenu(false);
  }

  const activeStyle = styles.find(item => item.id === style)!;

  return (
    <div className="site-wrap">
      <div className="background-orb background-orb-a" />
      <div className="background-orb background-orb-b" />
      <header className="site-header container">
        <div className="brand" aria-label="Promptly home">
          <StudioLogo />
          <div className="brand-text"><strong>Promptly</strong><span>WORDS, REFINED.</span></div>
        </div>
        <nav className={`nav-links ${mobileMenu ? "mobile-menu-open" : ""}`} aria-label="Navigation">
          <a href="#how-it-works" onClick={() => setMobileMenu(false)}>How it works</a>
          <a href="#studio" onClick={() => setMobileMenu(false)}>Try the studio</a>
          <button className="nav-history" type="button" onClick={() => { setHistoryOpen(true); setMobileMenu(false); }}><Clock3 size={16}/> History</button>
        </nav>
        <div className="header-right">
          <span className="header-tag"><span className="status-dot"/> Free to try</span>
          <a className="header-cta" href="#studio">Start creating <ArrowUpRight size={15} /></a>
          <button className="menu-toggle" aria-label={mobileMenu ? "Close menu" : "Open menu"} onClick={() => setMobileMenu(!mobileMenu)}>{mobileMenu ? <X size={22}/> : <Menu size={22}/>}</button>
        </div>
      </header>

      <main>
        <section className="hero container" id="top">
          <div className="hero-overline"><Sparkles size={14} fill="currentColor"/> YOUR IDEAS, BUT CLEARER <span className="hero-overline-line"/></div>
          <h1>Better prompts start<br/>with <span className="hero-highlight">your words.<svg className="hero-underline" viewBox="0 0 412 23" preserveAspectRatio="none" aria-hidden="true"><path d="M5 15C105 0 249 5 405 12" stroke="#B59CFF" strokeWidth="7" strokeLinecap="round" opacity=".75"/></svg></span></h1>
          <p className="hero-description">You don’t need perfect English or the right words. Just tell us what you mean. We’ll turn it into a prompt that works.</p>
          <div className="hero-notes"><span><Check size={14}/> Any topic</span><span><Check size={14}/> Three writing styles</span><span><Check size={14}/> No sign-up</span></div>
        </section>

        <section className="studio-section container" id="studio">
          <div className="studio-shell">
            <div className="studio-heading">
              <div><span className="section-eyebrow">THE STUDIO</span><h2>Make your prompt better</h2><p>Start with a thought. Leave with a clearer direction.</p></div>
              <div className="studio-config">
                <label className="target-picker" htmlFor="target-ai">
                  <span>Optimize for</span>
                  <select id="target-ai" value={targetAI} disabled={busy}
                    onChange={e => changeTarget(e.target.value as TargetAI)}>
                    {TARGET_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                  </select>
                </label>
                <div className={`model-chip ${isReady === false ? "model-unavailable" : ""}`} title="Shows that a server API key is configured. Actual provider access is checked when you generate a prompt.">
                  <span className="model-pulse"/>{isReady === null ? "Checking AI" : isReady ? `API key set${provider ? ` · ${provider === "gemini" ? "Gemini" : "OpenRouter"}` : ""}` : "AI setup needed"}
                </div>
              </div>
            </div>
            <div className="editor-grid">
              <section className="input-panel" aria-label="Your input">
                <div className="panel-top"><div className="panel-title"><span className="panel-number">01</span><span>Your idea</span></div><span className="subtle-label">Write naturally</span></div>
                <div className="input-area">
                  <label htmlFor="prompt-input" className="sr-only">What would you like the AI to do?</label>
                  <textarea id="prompt-input" maxLength={MAX_LENGTH} disabled={busy} value={input} onChange={e => { setInput(e.target.value); setError(""); }} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void improve(); } }} placeholder={"What would you like the AI to do?\n\nEven a simple sentence is enough..."} spellCheck autoFocus />
                  <div className="input-meta"><span>{wordCount} words</span><span>{input.length} / {MAX_LENGTH}</span></div><div className="keyboard-hint">Enter to improve <span aria-hidden="true">·</span> Shift + Enter for a new line</div>
                </div>
                <div className="input-actions"><button className="btn-clear" type="button" onClick={clear} disabled={busy || (!input && !result)}><RotateCcw size={15}/> Clear</button><button className="btn-primary" type="button" disabled={busy || input.trim().length < 2} onClick={improve}>{busy ? <><Loader2 size={18} className="spin"/> Improving...</> : <><WandSparkles size={18}/> Improve prompt <ArrowRight size={18}/></>}</button></div>
                {error && <div className="error-notice" role="alert"><CircleHelp size={16}/>{error}</div>}
              </section>
              <section className="output-panel" ref={resultRef} aria-label="Improved prompts">
                <div className="panel-top"><div className="panel-title"><span className="panel-number panel-number-purple">02</span><span>Your refined prompt</span></div>{result && <span className="generated-pill"><Sparkles size={12}/> Ready to use</span>}</div>
                <div className="output-content">
                  {!result && !busy && <div className="empty-state"><div className="empty-graphic"><span className="empty-sparkle empty-sparkle-1">✦</span><StudioLogo large/><span className="empty-sparkle empty-sparkle-2">✧</span><span className="empty-sparkle empty-sparkle-3">·</span></div><h3>A little clarity goes a long way.</h3><p>Write your idea on the left and we'll turn it into three ready-to-use prompts.</p><div className="empty-dots"><i/><i/><i/></div></div>}
                  {busy && <div className="loading-state"><div className="loading-mark"><WandSparkles size={29}/></div><h3>Finding the right words...</h3><p>Creating three different versions of your idea.</p><div className="loading-rows"><span/><span/><span/><span/></div></div>}
                  {result && !busy && <div className="result-block"><div className="style-tabs" role="tablist" aria-label="Prompt style">{styles.map(item => <button key={item.id} type="button" role="tab" aria-selected={style === item.id} className={`style-tab ${style === item.id ? "style-tab-active" : ""}`} onClick={() => {setStyle(item.id); setCopied(null);}}><span>{item.label}</span><small>{item.desc}</small></button>)}</div><div className="result-meta"><span>{result.category} · {TARGET_OPTIONS.find(option => option.id === targetAI)?.label}</span><span>{activeStyle.label} prompt</span></div><div className="result-text" role="tabpanel" aria-live="polite">{result[style]}</div>{result.suggestion && <div className="suggestion"><CircleHelp size={16}/><div><strong>Make it even better</strong><p>{result.suggestion}</p></div></div>}<div className="result-actions"><button className="btn-secondary" type="button" onClick={() => copy(`${styles.map(s => `${s.label.toUpperCase()}\n${result[s.id]}`).join("\n\n")}`, "all")}><Clipboard size={16}/>{copied === "all" ? "Copied all" : "Copy all three"}</button><button className="btn-primary btn-copy" type="button" onClick={() => copy(result[style], style)}>{copied === style ? <><Check size={17}/> Copied!</> : <><Copy size={17}/> Copy prompt</>}</button></div></div>}
                </div>
              </section>
            </div>
            <div className="studio-bottom"><span><ShieldCheck size={16}/> No account needed. Recent prompts stay in your browser.</span><span>Thoughtful words, better results. <span aria-hidden="true">✦</span></span></div>
          </div>
        </section>

        <section className="how-section container" id="how-it-works"><div className="how-heading"><span className="section-eyebrow">THREE SIMPLE STEPS</span><h2>From thought to prompt.<br/><em>Just like that.</em></h2></div><div className="how-grid"><div><span className="step-label">01 / WRITE</span><div className="how-icon"><MessageSquare size={22}/></div><h3>Say it your way</h3><p>A few words, broken English, or a complete idea. Start wherever you are.</p></div><div><span className="step-label">02 / REFINE</span><div className="how-icon"><Sparkles size={22}/></div><h3>Pick your style</h3><p>Simple, Professional, or Advanced. Choose the amount of detail that fits your task.</p></div><div><span className="step-label">03 / USE</span><div className="how-icon"><Copy size={22}/></div><h3>Copy and go</h3><p>Take your new prompt to any AI assistant, image tool, or application you like.</p></div></div></section>
      </main>

      <footer className="site-footer container"><div className="footer-brand"><StudioLogo/><span>Promptly</span></div><p>Good ideas deserve good words.</p><span>Made by Hafizuddin <span className="footer-star">✳</span></span></footer>

      {historyOpen && <div className="overlay" role="presentation" onMouseDown={e => { if (e.currentTarget === e.target) setHistoryOpen(false); }}><aside className="history-drawer" role="dialog" aria-modal="true" aria-label="Recent prompts"><div className="drawer-heading"><div><span className="section-eyebrow">YOUR WORK</span><h2>Recent prompts</h2></div><button className="icon-button" type="button" aria-label="Close history" onClick={() => setHistoryOpen(false)}><X size={20}/></button></div><p className="drawer-description">Saved only on this device. Open any previous version.</p>{history.length === 0 ? <div className="history-empty"><Clock3 size={26}/><p>Your recent prompts will appear here.</p></div> : <div className="history-list">{history.map(item => <button className="history-item" key={item.id} type="button" onClick={() => restore(item)}><span>{item.input}</span><small>{new Date(item.date).toLocaleDateString()}</small><ArrowUpRight size={16}/></button>)}</div>}<div className="drawer-bottom"><button className="btn-secondary" type="button" disabled={!history.length} onClick={() => { if(window.confirm("Clear your saved prompts on this device?")){setHistory([]);localStorage.removeItem(HISTORY_KEY);} }}><RotateCcw size={16}/> Clear history</button></div></aside></div>}
    </div>
  );
}

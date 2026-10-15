'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Logo } from './Logo';
import { Patient } from '@/lib/types';
import { TabType } from './Sidebar';
import {
  History,
  AlertTriangle,
  FileCode,
  ArrowRight,
  Sparkles,
  Play,
  Pause,
  Clock,
  Calendar,
  ShieldCheck,
  Activity,
  CheckCircle2,
  Stethoscope,
  Terminal,
  Zap,
  RotateCcw,
  Network,
  Scale,
  Users,
} from 'lucide-react';

interface LandingPageViewProps {
  onStartDemo: (tab?: TabType) => void;
  samplePatient?: Patient | null;
}

export function LandingPageView({
  onStartDemo,
  samplePatient,
}: LandingPageViewProps) {
  // Looping animation state: 'before' | 'after'
  const [animPhase, setAnimPhase] = useState<'before' | 'after'>('before');
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const [progressPct, setProgressPct] = useState(0);

  const loopTimerRef = useRef<NodeJS.Timeout | null>(null);
  const progressTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-looping animation of the two sliders changing a diagnosis
  useEffect(() => {
    if (!isAutoPlaying) {
      if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      return;
    }

    const CYCLE_DURATION = 6500; // 6.5s per phase
    const PROGRESS_INTERVAL = 50;

    let startTime = Date.now();
    setProgressPct(0);

    // Progress bar ticker
    progressTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, (elapsed / CYCLE_DURATION) * 100);
      setProgressPct(pct);
    }, PROGRESS_INTERVAL);

    // Switch phase timer
    loopTimerRef.current = setTimeout(() => {
      setAnimPhase((prev) => (prev === 'before' ? 'after' : 'before'));
    }, CYCLE_DURATION);

    return () => {
      if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    };
  }, [animPhase, isAutoPlaying]);

  // Handle manual toggle
  const handleSelectPhase = (phase: 'before' | 'after') => {
    setAnimPhase(phase);
    setProgressPct(0);
    // Pause briefly on user interaction
    setIsAutoPlaying(false);
    setTimeout(() => setIsAutoPlaying(true), 12000);
  };

  const isBefore = animPhase === 'before';

  // Dates corresponding to the two sliders
  const validDate = isBefore ? '2024-01-15' : '2024-03-22';
  const sysDate = isBefore ? '2024-01-15' : '2024-03-24';
  const validSliderPos = isBefore ? 12 : 92;
  const sysSliderPos = isBefore ? 12 : 96;

  return (
    <div className="h-screen max-h-screen w-full bg-[#070b10] text-slate-100 flex flex-col justify-between overflow-hidden relative select-none font-sans">
      {/* Dynamic Background Glows */}
      <div className="absolute top-[-10%] left-[-5%] w-[45vw] h-[45vw] rounded-full bg-teal-500/10 blur-[130px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[45vw] h-[45vw] rounded-full bg-cyan-600/10 blur-[130px] pointer-events-none" />
      <div className="absolute top-[40%] right-[25%] w-[30vw] h-[30vw] rounded-full bg-amber-500/5 blur-[100px] pointer-events-none" />

      {/* Grid Pattern Texture */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(#2dd4bf 1px, transparent 1px), linear-gradient(90deg, #2dd4bf 1px, transparent 1px)`,
          backgroundSize: '48px 48px',
        }}
      />

      {/* ================================================================= */}
      {/* 1. TOP NAVIGATION BAR (Compact: ~56px)                            */}
      {/* ================================================================= */}
      <header className="px-6 sm:px-10 h-14 border-b border-[#1e293b]/60 flex items-center justify-between shrink-0 z-20 backdrop-blur-md bg-[#070b10]/70">
        <div className="flex items-center gap-3">
          <Logo size="sm" showTagline={false} />
          <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-slate-800">
            <span className="text-[11px] font-mono text-teal-400 bg-teal-950/80 px-2 py-0.5 rounded-full border border-teal-800/80 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
              Bitemporal EHR Graph
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => onStartDemo('timeline')}
            className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs transition-all shadow-glowTeal active:scale-95"
          >
            <span>Try the Demo</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* ================================================================= */}
      {/* 2. HERO SECTION WITH TAGLINE (Compact: ~85px)                    */}
      {/* ================================================================= */}
      <div className="px-6 sm:px-10 pt-2 pb-1 text-center max-w-4xl mx-auto shrink-0 z-10">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#101620] border border-teal-500/30 text-teal-300 text-xs font-mono mb-2 shadow-sm">
          <Sparkles className="w-3.5 h-3.5 text-teal-400" />
          <span>Every diagnosis, as it was known.</span>
        </div>

        <h1 className="text-2xl sm:text-4xl lg:text-4xl font-extrabold text-white tracking-tight leading-tight">
          Bitemporal Provenance & Clinical Second-Opinion Engine
        </h1>

        <p className="text-xs sm:text-sm text-slate-400 max-w-2xl mx-auto mt-1 line-clamp-2">
          Hospitals disagree. Lab results are corrected. AsOf reconstructs the exact timeline of what each provider knew — and <strong className="text-slate-200">when the system knew it</strong>.
        </p>
      </div>

      {/* ================================================================= */}
      {/* 3. MAIN VISUAL: LOOPING DUAL-SLIDER ANIMATION (Central Hero Unit)  */}
      {/* ================================================================= */}
      <div className="px-6 sm:px-10 flex-1 flex flex-col justify-center items-center z-10 py-1">
        <div className="w-full max-w-4xl rounded-2xl bg-[#0d131d]/90 border border-[#1e293b] p-4 sm:p-5 shadow-2xl backdrop-blur-xl relative overflow-hidden flex flex-col justify-between">
          {/* Looping Progress Header Bar */}
          <div className="flex items-center justify-between pb-3 border-b border-[#1e293b]/80 gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-500/15 border border-teal-500/30 text-teal-300 text-xs font-bold font-mono">
                <span className="w-2 h-2 rounded-full bg-teal-400 animate-ping" />
                LOOPING SIMULATOR
              </div>
              <span className="text-xs text-slate-400 hidden sm:inline">
                Case: <strong className="text-slate-200">{samplePatient?.name || 'Eleanor Vance'}</strong> (3 Health Systems)
              </span>
            </div>

            {/* Presets Toggle Buttons & Autoplay Pause */}
            <div className="flex items-center gap-2">
              <div className="flex items-center rounded-lg bg-[#141c29] border border-[#1e293b] p-0.5 text-xs font-mono">
                <button
                  onClick={() => handleSelectPhase('before')}
                  className={`px-3 py-1 rounded-md transition-all ${
                    isBefore
                      ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Before Correction
                </button>
                <button
                  onClick={() => handleSelectPhase('after')}
                  className={`px-3 py-1 rounded-md transition-all ${
                    !isBefore
                      ? 'bg-teal-500/20 text-teal-300 font-bold border border-teal-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  After Correction
                </button>
              </div>

              <button
                onClick={() => setIsAutoPlaying(!isAutoPlaying)}
                className="p-1.5 rounded-lg bg-[#141c29] border border-[#1e293b] text-slate-400 hover:text-white transition-colors"
                title={isAutoPlaying ? 'Pause loop' : 'Resume auto-loop'}
              >
                {isAutoPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 text-teal-400" />}
              </button>
            </div>
          </div>

          {/* Progress Line */}
          <div className="w-full h-0.5 bg-[#141c29] overflow-hidden">
            <div
              className="h-full bg-teal-400 transition-all duration-75 ease-linear"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {/* TWO LABELED SLIDERS: Valid Time vs Transaction Time */}
          <div className="py-3 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Slider 1: As of (valid time) */}
            <div className="p-3 rounded-xl bg-[#111723] border border-[#1e293b] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-teal-400" />
                  <span className="font-bold text-slate-200">As of (valid time)</span>
                </div>
                <span className="text-[10px] font-mono text-teal-300 bg-teal-950 px-2 py-0.5 rounded border border-teal-800">
                  {validDate}
                </span>
              </div>
              <div className="text-[10px] text-slate-400 leading-tight">
                When the biological event occurred in the patient's body
              </div>
              <div className="relative pt-1">
                <div className="h-2 rounded-full bg-[#1b2434] overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-teal-600 to-teal-400 transition-all duration-700 ease-out"
                    style={{ width: `${validSliderPos}%` }}
                  />
                </div>
                {/* Thumb */}
                <div
                  className="absolute top-0.5 w-4 h-4 rounded-full bg-teal-400 border-2 border-[#0d131d] shadow-glowTeal transition-all duration-700 ease-out -translate-x-1/2"
                  style={{ left: `${validSliderPos}%` }}
                />
              </div>
            </div>

            {/* Slider 2: Known as of (transaction time) */}
            <div className="p-3 rounded-xl bg-[#111723] border border-[#1e293b] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span className="font-bold text-slate-200">Known as of (transaction time)</span>
                </div>
                <span className="text-[10px] font-mono text-amber-300 bg-amber-950 px-2 py-0.5 rounded border border-amber-800">
                  {sysDate}
                </span>
              </div>
              <div className="text-[10px] text-slate-400 leading-tight">
                What the EHR knowledge base actually had recorded on that date
              </div>
              <div className="relative pt-1">
                <div className="h-2 rounded-full bg-[#1b2434] overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-600 to-amber-400 transition-all duration-700 ease-out"
                    style={{ width: `${sysSliderPos}%` }}
                  />
                </div>
                {/* Thumb */}
                <div
                  className="absolute top-0.5 w-4 h-4 rounded-full bg-amber-400 border-2 border-[#0d131d] shadow-glowAmber transition-all duration-700 ease-out -translate-x-1/2"
                  style={{ left: `${sysSliderPos}%` }}
                />
              </div>
            </div>
          </div>

          {/* DYNAMIC DIAGNOSIS BANNER: "Answer changed because..." */}
          <div
            className={`p-2.5 rounded-xl border text-xs transition-all duration-500 mb-3 flex items-center justify-between gap-3 ${
              isBefore
                ? 'bg-amber-950/30 border-amber-500/40 text-amber-200'
                : 'bg-teal-950/40 border-teal-500/60 text-teal-200 shadow-glowTeal'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="font-bold uppercase tracking-wider text-[10px] px-2 py-0.5 rounded bg-black/40 border border-white/10 font-mono shrink-0">
                {isBefore ? 'Preliminary State' : 'Answer Changed'}
              </span>
              <span className="text-xs font-medium">
                {isBefore
                  ? 'Showing initial Hospital A records before cross-facility serology was matched.'
                  : 'Answer changed because: Initial 1:320 ANA was false positive from spirochete polyclonal stimulation; CDC Western Blot confirmed Disseminated Lyme on Feb 10.'}
              </span>
            </div>
            <span className="text-[10px] font-mono text-slate-400 shrink-0 hidden sm:inline">
              {isBefore ? 'Dr. Stone (Metro Gen)' : 'Dr. Lin (St. Jude)'}
            </span>
          </div>

          {/* DYNAMIC DIAGNOSIS CARDS: Shifting State */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Diagnosis 1: SLE */}
            <div
              className={`p-3 rounded-xl border transition-all duration-500 space-y-1.5 ${
                isBefore
                  ? 'bg-[#151c28] border-teal-500/50 shadow-card'
                  : 'bg-[#12161f] border-amber-500/40 opacity-75'
              }`}
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-100 flex items-center gap-1.5">
                  <Activity className={`w-3.5 h-3.5 ${isBefore ? 'text-teal-400' : 'text-amber-400'}`} />
                  <span className={!isBefore ? 'line-through text-slate-400' : ''}>
                    Systemic Lupus (SLE)
                  </span>
                </span>
                <span
                  className={`text-[9px] font-mono px-2 py-0.5 rounded uppercase font-bold border ${
                    isBefore
                      ? 'bg-teal-950 text-teal-300 border-teal-800'
                      : 'bg-amber-950 text-amber-300 border-amber-800'
                  }`}
                >
                  {isBefore ? 'Active Diagnosis' : 'Superseded'}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 flex items-center justify-between font-mono">
                <span>Metro General • Dr. Stone</span>
                <span>{isBefore ? 'Conf: 88%' : 'Retracted Mar 22'}</span>
              </div>
              <div className="text-[10px] text-slate-400 pt-1 border-t border-white/5 truncate">
                Supported by: ANA IFA Screen 1:320 (LOINC 11572-5)
              </div>
            </div>

            {/* Diagnosis 2: Lyme Arthritis */}
            <div
              className={`p-3 rounded-xl border transition-all duration-500 space-y-1.5 ${
                !isBefore
                  ? 'bg-[#0f211e] border-teal-400 shadow-glowTeal ring-1 ring-teal-400/40'
                  : 'bg-[#12161f] border-slate-800 opacity-40'
              }`}
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-100 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" />
                  <span>Disseminated Lyme Arthritis</span>
                </span>
                <span
                  className={`text-[9px] font-mono px-2 py-0.5 rounded uppercase font-bold border ${
                    !isBefore
                      ? 'bg-teal-950 text-teal-300 border-teal-700'
                      : 'bg-slate-900 text-slate-500 border-slate-800'
                  }`}
                >
                  {!isBefore ? 'Validated Truth (96%)' : 'Not Known in System'}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 flex items-center justify-between font-mono">
                <span>Community Memorial • Dr. Vance</span>
                <span>CDC 2-Tier Confirmed</span>
              </div>
              <div className="text-[10px] text-slate-400 pt-1 border-t border-white/5 truncate">
                Supported by: 5/10 IgG Bands Positive + Anti-dsDNA Negative
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* 4. THREE FEATURE CARDS & PRIMARY "TRY THE DEMO" CTA               */}
      {/* ================================================================= */}
      <div className="px-6 sm:px-10 pb-4 shrink-0 z-20 max-w-6xl w-full mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          {/* Card 1: Time Travel */}
          <div
            onClick={() => onStartDemo('time-travel')}
            className="p-3.5 rounded-xl bg-[#101620]/90 border border-[#1e293b] hover:border-teal-500/60 hover:bg-[#141c29] transition-all cursor-pointer group shadow-card flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="w-8 h-8 rounded-lg bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400 group-hover:scale-110 transition-transform shadow-glowTeal">
                  <History className="w-4 h-4" />
                </div>
                <span className="text-[9px] font-mono text-teal-400 bg-teal-950/80 px-2 py-0.5 rounded border border-teal-800">
                  Dual-Axis Scrubber
                </span>
              </div>
              <h3 className="text-xs font-bold text-white group-hover:text-teal-300 transition-colors">
                Time Travel
              </h3>
              <p className="text-[11px] text-slate-400 mt-1 leading-snug line-clamp-2">
                Scrub biological valid time vs EHR transaction time to audit what the system knew on any historical date.
              </p>
            </div>
            <div className="mt-2 text-[10px] text-teal-400 font-mono flex items-center gap-1 group-hover:translate-x-1 transition-transform">
              <span>Open Scrubber</span>
              <span>→</span>
            </div>
          </div>

          {/* Card 2: Conflict Explainer */}
          <div
            onClick={() => onStartDemo('conflicts')}
            className="p-3.5 rounded-xl bg-[#101620]/90 border border-[#1e293b] hover:border-amber-500/60 hover:bg-[#141c29] transition-all cursor-pointer group shadow-card flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform shadow-glowAmber">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <span className="text-[9px] font-mono text-amber-400 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-800">
                  Multi-Hospital Matrix
                </span>
              </div>
              <h3 className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors">
                Conflict Explainer
              </h3>
              <p className="text-[11px] text-slate-400 mt-1 leading-snug line-clamp-2">
                Surface clinical contradictions between institutions with side-by-side evidence tables and Bayesian confidence.
              </p>
            </div>
            <div className="mt-2 text-[10px] text-amber-400 font-mono flex items-center gap-1 group-hover:translate-x-1 transition-transform">
              <span>Inspect Conflicts</span>
              <span>→</span>
            </div>
          </div>

          {/* Card 3: Audit Trace */}
          <div
            onClick={() => onStartDemo('audit-log')}
            className="p-3.5 rounded-xl bg-[#101620]/90 border border-[#1e293b] hover:border-cyan-500/60 hover:bg-[#141c29] transition-all cursor-pointer group shadow-card flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 group-hover:scale-110 transition-transform">
                  <FileCode className="w-4 h-4" />
                </div>
                <span className="text-[9px] font-mono text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800">
                  Neo4j Provenance
                </span>
              </div>
              <h3 className="text-xs font-bold text-white group-hover:text-cyan-300 transition-colors">
                Audit Trace
              </h3>
              <p className="text-[11px] text-slate-400 mt-1 leading-snug line-clamp-2">
                Inspect transparent reasoning chains with exact Cypher statements, tool execution latencies, and PDF export.
              </p>
            </div>
            <div className="mt-2 text-[10px] text-cyan-400 font-mono flex items-center gap-1 group-hover:translate-x-1 transition-transform">
              <span>View Audit Logs</span>
              <span>→</span>
            </div>
          </div>
        </div>

        {/* Central High-Impact "Try the demo" CTA Bar */}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => onStartDemo('timeline')}
            className="px-8 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-slate-950 font-extrabold text-sm flex items-center gap-2.5 transition-all shadow-[0_0_25px_rgba(45,212,191,0.45)] hover:shadow-[0_0_35px_rgba(45,212,191,0.65)] hover:scale-[1.02] active:scale-95"
          >
            <span>Try the demo</span>
            <span className="text-xs font-mono font-normal opacity-90 pl-1 border-l border-slate-950/30">
              Eleanor Vance preloaded
            </span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ================================================================= */}
      {/* 5. FOOTER STATUS LINE (Compact: ~28px)                            */}
      {/* ================================================================= */}
      <footer className="px-6 h-7 border-t border-[#1e293b]/60 bg-[#06090e] flex items-center justify-between text-[10px] text-slate-500 shrink-0 font-mono z-20">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-teal-400">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400" /> Bitemporal Engine Active
          </span>
          <span className="hidden sm:inline text-slate-600">•</span>
          <span className="hidden sm:inline">3 Participating Health Systems</span>
        </div>
        <div>
          <span>Neo4j Cypher Traversal • SQL:2011 Bi-temporal Standard</span>
        </div>
      </footer>
    </div>
  );
}

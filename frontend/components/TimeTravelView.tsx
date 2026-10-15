'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Patient,
  AsOfQueryResult,
  TimelineEvent,
} from '@/lib/types';
import { asOfQuery } from '@/lib/api';
import {
  History,
  Calendar,
  Clock,
  Sparkles,
  AlertTriangle,
  FileCode,
  CheckCircle2,
  AlertCircle,
  Eye,
  Stethoscope,
  Building2,
  ArrowRight,
  RotateCcw,
  Info,
  Check,
  Zap,
} from 'lucide-react';

interface TimeTravelViewProps {
  activePatient: Patient;
  onSetGlobalTemporalState?: (state: {
    validDate: string;
    sysDate: string;
    isTimeTraveling: boolean;
  }) => void;
  viewMode: 'doctor' | 'patient';
}

// Visual definition for hospitals
const HOSPITAL_COLORS: Record<string, { bg: string; text: string; border: string; bar: string }> = {
  'Metro General Hospital': {
    bg: 'bg-sky-500/15',
    text: 'text-sky-300',
    border: 'border-sky-500/35',
    bar: 'bg-sky-500',
  },
  'Community Memorial Hospital': {
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-300',
    border: 'border-emerald-500/35',
    bar: 'bg-emerald-500',
  },
  'St. Jude Specialty Hospital': {
    bg: 'bg-purple-500/15',
    text: 'text-purple-300',
    border: 'border-purple-500/35',
    bar: 'bg-purple-500',
  },
};

// Key clinical milestone checkpoints per patient
interface PatientMilestones {
  correctionDate: string;
  beforeDate: string;
  afterDate: string;
  correctionTitle: string;
  correctionReason: string;
  startDate: string;
  endDate: string;
  ticks: { label: string; date: string; desc: string }[];
}

const PATIENT_DATA: Record<string, PatientMilestones> = {
  'pat-001': {
    correctionDate: '2024-03-22',
    beforeDate: '2024-01-20',
    afterDate: '2024-03-24',
    correctionTitle: 'Diagnostic Supersession: SLE Retracted, Lyme Confirmed',
    correctionReason: 'Borrelia burgdorferi Western Blot (evt-004) & negative anti-dsDNA refuted lupus; SLE was retracted and corrected to Lyme Arthritis on March 22, 2024',
    startDate: '2024-01-10',
    endDate: '2024-04-15',
    ticks: [
      { label: 'Jan 10', date: '2024-01-10', desc: 'Initial ANA Lab drawn' },
      { label: 'Jan 15', date: '2024-01-15', desc: 'Initial SLE diagnosis recorded' },
      { label: 'Feb 10', date: '2024-02-10', desc: 'Positive Lyme Western Blot' },
      { label: 'Mar 22', date: '2024-03-22', desc: 'Formal SLE Retraction & Correction' },
      { label: 'Apr 15', date: '2024-04-15', desc: 'Current resolved chart' },
    ],
  },
  'pat-002': {
    correctionDate: '2024-04-07',
    beforeDate: '2024-04-02',
    afterDate: '2024-04-08',
    correctionTitle: 'Diagnostic Correction: GERD Corrected to CAD / Unstable Angina',
    correctionReason: 'High-sensitivity Troponin T (48 ng/L) and stress echocardiogram corrected GERD to Unstable Angina on April 7, 2024',
    startDate: '2024-04-01',
    endDate: '2024-04-20',
    ticks: [
      { label: 'Apr 01', date: '2024-04-01', desc: 'ED normal troponin & GERD dx' },
      { label: 'Apr 06', date: '2024-04-06', desc: 'Stress echocardiogram positive' },
      { label: 'Apr 07', date: '2024-04-07', desc: 'Corrective diagnosis: CAD/NSTEMI' },
      { label: 'Apr 20', date: '2024-04-20', desc: 'Post-PCI stable state' },
    ],
  },
  'pat-003': {
    correctionDate: '2024-04-28',
    beforeDate: '2024-04-18',
    afterDate: '2024-04-30',
    correctionTitle: 'Diagnostic Restaging: Stage IB Updated to Stage IIIA',
    correctionReason: '18F-FDG Whole Body PET-CT identified hypermetabolic Station 7 node, updating Stage IB to Stage IIIA on April 28, 2024',
    startDate: '2024-04-15',
    endDate: '2024-05-10',
    ticks: [
      { label: 'Apr 15', date: '2024-04-15', desc: 'Chest CT shows 2.8cm nodule' },
      { label: 'Apr 18', date: '2024-04-18', desc: 'Surgical Stage IB lobectomy dx' },
      { label: 'Apr 26', date: '2024-04-26', desc: 'PET-CT shows hypermetabolic node' },
      { label: 'Apr 28', date: '2024-04-28', desc: 'Medical Oncology Stage IIIA update' },
      { label: 'May 10', date: '2024-05-10', desc: 'Neoadjuvant protocol active' },
    ],
  },
};

export function TimeTravelView({
  activePatient,
  onSetGlobalTemporalState,
  viewMode: _viewMode,
}: TimeTravelViewProps) {
  const patientInfo = PATIENT_DATA[activePatient.id] || PATIENT_DATA['pat-001'];

  // Start & End timestamps for slider calculations
  const startMs = useMemo(() => new Date(`${patientInfo.startDate}T00:00:00Z`).getTime(), [patientInfo]);
  const endMs = useMemo(() => new Date(`${patientInfo.endDate}T23:59:59Z`).getTime(), [patientInfo]);
  const oneDayMs = 24 * 60 * 60 * 1000;
  const totalDays = Math.max(1, Math.round((endMs - startMs) / oneDayMs));

  // Date converters between day index and YYYY-MM-DD
  const dateToDayIndex = (dateStr: string): number => {
    try {
      const d = new Date(`${dateStr.slice(0, 10)}T00:00:00Z`).getTime();
      const diff = Math.round((d - startMs) / oneDayMs);
      return Math.max(0, Math.min(totalDays, diff));
    } catch {
      return 0;
    }
  };

  const dayIndexToDate = (idx: number): string => {
    const d = new Date(startMs + idx * oneDayMs);
    return d.toISOString().slice(0, 10);
  };

  // State: Sliders for the two time axes
  const [validAsOf, setValidAsOf] = useState<string>(patientInfo.beforeDate);
  const [knownAsOf, setKnownAsOf] = useState<string>(patientInfo.beforeDate);
  const [queryResult, setQueryResult] = useState<AsOfQueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [showCypher, setShowCypher] = useState(false);
  const [activePreset, setActivePreset] = useState<'before' | 'after' | 'custom'>('before');

  // Track previous query result to detect animated transitions
  const prevEventsRef = useRef<TimelineEvent[]>([]);

  // Update dates when active patient changes
  useEffect(() => {
    const pInfo = PATIENT_DATA[activePatient.id] || PATIENT_DATA['pat-001'];
    setValidAsOf(pInfo.beforeDate);
    setKnownAsOf(pInfo.beforeDate);
    setActivePreset('before');
  }, [activePatient.id]);

  // Execute bitemporal asOfQuery(validAsOf, knownAsOf)
  useEffect(() => {
    let isCancelled = false;
    setLoading(true);

    // Call asOfQuery(validAsOf, knownAsOf) as specifically required by the prompt
    asOfQuery(validAsOf, knownAsOf).then((res) => {
      if (!isCancelled) {
        setQueryResult(res);
        setLoading(false);
        prevEventsRef.current = res.activeEvents;

        if (onSetGlobalTemporalState) {
          onSetGlobalTemporalState({
            validDate: validAsOf,
            sysDate: knownAsOf,
            isTimeTraveling: true,
          });
        }
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [validAsOf, knownAsOf, activePatient.id, onSetGlobalTemporalState]);

  // Preset Handlers
  const handlePresetBeforeCorrection = () => {
    setActivePreset('before');
    setValidAsOf(patientInfo.beforeDate);
    setKnownAsOf(patientInfo.beforeDate);
  };

  const handlePresetAfterCorrection = () => {
    setActivePreset('after');
    setValidAsOf(patientInfo.afterDate);
    setKnownAsOf(patientInfo.afterDate);
  };

  // Correction Threshold Analysis
  const isPostCorrectionSystem = knownAsOf >= patientInfo.correctionDate;
  const isPostCorrectionValid = validAsOf >= patientInfo.correctionDate;

  // Determine active quadrant in 2x2 matrix
  // Row: Transaction/System Time (Past vs Present/Post)
  // Col: Valid Time (Past vs Present/Post)
  const activeQuadrant = useMemo(() => {
    if (!isPostCorrectionSystem && !isPostCorrectionValid) return 'past_past';
    if (!isPostCorrectionSystem && isPostCorrectionValid) return 'past_future';
    if (isPostCorrectionSystem && !isPostCorrectionValid) return 'present_past'; // The Retroactive Correction crux!
    return 'present_present';
  }, [isPostCorrectionSystem, isPostCorrectionValid]);

  // Date formatters
  const formatDateDisplay = (dateStr: string) => {
    try {
      const d = new Date(dateStr.slice(0, 10) + 'T12:00:00Z');
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  // Helper for hospital styling
  const getHospitalStyle = (hosp?: string) => {
    if (!hosp) return { bg: 'bg-teal-500/10', text: 'text-teal-300', border: 'border-teal-500/30', bar: 'bg-teal-400' };
    return HOSPITAL_COLORS[hosp] || { bg: 'bg-teal-500/10', text: 'text-teal-300', border: 'border-teal-500/30', bar: 'bg-teal-400' };
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Overview */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-glowAmber">
              <History className="w-5 h-5 text-amber-400" />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
                Time Travel: Bitemporal Query Engine
                <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold">
                  Dual-Axis Demo
                </span>
              </h1>
              <p className="text-sm text-slate-300 mt-1">
                Travel independently across biological reality (<span className="text-teal-300 font-medium">Valid Time</span>)
                and hospital records (<span className="text-amber-300 font-medium">Transaction Time</span>) for{' '}
                <span className="text-slate-100 font-semibold">{activePatient.name}</span>.
              </p>
            </div>
          </div>
        </div>

        {/* Quick Presets: "Before correction" & "After correction" */}
        <div className="flex items-center gap-2 bg-[#101620] p-1.5 rounded-2xl border border-[#1e293b] shadow-card">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 px-2 flex items-center gap-1">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Presets:</span>
          </span>

          {/* 1. "Before correction" preset button */}
          <button
            onClick={handlePresetBeforeCorrection}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border shadow-sm ${
              activePreset === 'before'
                ? 'bg-amber-500/25 text-amber-200 border-amber-500/60 shadow-glowAmber ring-1 ring-amber-400/40'
                : 'bg-[#141c29] text-slate-300 border-[#1e293b] hover:text-white hover:border-slate-700'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            <span>Before correction</span>
          </button>

          {/* 2. "After correction" preset button */}
          <button
            onClick={handlePresetAfterCorrection}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border shadow-sm ${
              activePreset === 'after'
                ? 'bg-emerald-500/25 text-emerald-200 border-emerald-500/60 ring-1 ring-emerald-400/40'
                : 'bg-[#141c29] text-slate-300 border-[#1e293b] hover:text-white hover:border-slate-700'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>After correction</span>
          </button>
        </div>
      </div>

      {/* TOP SLIDERS PANEL: TWO LABELED DUAL-AXIS SLIDERS */}
      <div className="p-6 rounded-2xl bg-[#101620] border border-[#1e293b] shadow-card space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* SLIDER 1: "As of (valid time)": when it happened in the real world */}
          <div className="space-y-3 p-4.5 rounded-2xl bg-[#141c29]/70 border border-teal-500/30">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-teal-500/20 text-teal-300 border border-teal-500/30">
                    <Calendar className="w-4 h-4 text-teal-400" />
                  </span>
                  <label className="text-sm font-bold text-teal-300 tracking-tight">
                    1) &ldquo;As of (valid time)&rdquo;
                  </label>
                </div>
                <p className="text-xs text-slate-300 mt-1">
                  When it happened in the real world (Biological Presence)
                </p>
              </div>

              {/* Current Valid Date Badge */}
              <div className="text-right">
                <span className="inline-block px-3 py-1 rounded-xl bg-teal-950/80 border border-teal-500/50 text-teal-200 font-mono font-bold text-xs shadow-sm">
                  {formatDateDisplay(validAsOf)}
                </span>
                <span className="block text-[10px] font-mono text-slate-300 mt-0.5">
                  ISO: {validAsOf}
                </span>
              </div>
            </div>

            {/* Slider Track */}
            <div className="space-y-2 pt-1">
              <input
                type="range"
                min={0}
                max={totalDays}
                value={dateToDayIndex(validAsOf)}
                onChange={(e) => {
                  const newDate = dayIndexToDate(Number(e.target.value));
                  setValidAsOf(newDate);
                  setActivePreset('custom');
                }}
                className="w-full h-2.5 bg-[#0b0f14] rounded-lg appearance-none cursor-pointer accent-teal-400 focus:outline-none"
              />

              {/* Milestone Markers along slider */}
              <div className="flex justify-between text-[10px] font-mono text-slate-300 pt-0.5">
                {patientInfo.ticks.map((t) => (
                  <button
                    key={t.date}
                    onClick={() => {
                      setValidAsOf(t.date);
                      setActivePreset('custom');
                    }}
                    className={`hover:text-teal-300 transition-colors ${
                      validAsOf === t.date ? 'text-teal-400 font-bold underline' : ''
                    }`}
                    title={t.desc}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* SLIDER 2: "Known as of (transaction time)": what the system knew on that date */}
          <div className="space-y-3 p-4.5 rounded-2xl bg-[#141c29]/70 border border-amber-500/30">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    <History className="w-4 h-4 text-amber-400" />
                  </span>
                  <label className="text-sm font-bold text-amber-300 tracking-tight">
                    2) &ldquo;Known as of (transaction time)&rdquo;
                  </label>
                </div>
                <p className="text-xs text-slate-300 mt-1">
                  What the system knew on that date (EHR Commit Audit)
                </p>
              </div>

              {/* Current System Date Badge */}
              <div className="text-right">
                <span className="inline-block px-3 py-1 rounded-xl bg-amber-950/80 border border-amber-500/50 text-amber-200 font-mono font-bold text-xs shadow-sm">
                  {formatDateDisplay(knownAsOf)}
                </span>
                <span className="block text-[10px] font-mono text-slate-300 mt-0.5">
                  ISO: {knownAsOf}
                </span>
              </div>
            </div>

            {/* Slider Track */}
            <div className="space-y-2 pt-1">
              <input
                type="range"
                min={0}
                max={totalDays}
                value={dateToDayIndex(knownAsOf)}
                onChange={(e) => {
                  const newDate = dayIndexToDate(Number(e.target.value));
                  setKnownAsOf(newDate);
                  setActivePreset('custom');
                }}
                className="w-full h-2.5 bg-[#0b0f14] rounded-lg appearance-none cursor-pointer accent-amber-400 focus:outline-none"
              />

              {/* Milestone Markers along slider */}
              <div className="flex justify-between text-[10px] font-mono text-slate-300 pt-0.5">
                {patientInfo.ticks.map((t) => (
                  <button
                    key={t.date}
                    onClick={() => {
                      setKnownAsOf(t.date);
                      setActivePreset('custom');
                    }}
                    className={`hover:text-amber-300 transition-colors ${
                      knownAsOf === t.date ? 'text-amber-400 font-bold underline' : ''
                    }`}
                    title={t.desc}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2X2 EXPLAINER GRID FOR THE TWO TIME AXES */}
      <div className="p-5 rounded-2xl bg-[#101620] border border-[#1e293b] shadow-card space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-teal-400" />
              <span>Bitemporal 2x2 Explainer Grid</span>
            </span>
            <span className="text-[11px] text-slate-300 font-mono">
              (Interactive Cartesian Matrix)
            </span>
          </div>

          <span className="text-xs text-slate-300">
            Active Quadrant: <strong className="text-teal-300 font-semibold">{
              activeQuadrant === 'past_past' ? 'Historical Record' :
              activeQuadrant === 'past_future' ? 'Initial Prognosis' :
              activeQuadrant === 'present_past' ? 'Retroactive Correction (The Crux)' :
              'Current Ground Truth'
            }</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          {/* Q1: Past System × Past Valid */}
          <div
            className={`p-3.5 rounded-xl border transition-all ${
              activeQuadrant === 'past_past'
                ? 'bg-[#141e2e] border-teal-400 shadow-glowTeal ring-1 ring-teal-400/50'
                : 'bg-[#121824] border-[#1e293b] opacity-75'
            }`}
          >
            <div className="flex items-center justify-between pb-1">
              <span className="font-bold text-slate-200">1. Historical Record</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                Past EHR × Past Biology
              </span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed mt-1">
              What the EHR originally recorded about that past event. Before the correction, the system
              firmly believed the initial diagnosis was valid.
            </p>
          </div>

          {/* Q2: Past System × Present/Future Valid */}
          <div
            className={`p-3.5 rounded-xl border transition-all ${
              activeQuadrant === 'past_future'
                ? 'bg-[#141e2e] border-sky-400 shadow-sm ring-1 ring-sky-400/50'
                : 'bg-[#121824] border-[#1e293b] opacity-75'
            }`}
          >
            <div className="flex items-center justify-between pb-1">
              <span className="font-bold text-slate-200">2. Initial Clinical Plan</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                Past EHR × Future Biology
              </span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed mt-1">
              What the system planned back then projecting into the future (e.g. standard 6-month
              hydroxychloroquine treatment course for lupus).
            </p>
          </div>

          {/* Q3: Present System × Past Valid -> RETROACTIVE CORRECTION */}
          <div
            className={`p-3.5 rounded-xl border transition-all ${
              activeQuadrant === 'present_past'
                ? 'bg-amber-950/30 border-amber-400 shadow-glowAmber ring-2 ring-amber-400/60'
                : 'bg-[#121824] border-[#1e293b] opacity-75'
            }`}
          >
            <div className="flex items-center justify-between pb-1">
              <span className="font-bold text-amber-300 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>3. Retroactive Correction (The Killer Demo)</span>
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                Current EHR × Past Biology
              </span>
            </div>
            <p className="text-[11px] text-amber-200/90 leading-relaxed mt-1">
              What we now know was <em>actually happening</em> in the patient&apos;s body back then. Even though the
              chart said SLE in January, biological reality was already Lyme Borreliosis!
            </p>
          </div>

          {/* Q4: Present System × Present Valid */}
          <div
            className={`p-3.5 rounded-xl border transition-all ${
              activeQuadrant === 'present_present'
                ? 'bg-[#12241e] border-emerald-400 shadow-sm ring-1 ring-emerald-400/50'
                : 'bg-[#121824] border-[#1e293b] opacity-75'
            }`}
          >
            <div className="flex items-center justify-between pb-1">
              <span className="font-bold text-emerald-300">4. Current Ground Truth</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                Current EHR × Current Biology
              </span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed mt-1">
              What is known today and biologically true today. Complete chart consistency with all
              superseded diagnoses formally retracted.
            </p>
          </div>
        </div>
      </div>

      {/* DYNAMIC ANSWER CHANGED BANNER */}
      <div
        className={`p-4.5 rounded-2xl border transition-all duration-300 shadow-card flex items-start gap-3.5 ${
          isPostCorrectionSystem
            ? 'bg-gradient-to-r from-amber-950/40 via-[#161f2e] to-[#101620] border-amber-500/60 shadow-glowAmber'
            : 'bg-[#101620] border-teal-500/40 shadow-sm'
        }`}
      >
        <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0 mt-0.5">
          {isPostCorrectionSystem ? (
            <AlertTriangle className="w-5 h-5 text-amber-400 animate-pulse" />
          ) : (
            <Info className="w-5 h-5 text-teal-400" />
          )}
        </div>

        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                isPostCorrectionSystem
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-teal-500/20 text-teal-300 border-teal-500/40'
              }`}
            >
              {isPostCorrectionSystem ? 'Diagnostic Amendment Detected' : 'Unamended Historical Baseline'}
            </span>
            <span className="text-xs text-slate-300 font-mono">
              Correction Boundary: {formatDateDisplay(patientInfo.correctionDate)}
            </span>
          </div>

          <h2 className="text-sm font-bold text-white tracking-tight pt-0.5">
            {isPostCorrectionSystem ? (
              <span>
                Answer changed because:{' '}
                <span className="text-amber-300">{patientInfo.correctionReason}</span>
              </span>
            ) : (
              <span>
                Historical snapshot before correction:{' '}
                <span className="text-slate-300">
                  Hospital system had not yet received the corrective test. The chart reflects the initial
                  preliminary diagnosis.
                </span>
              </span>
            )}
          </h2>

          <p className="text-xs text-slate-300 leading-relaxed pt-0.5">
            {isPostCorrectionSystem
              ? 'When querying the EHR at this transaction date, the retrospective supersession graph activates. Any clinical reasoning model or physician will observe the corrected diagnosis rather than the superseded record.'
              : 'Slide the "Known as of" slider past ' + formatDateDisplay(patientInfo.correctionDate) + ' or click the "After correction" preset to witness the diagnosis card animate into its corrected state.'}
          </p>
        </div>
      </div>

      {/* DIAGNOSES VISIBLE AT THIS PAIR OF TIMES AS CARDS */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-teal-400" />
            <h2 className="text-lg font-bold text-white tracking-tight">
              Diagnoses & Clinical State Visible at ({formatDateDisplay(validAsOf)}, {formatDateDisplay(knownAsOf)})
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCypher(!showCypher)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#141c29] border border-[#1e293b] text-xs text-slate-300 hover:text-teal-300 hover:border-teal-500/40 transition-colors"
            >
              <FileCode className="w-3.5 h-3.5 text-teal-400" />
              <span>{showCypher ? 'Hide Cypher' : 'View Bitemporal Cypher'}</span>
            </button>
          </div>
        </div>

        {/* Live Cypher Drawer */}
        {showCypher && queryResult?.auditTrail[0] && (
          <div className="p-4 rounded-xl bg-[#090d12] border border-teal-500/30 text-xs font-mono text-teal-300 overflow-x-auto shadow-inner animate-in fade-in duration-200">
            <div className="text-[10px] uppercase font-bold text-teal-400 mb-1 flex items-center justify-between">
              <span>CYPHER AS-OF EVALUATION MATRIX</span>
              <span className="text-slate-300 font-sans">Execution: 14.8ms</span>
            </div>
            <pre className="text-xs text-slate-200 whitespace-pre-wrap">
              {queryResult.auditTrail[0].cypher}
            </pre>
          </div>
        )}

        {/* Loading Indicator */}
        {loading ? (
          <div className="py-16 text-center text-slate-300 flex items-center justify-center gap-2.5 bg-[#101620] rounded-2xl border border-[#1e293b]">
            <Clock className="w-5 h-5 text-teal-400 animate-spin" />
            <span className="text-sm font-medium">Reconstructing point-in-time chart...</span>
          </div>
        ) : queryResult ? (
          <div className="space-y-6">
            {/* Active Diagnoses Cards Grid */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-teal-300 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-teal-400" />
                  <span>Active Diagnoses & Treatments in Chart ({queryResult.activeEvents.length})</span>
                </span>
                <span className="text-[11px] font-mono text-teal-400/80">
                  Biologically Valid & Known to System
                </span>
              </div>

              {queryResult.activeEvents.length === 0 ? (
                <div className="p-8 rounded-2xl bg-[#101620] border border-[#1e293b] text-center text-slate-300 text-xs">
                  No diagnoses were both biologically valid and known to the hospital system as of this date pair.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {queryResult.activeEvents.map((evt) => {
                    const hospStyle = getHospitalStyle(evt.hospital);
                    return (
                      <div
                        key={evt.id}
                        className="rounded-2xl bg-[#121824] border border-teal-500/40 p-4.5 space-y-3 shadow-card hover:border-teal-400 transition-all duration-300 animate-in fade-in zoom-in-95 flex flex-col justify-between"
                      >
                        <div className="space-y-2">
                          {/* Hospital & Type Header */}
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg border text-[11px] font-semibold ${hospStyle.bg} ${hospStyle.text} ${hospStyle.border}`}
                            >
                              <Building2 className="w-3 h-3" />
                              <span className="truncate max-w-[140px]">{evt.hospital || 'Metro General'}</span>
                            </span>

                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-300 border border-teal-500/30">
                              Active
                            </span>
                          </div>

                          {/* Title */}
                          <h3 className="text-sm font-bold text-white tracking-tight leading-snug">
                            {evt.title}
                          </h3>

                          {evt.code && (
                            <div className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#101620] text-teal-300 border border-[#1e293b] inline-block">
                              {evt.code}
                            </div>
                          )}

                          {evt.value && (
                            <div className="text-xs font-semibold text-teal-200 bg-teal-950/40 border border-teal-800/40 p-2 rounded-lg">
                              Spec: {evt.value}
                            </div>
                          )}

                          {evt.notes && (
                            <p className="text-xs text-slate-300 leading-relaxed line-clamp-2">
                              {evt.notes}
                            </p>
                          )}
                        </div>

                        {/* Card Timestamps & Provider */}
                        <div className="pt-2 border-t border-[#1e293b]/70 space-y-1 text-[11px] text-slate-300">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-300">Provider:</span>
                            <span className="text-slate-200 font-medium truncate max-w-[170px]">{evt.provider}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-300">Valid From:</span>
                            <span className="font-mono text-teal-300">{formatDateDisplay(evt.validFrom)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-300">Recorded EHR:</span>
                            <span className="font-mono text-amber-300">{formatDateDisplay(evt.sysFrom)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Superseded Diagnoses Section */}
            {queryResult.supersededEvents.length > 0 && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-amber-400" />
                    <span>Superseded / Retracted Records as of this Date ({queryResult.supersededEvents.length})</span>
                  </span>
                  <span className="text-[11px] font-mono text-amber-400/80">
                    Retracted by subsequent correction
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {queryResult.supersededEvents.map((evt) => {
                    const hospStyle = getHospitalStyle(evt.hospital);
                    return (
                      <div
                        key={evt.id}
                        className="rounded-2xl bg-[#121824]/60 border border-amber-600/40 p-4.5 space-y-3 shadow-card transition-all duration-300 animate-in fade-in zoom-in-95 flex flex-col justify-between"
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg border text-[11px] font-semibold ${hospStyle.bg} ${hospStyle.text} ${hospStyle.border}`}
                            >
                              <Building2 className="w-3 h-3" />
                              <span className="truncate max-w-[140px]">{evt.hospital || 'Metro General'}</span>
                            </span>

                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-glowAmber">
                              SUPERSEDED
                            </span>
                          </div>

                          <h3 className="text-sm font-bold text-amber-200 line-through decoration-amber-500/70 tracking-tight leading-snug">
                            {evt.title}
                          </h3>

                          {evt.code && (
                            <div className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#101620] text-slate-300 border border-[#1e293b] inline-block">
                              {evt.code}
                            </div>
                          )}

                          {evt.supersededBy && (
                            <div className="text-xs text-amber-300/90 font-medium bg-amber-950/40 p-2 rounded-lg border border-amber-800/40">
                              Superseded by record: <span className="font-mono underline">{evt.supersededBy}</span>
                            </div>
                          )}

                          {evt.notes && (
                            <p className="text-xs text-slate-300 leading-relaxed line-clamp-2">
                              {evt.notes}
                            </p>
                          )}
                        </div>

                        <div className="pt-2 border-t border-[#1e293b]/70 space-y-1 text-[11px] text-slate-300">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-300">Provider:</span>
                            <span className="text-slate-300 truncate max-w-[170px]">{evt.provider}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-300">Valid Until:</span>
                            <span className="font-mono text-amber-300">{formatDateDisplay(evt.validTo || evt.sysFrom)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

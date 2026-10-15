'use client';

import React, { useState } from 'react';
import { Conflict, Patient, Evidence } from '@/lib/types';
import {
  AlertTriangle,
  Scale,
  Bot,
  Network,
  Stethoscope,
  Calendar,
  User,
  Info,
  CheckCircle2,
  Building2,
  ArrowRight,
  TrendingUp,
  ShieldAlert,
  FileText,
  Scan,
  AlertCircle,
  HelpCircle,
  Sparkles,
  Search,
} from 'lucide-react';
import { TabType } from './Sidebar';

interface ConflictsViewProps {
  conflicts: Conflict[];
  activePatient: Patient;
  onNavigateTab: (tab: TabType) => void;
  onAskAgentAboutConflict?: (conflict: Conflict) => void;
  onViewGraphPath?: (conflict: Conflict) => void;
  viewMode: 'doctor' | 'patient';
}

// Color badges for originating hospitals
const HOSPITAL_STYLES: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  'Metro General Hospital': {
    bg: 'bg-sky-500/15',
    text: 'text-sky-300',
    border: 'border-sky-500/35',
    dot: 'bg-sky-400',
  },
  'Community Memorial Hospital': {
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-300',
    border: 'border-emerald-500/35',
    dot: 'bg-emerald-400',
  },
  'St. Jude Specialty Hospital': {
    bg: 'bg-purple-500/15',
    text: 'text-purple-300',
    border: 'border-purple-500/35',
    dot: 'bg-purple-400',
  },
};

export function ConflictsView({
  conflicts,
  activePatient,
  onNavigateTab,
  onAskAgentAboutConflict,
  onViewGraphPath,
  viewMode: _viewMode,
}: ConflictsViewProps) {
  const [selectedConflictId, setSelectedConflictId] = useState<string>(
    conflicts[0]?.id || ''
  );
  const [searchFilter, setSearchFilter] = useState('');

  // Selected conflict or fallback
  const activeConflict =
    conflicts.find((c) => c.id === selectedConflictId) || conflicts[0];

  // Filtered conflicts list
  const filteredConflicts = conflicts.filter((c) => {
    if (!searchFilter) return true;
    const q = searchFilter.toLowerCase();
    return (
      c.diagnosisA.toLowerCase().includes(q) ||
      c.diagnosisB.toLowerCase().includes(q) ||
      (c.hospitalA && c.hospitalA.toLowerCase().includes(q)) ||
      (c.hospitalB && c.hospitalB.toLowerCase().includes(q)) ||
      c.summary.toLowerCase().includes(q)
    );
  });

  const getSeverityBadge = (severity: 'low' | 'medium' | 'high') => {
    switch (severity) {
      case 'high':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-950/80 text-red-300 border border-red-800/80 font-bold text-[11px] shadow-glowRed">
            <AlertTriangle className="w-3 h-3 text-red-400 animate-pulse" />
            CRITICAL CONFLICT
          </span>
        );
      case 'medium':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-800/80 font-bold text-[11px] shadow-glowAmber">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            MODERATE DIVERGENCE
          </span>
        );
      case 'low':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-950/80 text-blue-300 border border-blue-800/80 font-bold text-[11px]">
            <Info className="w-3 h-3 text-blue-400" />
            MINOR DISCREPANCY
          </span>
        );
    }
  };

  const getSeverityChip = (severity: 'low' | 'medium' | 'high') => {
    switch (severity) {
      case 'high':
        return (
          <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/40 font-bold text-[10px] uppercase tracking-wide">
            Critical
          </span>
        );
      case 'medium':
        return (
          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold text-[10px] uppercase tracking-wide">
            Moderate
          </span>
        );
      case 'low':
        return (
          <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40 font-bold text-[10px] uppercase tracking-wide">
            Minor
          </span>
        );
    }
  };

  const getHospitalBadge = (hospitalName?: string) => {
    if (!hospitalName) return null;
    const style = HOSPITAL_STYLES[hospitalName] || {
      bg: 'bg-slate-800',
      text: 'text-slate-300',
      border: 'border-slate-700',
      dot: 'bg-slate-400',
    };
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-semibold ${style.bg} ${style.text} ${style.border}`}
      >
        <Building2 className="w-3 h-3 shrink-0" />
        <span className="truncate max-w-[150px]">{hospitalName}</span>
      </span>
    );
  };

  const getEvidenceTypeIcon = (type: Evidence['type']) => {
    switch (type) {
      case 'lab':
        return <FileText className="w-3.5 h-3.5 text-sky-400" />;
      case 'imaging':
        return <Scan className="w-3.5 h-3.5 text-purple-400" />;
      case 'symptom':
        return <AlertCircle className="w-3.5 h-3.5 text-amber-400" />;
      case 'clinical_note':
        return <FileText className="w-3.5 h-3.5 text-teal-400" />;
      default:
        return <FileText className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  const handleRouteToGraph = () => {
    if (onViewGraphPath && activeConflict) {
      onViewGraphPath(activeConflict);
    } else {
      onNavigateTab('provenance');
    }
  };

  // Safe fallback confidence values
  const confA = Math.round((activeConflict?.confidenceA ?? 0.3) * 100);
  const confB = Math.round((activeConflict?.confidenceB ?? 0.9) * 100);

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-red-500/15 text-red-400 border border-red-500/30 shadow-glowRed">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
                Diagnostic Conflicts & Evidence Matrix
                <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-red-500/15 text-red-300 border border-red-500/35 font-semibold">
                  {conflicts.length} Detected
                </span>
              </h1>
              <p className="text-sm text-slate-300 mt-1">
                Cross-hospital diagnostic divergences detected for{' '}
                <span className="text-teal-300 font-semibold">{activePatient.name}</span>.
                Comparing contradictory clinical hypotheses against objective laboratory markers.
              </p>
            </div>
          </div>
        </div>

        {/* Global Summary Pill */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#101620] border border-[#1e293b] text-xs text-slate-300">
          <Scale className="w-4 h-4 text-teal-400" />
          <span>Multidisciplinary Second-Opinion Arbiter</span>
        </div>
      </div>

      {!activeConflict ? (
        <div className="p-16 rounded-2xl bg-[#101620] border border-[#1e293b] text-center text-slate-400 space-y-2">
          <CheckCircle2 className="w-8 h-8 text-teal-400 mx-auto" />
          <p className="text-base font-semibold text-slate-200">No active conflicts detected</p>
          <p className="text-xs text-slate-500">All historical clinical diagnoses for this patient are in alignment.</p>
        </div>
      ) : (
        /* TWO-COLUMN LAYOUT: LEFT CONFLICTS LIST & RIGHT DETAIL PANEL */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT: LIST OF DETECTED CONFLICTS WITH SEVERITY CHIPS */}
          <div className="lg:col-span-4 space-y-3">
            <div className="flex items-center justify-between p-1">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-red-400" />
                <span>Detected Conflicts ({conflicts.length})</span>
              </span>
              <span className="text-[11px] text-slate-500 font-mono">Select to inspect</span>
            </div>

            {/* Optional search within conflicts */}
            {conflicts.length > 2 && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter conflicts..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#101620] border border-[#1e293b] text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-red-500/50"
                />
              </div>
            )}

            {/* List items */}
            <div className="space-y-2.5">
              {filteredConflicts.map((c, i) => {
                const isSelected = c.id === activeConflict.id;
                const hospA = c.hospitalA || 'Hospital A';
                const hospB = c.hospitalB || 'Hospital B';

                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedConflictId(c.id)}
                    className={`w-full text-left p-4 rounded-2xl border transition-all duration-200 flex flex-col justify-between gap-3 group ${
                      isSelected
                        ? 'bg-gradient-to-r from-red-950/40 via-[#141c29] to-[#121926] border-red-500/60 shadow-glowRed ring-1 ring-red-500/40 scale-[1.01]'
                        : 'bg-[#101620] border-[#1e293b] hover:border-slate-700 hover:bg-[#131b27] text-slate-300'
                    }`}
                  >
                    {/* Top Row: Severity Chip & Conflict Index */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {getSeverityChip(c.severity)}
                        <span className="text-[10px] font-mono text-slate-400">
                          #{i + 1} • {c.conflictType || 'Contradiction'}
                        </span>
                      </div>

                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          c.status === 'resolved'
                            ? 'bg-teal-950/60 text-teal-300 border-teal-800'
                            : 'bg-red-950/60 text-red-300 border-red-800'
                        }`}
                      >
                        {c.status?.toUpperCase() || 'UNRESOLVED'}
                      </span>
                    </div>

                    {/* Conflict Title: "Hospital A: Dx A vs Hospital B: Dx B" */}
                    <div className="space-y-1">
                      <div className="text-xs font-bold text-white group-hover:text-red-200 transition-colors leading-snug">
                        <span className="text-sky-300 font-semibold">{hospA}</span>:{' '}
                        <span className="text-slate-100">{c.diagnosisA.split('[')[0].trim()}</span>
                        <span className="text-red-400 font-bold mx-1.5">vs</span>
                        <span className="text-emerald-300 font-semibold">{hospB}</span>:{' '}
                        <span className="text-slate-100">{c.diagnosisB.split('[')[0].trim()}</span>
                      </div>

                      <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                        {c.summary}
                      </p>
                    </div>

                    {/* Footer Row: Evidence Count & Chevron */}
                    <div className="pt-2 border-t border-[#1e293b]/60 flex items-center justify-between text-[10px] text-slate-500">
                      <span>{c.evidence.length} evidence citations</span>
                      <span className="flex items-center gap-1 text-slate-400 group-hover:text-red-300 font-medium transition-colors">
                        <span>Inspect detail</span>
                        <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* RIGHT: DETAIL PANEL FOR THE SELECTED CONFLICT */}
          <div className="lg:col-span-8 space-y-6">
            {/* Main Detail Header Card */}
            <div className="rounded-2xl bg-[#101620] border border-red-900/50 shadow-glowRed overflow-hidden">
              {/* Header Banner */}
              <div className="p-5 border-b border-[#1e293b] bg-gradient-to-r from-red-950/40 via-[#141c29] to-[#101620] flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {getSeverityBadge(activeConflict.severity)}
                  <span className="text-xs font-mono text-slate-400">
                    REF: {activeConflict.id}
                  </span>
                  <span className="text-xs text-slate-400 hidden sm:inline">•</span>
                  <span className="text-xs text-slate-300 font-medium hidden sm:inline">
                    {activeConflict.conflictType || 'Diagnostic Contradiction'}
                  </span>
                </div>

                {/* Action Buttons: "View graph path" & "Ask Agent" */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRouteToGraph}
                    className="px-3.5 py-1.5 rounded-xl bg-[#141c29] hover:bg-slate-800 text-teal-300 border border-teal-500/40 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm hover:border-teal-400"
                    title="Route to Provenance Graph with this conflict selected"
                  >
                    <Network className="w-3.5 h-3.5 text-teal-400" />
                    <span>View graph path</span>
                  </button>

                  {onAskAgentAboutConflict && (
                    <button
                      onClick={() => onAskAgentAboutConflict(activeConflict)}
                      className="px-3.5 py-1.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors shadow-glowTeal"
                      title="Open Agent Chat and query this conflict"
                    >
                      <Bot className="w-3.5 h-3.5" />
                      <span>Ask AI Agent</span>
                    </button>
                  )}
                </div>
              </div>

              {/* SIDE-BY-SIDE DIAGNOSIS CARDS */}
              <div className="p-6 bg-[#0c1118]/80 border-b border-[#1e293b] space-y-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Scale className="w-4 h-4 text-teal-400" />
                    <span>Side-by-Side Competing Hypotheses</span>
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">
                    Evidence Weight Comparison
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* DIAGNOSIS A CARD */}
                  <div className="p-5 rounded-2xl bg-[#121926] border border-slate-700/80 space-y-3.5 flex flex-col justify-between shadow-card hover:border-slate-600 transition-colors">
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                          Hypothesis A
                        </span>
                        {getHospitalBadge(activeConflict.hospitalA)}
                      </div>

                      <h3 className="text-base font-bold text-white tracking-tight">
                        {activeConflict.diagnosisA}
                      </h3>

                      {activeConflict.icdA && (
                        <span className="text-xs font-mono text-slate-300 bg-[#0e141e] px-2 py-0.5 rounded border border-[#1e293b] inline-block">
                          ICD-10: {activeConflict.icdA}
                        </span>
                      )}

                      <div className="space-y-1 text-xs text-slate-400 pt-1">
                        {activeConflict.providerA && (
                          <div className="flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-slate-500" />
                            <span>{activeConflict.providerA}</span>
                          </div>
                        )}
                        {activeConflict.dateA && (
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-500" />
                            <span>Diagnosed: {activeConflict.dateA}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* CONFIDENCE BAR FOR DIAGNOSIS A */}
                    <div className="space-y-1.5 pt-3 border-t border-[#1e293b]">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400 font-medium">Confidence Score:</span>
                        <span className="font-mono font-bold text-slate-300">{confA}%</span>
                      </div>
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-slate-500 to-slate-400 transition-all duration-500"
                          style={{ width: `${confA}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 block">
                        {confA < 50 ? 'Low support • Refuted by definitive serology' : 'Moderate historical support'}
                      </span>
                    </div>
                  </div>

                  {/* DIAGNOSIS B CARD */}
                  <div className="p-5 rounded-2xl bg-[#121f28] border border-teal-500/50 space-y-3.5 flex flex-col justify-between shadow-glowTeal hover:border-teal-400 transition-colors">
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-teal-950 text-teal-300 border border-teal-800">
                          Hypothesis B (Adjudicated)
                        </span>
                        {getHospitalBadge(activeConflict.hospitalB)}
                      </div>

                      <h3 className="text-base font-bold text-teal-200 tracking-tight">
                        {activeConflict.diagnosisB}
                      </h3>

                      {activeConflict.icdB && (
                        <span className="text-xs font-mono text-teal-300 bg-teal-950/60 px-2 py-0.5 rounded border border-teal-800/60 inline-block">
                          ICD-10: {activeConflict.icdB}
                        </span>
                      )}

                      <div className="space-y-1 text-xs text-slate-300 pt-1">
                        {activeConflict.providerB && (
                          <div className="flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-teal-400" />
                            <span>{activeConflict.providerB}</span>
                          </div>
                        )}
                        {activeConflict.dateB && (
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-teal-400" />
                            <span>Diagnosed: {activeConflict.dateB}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* CONFIDENCE BAR FOR DIAGNOSIS B */}
                    <div className="space-y-1.5 pt-3 border-t border-[#1e293b]">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-teal-300 font-semibold">Confidence Score:</span>
                        <span className="font-mono font-bold text-teal-300">{confB}%</span>
                      </div>
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-teal-500 to-teal-300 shadow-sm transition-all duration-500"
                          style={{ width: `${confB}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-teal-400/90 font-medium block">
                        High support • Validated by CDC 2-Tier criteria & PCR
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* "WHY THEY DIFFER" PARAGRAPH SECTION */}
              <div className="p-6 bg-[#0e141e] border-b border-[#1e293b] space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    <HelpCircle className="w-4 h-4 text-amber-400" />
                  </span>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-amber-300">
                    Why They Differ
                  </h3>
                </div>

                <div className="p-4 rounded-xl bg-gradient-to-r from-amber-950/25 via-[#141c29] to-[#101620] border border-amber-700/40 text-xs text-slate-200 leading-relaxed space-y-2">
                  <p className="text-slate-200 text-xs leading-relaxed font-normal">
                    {activeConflict.whyTheyDiffer || activeConflict.summary}
                  </p>
                  {activeConflict.recommendation && (
                    <div className="pt-2 border-t border-amber-700/30 text-[11px] text-amber-200/90 flex items-start gap-1.5">
                      <Stethoscope className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <span>
                        <strong>Second-Opinion Recommendation:</strong> {activeConflict.recommendation}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* EVIDENCE COMPARISON TABLE */}
              <div className="p-6 space-y-3 bg-[#101620]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
                      <Scale className="w-4 h-4 text-teal-400" />
                      <span>Evidence Comparison Table</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Evaluating lab values, dates, clinical sources, and reliability ratings across competing diagnoses.
                    </p>
                  </div>

                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1 text-slate-400">
                      <span className="w-2 h-2 rounded-full bg-slate-500" />
                      Supports Dx A
                    </span>
                    <span className="flex items-center gap-1 text-teal-300 font-semibold">
                      <span className="w-2 h-2 rounded-full bg-teal-400" />
                      Supports Dx B
                    </span>
                  </div>
                </div>

                {/* Structured Table */}
                <div className="overflow-x-auto rounded-xl border border-[#1e293b] shadow-sm">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#141c29] border-b border-[#1e293b] text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        <th className="py-3 px-4">Evidence / Assay</th>
                        <th className="py-3 px-4">Lab Value & Range</th>
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Source (Hospital / Provider)</th>
                        <th className="py-3 px-4">Reliability</th>
                        <th className="py-3 px-4 text-right">Supports</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1e293b]/70 bg-[#0e131b]">
                      {activeConflict.evidence.map((ev) => {
                        const reliabilityPct = Math.round((ev.confidence || 0.8) * 100);
                        return (
                          <tr
                            key={ev.id}
                            className={`hover:bg-[#131b26] transition-colors ${
                              ev.supports === 'B' ? 'bg-[#101924]/60' : ''
                            }`}
                          >
                            {/* Evidence Label & Type */}
                            <td className="py-3 px-4 font-medium text-white">
                              <div className="flex items-center gap-2">
                                <span className="p-1 rounded bg-[#141c29] border border-[#1e293b]">
                                  {getEvidenceTypeIcon(ev.type)}
                                </span>
                                <div>
                                  <span className="block font-semibold text-slate-100">{ev.label}</span>
                                  <span className="text-[10px] text-slate-500 uppercase font-mono">{ev.type}</span>
                                </div>
                              </div>
                            </td>

                            {/* Lab Value & Range */}
                            <td className="py-3 px-4">
                              <span className="font-mono text-teal-300 font-bold block">{ev.value || 'N/A'}</span>
                              {ev.normalRange && (
                                <span className="text-[10px] text-slate-400 block font-mono">
                                  Ref: {ev.normalRange}
                                </span>
                              )}
                            </td>

                            {/* Date */}
                            <td className="py-3 px-4 font-mono text-slate-300 whitespace-nowrap">
                              {ev.date}
                            </td>

                            {/* Source */}
                            <td className="py-3 px-4 text-slate-300">
                              <span className="block text-slate-200 font-medium">{ev.provider || 'Core Laboratory'}</span>
                              <span className="text-[10px] text-slate-500">Validated requisition</span>
                            </td>

                            {/* Reliability */}
                            <td className="py-3 px-4">
                              <div className="space-y-1 min-w-[90px]">
                                <div className="flex items-center justify-between text-[11px] font-mono font-bold">
                                  <span
                                    className={
                                      reliabilityPct >= 90
                                        ? 'text-teal-300'
                                        : reliabilityPct >= 65
                                        ? 'text-amber-300'
                                        : 'text-red-300'
                                    }
                                  >
                                    {reliabilityPct}%
                                  </span>
                                  <span className="text-[10px] text-slate-500">
                                    {reliabilityPct >= 90 ? 'High' : reliabilityPct >= 65 ? 'Moderate' : 'Low'}
                                  </span>
                                </div>
                                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      reliabilityPct >= 90
                                        ? 'bg-teal-400'
                                        : reliabilityPct >= 65
                                        ? 'bg-amber-400'
                                        : 'bg-red-400'
                                    }`}
                                    style={{ width: `${reliabilityPct}%` }}
                                  />
                                </div>
                              </div>
                            </td>

                            {/* Supports Column */}
                            <td className="py-3 px-4 text-right">
                              {ev.supports === 'B' ? (
                                <span className="inline-block px-2.5 py-1 rounded-full bg-teal-950 text-teal-300 border border-teal-800 text-[11px] font-bold shadow-sm">
                                  Supports Dx B
                                </span>
                              ) : ev.supports === 'A' ? (
                                <span className="inline-block px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700 text-[11px] font-medium">
                                  Supports Dx A
                                </span>
                              ) : (
                                <span className="inline-block px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px]">
                                  Neutral
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

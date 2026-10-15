import React, { useState } from 'react';
import {
  ChevronDown,
  ShieldAlert,
  Download,
  Stethoscope,
  User,
  Info,
  Check,
  Home,
} from 'lucide-react';
import { Patient } from '@/lib/types';
import { MOCK_PATIENTS } from '@/lib/mock';

interface TopBarProps {
  activePatient: Patient;
  onSelectPatient: (patient: Patient) => void;
  viewMode: 'doctor' | 'patient';
  onToggleViewMode: (mode: 'doctor' | 'patient') => void;
  onOpenReport: () => void;
  onGoToLanding?: () => void;
  temporalState?: {
    validDate: string;
    sysDate: string;
    isTimeTraveling: boolean;
  };
  onResetTimeTravel?: () => void;
}

export function TopBar({
  activePatient,
  onSelectPatient,
  viewMode,
  onToggleViewMode,
  onOpenReport,
  onGoToLanding,
  temporalState,
  onResetTimeTravel,
}: TopBarProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showSyntheticInfo, setShowSyntheticInfo] = useState(false);

  return (
    <header className="h-16 bg-[#0b0f14]/90 backdrop-blur-md border-b border-[#1e293b]/80 px-6 flex items-center justify-between sticky top-0 z-20">
      {/* Left: Patient Selector & Temporal Status */}
      <div className="flex items-center gap-4">
        {/* Patient Selector Dropdown */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-3 px-3 py-2 rounded-xl bg-[#141c29] border border-[#1e293b] hover:border-teal-500/50 hover:bg-[#182333] transition-all text-left shadow-card"
          >
            <div className="w-8 h-8 rounded-full bg-teal-500/20 border border-teal-500/30 flex items-center justify-center font-bold text-teal-300 text-xs">
              {activePatient.name
                .split(' ')
                .map((n) => n[0])
                .join('')}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-100">
                  {activePatient.name}
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  {activePatient.mrn}
                </span>
                {activePatient.conflictCount > 0 && (
                  <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                )}
              </div>
              <div className="text-[11px] text-slate-300">
                {activePatient.age}yo • {activePatient.primaryCondition}
              </div>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-300 ml-1" />
          </button>

          {/* Dropdown Menu */}
          {dropdownOpen && (
            <div className="absolute top-full left-0 mt-2 w-96 rounded-xl bg-[#101620] border border-[#1e293b] shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95">
              <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-300 border-b border-[#1e293b]/70 flex items-center justify-between">
                <span>Select Patient Case</span>
                <span className="text-teal-400 font-mono">3 Available Cases</span>
              </div>

              <div className="py-1 space-y-1">
                {MOCK_PATIENTS.map((p) => {
                  const isSelected = p.id === activePatient.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        onSelectPatient(p);
                        setDropdownOpen(false);
                      }}
                      className={`w-full text-left p-2.5 rounded-lg transition-all flex items-start gap-3 border ${
                        isSelected
                          ? 'bg-teal-500/15 border-teal-500/40 text-teal-100'
                          : 'bg-transparent border-transparent hover:bg-slate-900/80 hover:border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                        {p.name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-slate-200">
                            {p.name}
                          </span>
                          <span className="text-[10px] font-mono text-slate-300">
                            {p.mrn}
                          </span>
                        </div>
                        <div className="text-xs text-slate-300 truncate mt-0.5">
                          {p.primaryCondition}
                        </div>
                        <div className="flex items-center gap-2 mt-1.5">
                          {p.conflictCount > 0 ? (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-950/70 border border-red-800/60 text-red-300">
                              {p.conflictCount} Conflict{p.conflictCount > 1 ? 's' : ''}
                            </span>
                          ) : (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-teal-950/70 border border-teal-800/60 text-teal-300">
                              Resolved
                            </span>
                          )}
                          <span className="text-[10px] text-slate-300">
                            Encounter: {p.lastEncounter}
                          </span>
                        </div>
                      </div>

                      {isSelected && (
                        <Check className="w-4 h-4 text-teal-400 mt-1 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Time Travel Active Status Indicator */}
        {temporalState?.isTimeTraveling && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs shadow-glowAmber">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span className="font-medium">
              Time Machine Snapshot: {temporalState.validDate}
            </span>
            {onResetTimeTravel && (
              <button
                onClick={onResetTimeTravel}
                className="ml-1 text-[10px] underline hover:text-amber-200 font-mono"
              >
                Reset to Present
              </button>
            )}
          </div>
        )}
      </div>

      {/* Right: Badges & View Controls */}
      <div className="flex items-center gap-3">
        {/* Landing Page Link */}
        {onGoToLanding && (
          <button
            onClick={onGoToLanding}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#141c29] border border-[#1e293b] hover:border-teal-500/50 hover:bg-[#182333] text-slate-300 hover:text-teal-300 transition-all text-xs font-medium shadow-card"
            title="Return to AsOf Landing Page"
          >
            <Home className="w-3.5 h-3.5 text-teal-400" />
            <span className="hidden md:inline">Landing Page</span>
          </button>
        )}

        {/* Doctor vs Patient Persona Toggle */}
        <div className="flex items-center p-1 rounded-xl bg-[#141c29] border border-[#1e293b]">
          <button
            onClick={() => onToggleViewMode('doctor')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
              viewMode === 'doctor'
                ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40 shadow-sm'
                : 'text-slate-300 hover:text-slate-200'
            }`}
            title="Clinician view: Detailed LOINC, ICD codes, and Cypher graph traces"
          >
            <Stethoscope className="w-3.5 h-3.5" />
            <span>Doctor View</span>
          </button>
          <button
            onClick={() => onToggleViewMode('patient')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
              viewMode === 'patient'
                ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40 shadow-sm'
                : 'text-slate-300 hover:text-slate-200'
            }`}
            title="Patient view: Plain English conflict explanations and timeline"
          >
            <User className="w-3.5 h-3.5" />
            <span>Patient View</span>
          </button>
        </div>

        {/* Second Opinion Report Button */}
        <button
          onClick={onOpenReport}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-500 text-slate-950 hover:bg-teal-400 font-semibold text-xs transition-all shadow-glowTeal"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export Report</span>
        </button>

        {/* Synthetic Data Badge */}
        <div className="relative">
          <button
            onClick={() => setShowSyntheticInfo(!showSyntheticInfo)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#101620] border border-amber-500/40 text-amber-400 text-xs font-medium hover:border-amber-400 transition-colors shadow-sm"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            <span>Synthetic data only</span>
            <Info className="w-3 h-3 text-amber-400/70 ml-0.5" />
          </button>

          {showSyntheticInfo && (
            <div className="absolute right-0 top-full mt-2 w-72 rounded-xl bg-[#141c29] border border-[#1e293b] p-3 text-xs text-slate-300 shadow-2xl z-50 animate-in fade-in">
              <div className="font-semibold text-slate-100 flex items-center gap-1.5 mb-1">
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                HIPAA & Synthetic Data Notice
              </div>
              <p className="text-[11px] leading-relaxed text-slate-300">
                All patient records, laboratory metrics, ICD-10 identifiers, and clinical notes are synthetic simulations engineered for diagnostic provenance modeling. No real protected health information (PHI) is processed.
              </p>
              <button
                onClick={() => setShowSyntheticInfo(false)}
                className="mt-2 w-full py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

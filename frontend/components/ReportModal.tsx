import React from 'react';
import { Patient, TimelineEvent, Conflict } from '@/lib/types';
import {
  X,
  Printer,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { Logo } from './Logo';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient;
  events: TimelineEvent[];
  conflicts: Conflict[];
}

export function ReportModal({
  isOpen,
  onClose,
  patient,
  events,
  conflicts,
}: ReportModalProps) {
  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
      <div className="bg-[#0b0f14] border border-[#1e293b] rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
        {/* Action Top Bar */}
        <div className="p-4 bg-[#101620] border-b border-[#1e293b] flex items-center justify-between sticky top-0 z-10 print:hidden">
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <ShieldCheck className="w-4 h-4 text-teal-400" />
            <span>AsOf Second-Opinion Clinical Provenance Report</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs transition-colors shadow-glowTeal"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Export PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-[#141c29] border border-[#1e293b] text-slate-300 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Document Body */}
        <div className="p-8 space-y-8 bg-[#0b0f14] text-slate-100 print:bg-white print:text-black">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1e293b] pb-6">
            <div>
              <Logo size="lg" showTagline={true} />
              <div className="text-xs text-slate-300 mt-2">
                Bi-temporal Clinical Provenance & Conflict Explanation Report
              </div>
            </div>

            <div className="text-right text-xs text-slate-300 space-y-1">
              <div>
                Report Generated: <span className="font-mono text-slate-200">{currentDate}</span>
              </div>
              <div>
                EHR Record Identifier: <span className="font-mono text-teal-400">{patient.mrn}</span>
              </div>
              <div className="text-amber-400 font-medium">
                Synthetic Diagnostic Audit
              </div>
            </div>
          </div>

          {/* Patient Details */}
          <div className="p-4 rounded-xl bg-[#101620] border border-[#1e293b] grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-slate-300 uppercase font-semibold text-[10px]">Patient Name</span>
              <div className="text-sm font-bold text-white mt-0.5">{patient.name}</div>
            </div>
            <div>
              <span className="text-slate-300 uppercase font-semibold text-[10px]">Demographics</span>
              <div className="text-slate-200 mt-0.5">{patient.age}yo • {patient.gender} • {patient.bloodType}</div>
            </div>
            <div>
              <span className="text-slate-300 uppercase font-semibold text-[10px]">Attending Physician</span>
              <div className="text-slate-200 mt-0.5">{patient.attendingPhysician}</div>
            </div>
            <div>
              <span className="text-slate-300 uppercase font-semibold text-[10px]">Facility</span>
              <div className="text-slate-200 mt-0.5">{patient.facility}</div>
            </div>
          </div>

          {/* Executive Summary */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-teal-400">
              Executive Clinical Synthesis
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed p-4 rounded-xl bg-[#101620] border border-[#1e293b]">
              {patient.summary}
            </p>
          </div>

          {/* Diagnostic Conflicts & Contradictions */}
          {conflicts.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-red-400 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                Detected EHR Diagnostic Conflicts ({conflicts.length})
              </h3>
              {conflicts.map((c) => (
                <div
                  key={c.id}
                  className="p-4 rounded-xl bg-red-950/20 border border-red-900/50 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-red-300">
                      Hypothesis Divergence: {c.diagnosisA} vs {c.diagnosisB}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-950 text-red-300 border border-red-800">
                      Severity: {c.severity.toUpperCase()}
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">
                    {c.summary}
                  </p>

                  {c.recommendation && (
                    <div className="text-xs text-teal-300 bg-[#101620] p-3 rounded-lg border border-[#1e293b]">
                      <span className="font-bold text-teal-400">Advisory: </span>
                      {c.recommendation}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Chronological Longitudinal Events */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-teal-400">
              Longitudinal Care Events & Bitemporal Verification
            </h3>
            <div className="space-y-2">
              {events.map((evt) => (
                <div
                  key={evt.id}
                  className="p-3 rounded-xl bg-[#101620] border border-[#1e293b] flex items-start justify-between gap-4 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">{evt.title}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#141c29] text-teal-300 border border-[#1e293b]">
                        {evt.type}
                      </span>
                      {evt.supersededBy && (
                        <span className="text-[10px] text-amber-400 font-mono">
                          (Superseded)
                        </span>
                      )}
                    </div>
                    {evt.value && (
                      <div className="text-teal-300 font-medium text-[11px] mt-0.5">
                        {evt.value}
                      </div>
                    )}
                    <div className="text-[11px] text-slate-300 mt-0.5">
                      Provider: {evt.provider}
                    </div>
                  </div>

                  <div className="text-right text-[11px] text-slate-300 font-mono shrink-0">
                    <div>Valid: {evt.validFrom.slice(0, 10)}</div>
                    <div>Recorded: {evt.sysFrom.slice(0, 10)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Signoff Footer */}
          <div className="pt-6 border-t border-[#1e293b] flex flex-col sm:flex-row items-center justify-between text-xs text-slate-300 gap-4">
            <div>
              <span>Verified by AsOf Bi-temporal Provenance Engine</span>
            </div>
            <div className="font-mono text-[10px]">
              SHA256 Provenance Hash: e8c47b91...6f2a
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

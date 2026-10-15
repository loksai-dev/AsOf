import React from 'react';
import {
  Users,
  AlertTriangle,
  Clock,
  Network,
  ChevronRight,
  ShieldCheck,
  Stethoscope,
  Building,
  HeartPulse,
} from 'lucide-react';
import { Patient } from '@/lib/types';
import { TabType } from './Sidebar';

interface PatientsViewProps {
  patients: Patient[];
  activePatient: Patient;
  onSelectPatient: (patient: Patient) => void;
  onNavigateTab: (tab: TabType) => void;
  viewMode: 'doctor' | 'patient';
}

export function PatientsView({
  patients,
  activePatient,
  onSelectPatient,
  onNavigateTab,
  viewMode: _viewMode,
}: PatientsViewProps) {
  const totalConflicts = patients.reduce((acc, p) => acc + p.conflictCount, 0);
  const totalSuperseded = patients.reduce((acc, p) => acc + p.supersededCount, 0);

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20">
              <Users className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Patient Cohort Directory
            </h1>
          </div>
          <p className="text-sm text-slate-300 mt-1">
            Explore synthetic clinical longitudinal records with bitemporal provenance, disputed diagnoses, and second-opinion audits.
          </p>
        </div>

        {/* Global Summary Stats */}
        <div className="flex items-center gap-3">
          <div className="px-3.5 py-2 rounded-xl bg-[#141c29] border border-[#1e293b] flex items-center gap-2.5 shadow-card">
            <div className="w-2.5 h-2.5 rounded-full bg-teal-400" />
            <div>
              <div className="text-[10px] uppercase font-semibold text-slate-300">
                Total Patients
              </div>
              <div className="text-base font-bold text-slate-100 font-mono">
                {patients.length}
              </div>
            </div>
          </div>

          <div className="px-3.5 py-2 rounded-xl bg-[#141c29] border border-red-900/50 flex items-center gap-2.5 shadow-glowRed">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400 animate-pulse" />
            <div>
              <div className="text-[10px] uppercase font-semibold text-red-300">
                Active Conflicts
              </div>
              <div className="text-base font-bold text-red-300 font-mono">
                {totalConflicts}
              </div>
            </div>
          </div>

          <div className="px-3.5 py-2 rounded-xl bg-[#141c29] border border-amber-900/50 flex items-center gap-2.5 shadow-glowAmber">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <div>
              <div className="text-[10px] uppercase font-semibold text-amber-300">
                Superseded Dx
              </div>
              <div className="text-base font-bold text-amber-300 font-mono">
                {totalSuperseded}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Patient Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {patients.map((patient) => {
          const isSelected = patient.id === activePatient.id;

          return (
            <div
              key={patient.id}
              className={`rounded-2xl bg-[#101620] border transition-all duration-200 flex flex-col justify-between overflow-hidden shadow-card group ${
                isSelected
                  ? 'border-teal-500/60 ring-1 ring-teal-500/30 bg-gradient-to-b from-[#141d2b] to-[#101620]'
                  : 'border-[#1e293b] hover:border-slate-700 hover:bg-[#121926]'
              }`}
            >
              {/* Card Header */}
              <div className="p-5 border-b border-[#1e293b]/70">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-base border shrink-0 transition-all ${
                        isSelected
                          ? 'bg-teal-500/20 border-teal-500/50 text-teal-300 shadow-glowTeal'
                          : 'bg-slate-800/80 border-slate-700 text-slate-300 group-hover:border-slate-600'
                      }`}
                    >
                      {patient.name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold text-white tracking-tight">
                          {patient.name}
                        </h2>
                        {isSelected && (
                          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-teal-500/20 text-teal-300 border border-teal-500/40">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-300 font-mono mt-0.5">
                        <span>{patient.mrn}</span>
                        <span>•</span>
                        <span>
                          {patient.age}y / {patient.gender}
                        </span>
                        <span>•</span>
                        <span>Blood: {patient.bloodType}</span>
                      </div>
                    </div>
                  </div>

                  {patient.conflictCount > 0 ? (
                    <span className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-red-950/70 text-red-300 border border-red-800/60 shadow-glowRed">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                      {patient.conflictCount} Conflict
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-teal-950/70 text-teal-300 border border-teal-800/60">
                      <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                      Resolved
                    </span>
                  )}
                </div>

                {/* Primary Condition */}
                <div className="mt-4 p-2.5 rounded-xl bg-[#141c29] border border-[#1e293b]">
                  <div className="text-[10px] uppercase font-semibold text-slate-300 tracking-wider">
                    Working Diagnosis / Focus
                  </div>
                  <div className="text-sm font-semibold text-teal-300 mt-0.5">
                    {patient.primaryCondition}
                  </div>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                <p className="text-xs text-slate-300 leading-relaxed line-clamp-4">
                  {patient.summary}
                </p>

                {/* Clinical Metadata */}
                <div className="space-y-2 pt-2 border-t border-[#1e293b]/60 text-xs">
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="flex items-center gap-1.5 text-slate-300">
                      <Stethoscope className="w-3.5 h-3.5 text-teal-400" />
                      Attending:
                    </span>
                    <span className="text-slate-200 font-medium truncate max-w-[170px]">
                      {patient.attendingPhysician}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-slate-300">
                    <span className="flex items-center gap-1.5 text-slate-300">
                      <Building className="w-3.5 h-3.5 text-slate-300" />
                      Facility:
                    </span>
                    <span className="text-slate-300 truncate max-w-[170px]">
                      {patient.facility}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-slate-300">
                    <span className="flex items-center gap-1.5 text-slate-300">
                      <HeartPulse className="w-3.5 h-3.5 text-amber-400" />
                      Superseded Records:
                    </span>
                    <span className="text-amber-400 font-mono font-medium">
                      {patient.supersededCount} record(s)
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="pt-3 flex flex-col gap-2">
                  <button
                    onClick={() => {
                      onSelectPatient(patient);
                      onNavigateTab('timeline');
                    }}
                    className={`w-full py-2.5 px-3 rounded-xl font-semibold text-xs transition-all flex items-center justify-center gap-2 border ${
                      isSelected
                        ? 'bg-teal-500 hover:bg-teal-400 text-slate-950 border-teal-400 shadow-glowTeal'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border-slate-700'
                    }`}
                  >
                    <span>{isSelected ? 'View Active Case' : 'Select & Inspect'}</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => {
                        onSelectPatient(patient);
                        onNavigateTab('time-travel');
                      }}
                      className="py-1.5 px-2 rounded-lg bg-[#141c29] hover:bg-[#182333] text-slate-300 hover:text-teal-300 border border-[#1e293b] text-[11px] font-medium flex items-center justify-center gap-1"
                    >
                      <Clock className="w-3 h-3 text-teal-400" />
                      Time Travel
                    </button>
                    <button
                      onClick={() => {
                        onSelectPatient(patient);
                        onNavigateTab('conflicts');
                      }}
                      className="py-1.5 px-2 rounded-lg bg-[#141c29] hover:bg-[#182333] text-slate-300 hover:text-red-300 border border-[#1e293b] text-[11px] font-medium flex items-center justify-center gap-1"
                    >
                      <AlertTriangle className="w-3 h-3 text-red-400" />
                      Conflicts
                    </button>
                    <button
                      onClick={() => {
                        onSelectPatient(patient);
                        onNavigateTab('provenance');
                      }}
                      className="py-1.5 px-2 rounded-lg bg-[#141c29] hover:bg-[#182333] text-slate-300 hover:text-indigo-300 border border-[#1e293b] text-[11px] font-medium flex items-center justify-center gap-1"
                    >
                      <Network className="w-3 h-3 text-indigo-400" />
                      Graph
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

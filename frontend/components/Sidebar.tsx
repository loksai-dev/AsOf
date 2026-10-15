import React from 'react';
import { Logo } from './Logo';
import {
  Users,
  Clock,
  History,
  AlertTriangle,
  Network,
  Bot,
  FileCode,
  ShieldCheck,
} from 'lucide-react';
import { Patient } from '@/lib/types';

export type TabType =
  | 'patients'
  | 'timeline'
  | 'time-travel'
  | 'conflicts'
  | 'provenance'
  | 'agent-chat'
  | 'audit-log';

interface SidebarProps {
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
  activePatient: Patient;
  onOpenReport?: () => void;
  onGoToLanding?: () => void;
}

export function Sidebar({
  currentTab,
  onSelectTab,
  activePatient,
  onOpenReport,
  onGoToLanding,
}: SidebarProps) {
  const navItems: {
    id: TabType;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string | number;
    badgeColor?: string;
    description: string;
  }[] = [
    {
      id: 'patients',
      label: 'Patients',
      icon: Users,
      badge: '3',
      badgeColor: 'bg-slate-800 text-slate-300 border-slate-700',
      description: 'EHR cohort directory',
    },
    {
      id: 'timeline',
      label: 'Timeline',
      icon: Clock,
      badge: activePatient.activeDiagnosisCount + activePatient.supersededCount,
      badgeColor: 'bg-teal-950/80 text-teal-300 border-teal-800/60',
      description: 'Chronological event log',
    },
    {
      id: 'time-travel',
      label: 'Time Travel',
      icon: History,
      badge: 'Bitemporal',
      badgeColor: 'bg-amber-950/70 text-amber-300 border-amber-800/60',
      description: 'Valid vs System time scrubber',
    },
    {
      id: 'conflicts',
      label: 'Conflicts',
      icon: AlertTriangle,
      badge: activePatient.conflictCount > 0 ? activePatient.conflictCount : undefined,
      badgeColor: 'bg-red-950/90 text-red-300 border-red-800/60 shadow-glowRed',
      description: 'Contradiction & evidence matrix',
    },
    {
      id: 'provenance',
      label: 'Provenance Graph',
      icon: Network,
      badge: 'Interactive',
      badgeColor: 'bg-indigo-950/70 text-indigo-300 border-indigo-800/60',
      description: 'Node-edge diagnosis trails',
    },
    {
      id: 'agent-chat',
      label: 'Agent Chat',
      icon: Bot,
      badge: 'AI',
      badgeColor: 'bg-teal-950/90 text-teal-300 border-teal-800/80',
      description: 'Medical reasoning copilot',
    },
    {
      id: 'audit-log',
      label: 'Audit Log',
      icon: FileCode,
      badge: 'Cypher',
      badgeColor: 'bg-slate-800 text-slate-300 border-slate-700',
      description: 'Graph query execution trace',
    },
  ];

  return (
    <aside className="w-72 bg-[#0b0f14] border-r border-[#1e293b]/80 flex flex-col h-screen sticky top-0 select-none z-30">
      {/* Brand Header */}
      <div
        onClick={onGoToLanding}
        className="p-5 border-b border-[#1e293b]/70 flex flex-col gap-1 cursor-pointer hover:bg-[#121926] transition-colors group"
        title="Return to AsOf Landing Page"
      >
        <Logo size="md" showTagline={true} />
      </div>

      {/* Navigation Menu */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5">
        <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-300">
          Clinical Navigation
        </div>

        {navItems.map((item) => {
          const isActive = currentTab === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full group text-left px-3.5 py-3 rounded-xl transition-all duration-150 flex items-center justify-between border ${
                isActive
                  ? 'bg-gradient-to-r from-teal-500/15 to-transparent text-teal-200 border-teal-500/40 shadow-[0_0_15px_-3px_rgba(45,212,191,0.2)]'
                  : 'bg-transparent text-slate-300 border-transparent hover:bg-slate-900/60 hover:text-slate-200 hover:border-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`p-2 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-teal-500/20 text-teal-400'
                      : 'bg-slate-900/80 text-slate-400 group-hover:text-slate-200 group-hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span
                    className={`text-sm font-medium tracking-tight truncate ${
                      isActive ? 'text-teal-300 font-semibold' : 'text-slate-200'
                    }`}
                  >
                    {item.label}
                  </span>
                  <span className="text-[11px] text-slate-300 truncate">
                    {item.description}
                  </span>
                </div>
              </div>

              {item.badge !== undefined && (
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ml-2 ${
                    item.badgeColor || 'bg-slate-800 text-slate-300 border-slate-700'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Patient Snapshot Mini-Card */}
      <div className="p-3 border-t border-[#1e293b]/70 bg-[#0e141d]/70">
        <div className="p-3 rounded-xl bg-[#141c29] border border-[#1e293b] flex flex-col gap-2 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-semibold text-slate-300 tracking-wider">
              Selected Patient
            </span>
            <span className="text-[10px] font-mono text-teal-400 bg-teal-950/60 border border-teal-800/50 px-1.5 py-0.5 rounded">
              {activePatient.mrn}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-teal-500/30 to-teal-400/10 border border-teal-500/30 flex items-center justify-center font-bold text-teal-300 text-xs shrink-0">
              {activePatient.name
                .split(' ')
                .map((n) => n[0])
                .join('')}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-100 truncate">
                {activePatient.name}
              </div>
              <div className="text-[11px] text-slate-300 truncate">
                {activePatient.age}yo {activePatient.gender}
              </div>
            </div>
          </div>

          <div className="text-[11px] text-amber-400/90 bg-amber-950/40 border border-amber-900/50 rounded-lg px-2 py-1 truncate">
            {activePatient.primaryCondition}
          </div>

          {onOpenReport && (
            <button
              onClick={onOpenReport}
              className="mt-1 w-full py-1.5 px-2 rounded-lg bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border border-teal-500/30 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
              <span>Second-Opinion Report</span>
            </button>
          )}
        </div>

        {/* Engine status footer */}
        <div className="mt-2 px-1 flex items-center justify-between text-[10px] text-slate-300">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
            Bitemporal Engine Active
          </span>
          <span className="font-mono text-slate-300">Cypher v5.18</span>
        </div>
      </div>
    </aside>
  );
}

'use client';

import React, { useState, useEffect } from 'react';
import { Sidebar, TabType } from '@/components/Sidebar';
import { TopBar } from '@/components/TopBar';
import { PatientsView } from '@/components/PatientsView';
import { TimelineView } from '@/components/TimelineView';
import { TimeTravelView } from '@/components/TimeTravelView';
import { ConflictsView } from '@/components/ConflictsView';
import { ProvenanceGraphView } from '@/components/ProvenanceGraphView';
import { AgentChatView } from '@/components/AgentChatView';
import { AuditLogView } from '@/components/AuditLogView';
import { ReportModal } from '@/components/ReportModal';
import { LandingPageView } from '@/components/LandingPageView';
import { Patient, TimelineEvent, Conflict } from '@/lib/types';
import { getPatients, getTimeline, getConflicts } from '@/lib/api';

export default function Home() {
  const [showLanding, setShowLanding] = useState<boolean>(true);
  const [currentTab, setCurrentTab] = useState<TabType>('timeline');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [activePatient, setActivePatient] = useState<Patient | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [viewMode, setViewMode] = useState<'doctor' | 'patient'>('doctor');
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [agentInitialPrompt, setAgentInitialPrompt] = useState<string | undefined>(undefined);

  const [temporalState, setTemporalState] = useState<{
    validDate: string;
    sysDate: string;
    isTimeTraveling: boolean;
  }>({
    validDate: '2024-03-24',
    sysDate: '2024-03-24',
    isTimeTraveling: false,
  });

  // Initial load: Fetch patients
  useEffect(() => {
    let isCancelled = false;
    getPatients().then((list) => {
      if (!isCancelled && list.length > 0) {
        setPatients(list);
        setActivePatient(list[0]);
      }
    });
    return () => {
      isCancelled = true;
    };
  }, []);

  // When active patient changes, fetch timeline and conflicts
  useEffect(() => {
    if (!activePatient) return;
    let isCancelled = false;

    Promise.all([
      getTimeline(activePatient.id),
      getConflicts(activePatient.id),
    ]).then(([evts, cnfs]) => {
      if (!isCancelled) {
        setEvents(evts);
        setConflicts(cnfs);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [activePatient]);

  const handleSelectPatient = (p: Patient) => {
    setActivePatient(p);
    setTemporalState((prev) => ({ ...prev, isTimeTraveling: false }));
  };

  const handleAskAgentAboutEvent = (event: TimelineEvent) => {
    setAgentInitialPrompt(
      `Please explain the clinical rationale, provenance chain, and validity of: "${event.title}" (${event.code || event.type}) recorded by ${event.provider}.`
    );
    setCurrentTab('agent-chat');
  };

  const handleAskAgentAboutConflict = (conflict: Conflict) => {
    setAgentInitialPrompt(
      `Why is there a conflict between "${conflict.diagnosisA}" and "${conflict.diagnosisB}"? Which diagnosis does the evidence favor?`
    );
    setCurrentTab('agent-chat');
  };

  const handleResetTimeTravel = () => {
    setTemporalState({
      validDate: '2024-03-24',
      sysDate: '2024-03-24',
      isTimeTraveling: false,
    });
  };

  const handleStartDemo = (tab: TabType = 'timeline') => {
    if (patients.length > 0) {
      const eleanor = patients.find((p) => p.id === 'pat-001') || patients[0];
      setActivePatient(eleanor);
    }
    setCurrentTab(tab);
    setShowLanding(false);
  };

  if (showLanding) {
    return (
      <LandingPageView
        onStartDemo={handleStartDemo}
        samplePatient={activePatient || (patients.length > 0 ? patients[0] : null)}
      />
    );
  }

  if (!activePatient) {
    return (
      <div className="min-h-screen bg-[#0b0f14] flex items-center justify-center text-teal-400 font-mono text-sm">
        Initializing AsOf Bitemporal Clinical Workspace...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0f14] text-slate-100 flex flex-row">
      {/* Left Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        activePatient={activePatient}
        onOpenReport={() => setIsReportOpen(true)}
        onGoToLanding={() => setShowLanding(true)}
      />

      {/* Main App Workspace */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Top Bar */}
        <TopBar
          activePatient={activePatient}
          onSelectPatient={handleSelectPatient}
          viewMode={viewMode}
          onToggleViewMode={setViewMode}
          onOpenReport={() => setIsReportOpen(true)}
          onGoToLanding={() => setShowLanding(true)}
          temporalState={temporalState}
          onResetTimeTravel={handleResetTimeTravel}
        />

        {/* Content Area */}
        <main className="flex-1 p-6 md:p-8 overflow-y-auto max-w-7xl w-full mx-auto">
          {currentTab === 'patients' && (
            <PatientsView
              patients={patients}
              activePatient={activePatient}
              onSelectPatient={handleSelectPatient}
              onNavigateTab={setCurrentTab}
              viewMode={viewMode}
            />
          )}

          {currentTab === 'timeline' && (
            <TimelineView
              events={events}
              activePatient={activePatient}
              onNavigateTab={setCurrentTab}
              onAskAgentAboutEvent={handleAskAgentAboutEvent}
              viewMode={viewMode}
            />
          )}

          {currentTab === 'time-travel' && (
            <TimeTravelView
              activePatient={activePatient}
              onSetGlobalTemporalState={setTemporalState}
              viewMode={viewMode}
            />
          )}

          {currentTab === 'conflicts' && (
            <ConflictsView
              conflicts={conflicts}
              activePatient={activePatient}
              onNavigateTab={setCurrentTab}
              onAskAgentAboutConflict={handleAskAgentAboutConflict}
              viewMode={viewMode}
            />
          )}

          {currentTab === 'provenance' && (
            <ProvenanceGraphView
              activePatient={activePatient}
              viewMode={viewMode}
            />
          )}

          {currentTab === 'agent-chat' && (
            <AgentChatView
              activePatient={activePatient}
              viewMode={viewMode}
              initialPrompt={agentInitialPrompt}
            />
          )}

          {currentTab === 'audit-log' && (
            <AuditLogView
              activePatient={activePatient}
              viewMode={viewMode}
            />
          )}
        </main>
      </div>

      {/* Printable Second-Opinion Report Modal */}
      <ReportModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        patient={activePatient}
        events={events}
        conflicts={conflicts}
      />
    </div>
  );
}

'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  TimelineEvent,
  EventType,
  Patient,
  Evidence,
} from '@/lib/types';
import {
  Activity,
  FileText,
  Scan,
  Pill,
  CheckCircle2,
  Clock,
  History,
  AlertCircle,
  Search,
  Sparkles,
  Calendar,
  User,
  ChevronLeft,
  ChevronRight,
  X,
  Building2,
  ArrowRight,
  Filter,
  Layers,
  Info,
  ShieldCheck,
  Check,
  ExternalLink,
} from 'lucide-react';
import { TabType } from './Sidebar';

interface TimelineViewProps {
  events: TimelineEvent[];
  activePatient: Patient;
  onNavigateTab: (tab: TabType) => void;
  onAskAgentAboutEvent?: (event: TimelineEvent) => void;
  viewMode: 'doctor' | 'patient';
}

// Visual definition for each of the 3 color-coded hospitals
interface HospitalMeta {
  id: string;
  name: string;
  shortName: string;
  colorName: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  cardBorder: string;
  cardHoverBorder: string;
  cardBgGradient: string;
  accentBar: string;
  dotColor: string;
  glowShadow: string;
  activeRing: string;
}

const HOSPITALS: Record<string, HospitalMeta> = {
  'Metro General Hospital': {
    id: 'metro-gen',
    name: 'Metro General Hospital',
    shortName: 'Metro General',
    colorName: 'Sky Blue',
    badgeBg: 'bg-sky-500/15',
    badgeText: 'text-sky-300',
    badgeBorder: 'border-sky-500/35',
    cardBorder: 'border-sky-500/40',
    cardHoverBorder: 'hover:border-sky-400',
    cardBgGradient: 'from-sky-950/25 via-[#141c29] to-[#101620]',
    accentBar: 'bg-gradient-to-r from-sky-500 to-sky-400',
    dotColor: 'bg-sky-400',
    glowShadow: 'hover:shadow-[0_0_25px_-5px_rgba(56,189,248,0.35)]',
    activeRing: 'ring-2 ring-sky-400 border-sky-400',
  },
  'Community Memorial Hospital': {
    id: 'comm-mem',
    name: 'Community Memorial Hospital',
    shortName: 'Community Memorial',
    colorName: 'Emerald Green',
    badgeBg: 'bg-emerald-500/15',
    badgeText: 'text-emerald-300',
    badgeBorder: 'border-emerald-500/35',
    cardBorder: 'border-emerald-500/40',
    cardHoverBorder: 'hover:border-emerald-400',
    cardBgGradient: 'from-emerald-950/25 via-[#141c29] to-[#101620]',
    accentBar: 'bg-gradient-to-r from-emerald-500 to-emerald-400',
    dotColor: 'bg-emerald-400',
    glowShadow: 'hover:shadow-[0_0_25px_-5px_rgba(52,211,153,0.35)]',
    activeRing: 'ring-2 ring-emerald-400 border-emerald-400',
  },
  'St. Jude Specialty Hospital': {
    id: 'st-jude',
    name: 'St. Jude Specialty Hospital',
    shortName: 'St. Jude Specialty',
    colorName: 'Purple Violet',
    badgeBg: 'bg-purple-500/15',
    badgeText: 'text-purple-300',
    badgeBorder: 'border-purple-500/35',
    cardBorder: 'border-purple-500/40',
    cardHoverBorder: 'hover:border-purple-400',
    cardBgGradient: 'from-purple-950/25 via-[#141c29] to-[#101620]',
    accentBar: 'bg-gradient-to-r from-purple-500 to-purple-400',
    dotColor: 'bg-purple-400',
    glowShadow: 'hover:shadow-[0_0_25px_-5px_rgba(168,85,247,0.35)]',
    activeRing: 'ring-2 ring-purple-400 border-purple-400',
  },
};

const DEFAULT_HOSPITAL_META: HospitalMeta = {
  id: 'default-hosp',
  name: 'General Medical Center',
  shortName: 'Medical Center',
  colorName: 'Teal',
  badgeBg: 'bg-teal-500/15',
  badgeText: 'text-teal-300',
  badgeBorder: 'border-teal-500/35',
  cardBorder: 'border-teal-500/40',
  cardHoverBorder: 'hover:border-teal-400',
  cardBgGradient: 'from-teal-950/25 via-[#141c29] to-[#101620]',
  accentBar: 'bg-gradient-to-r from-teal-500 to-teal-400',
  dotColor: 'bg-teal-400',
  glowShadow: 'hover:shadow-[0_0_25px_-5px_rgba(45,212,191,0.35)]',
  activeRing: 'ring-2 ring-teal-400 border-teal-400',
};

export function TimelineView({
  events,
  activePatient,
  onNavigateTab,
  onAskAgentAboutEvent,
  viewMode: _viewMode,
}: TimelineViewProps) {
  // State for filtering
  const [selectedHospital, setSelectedHospital] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<EventType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'superseded'>('all');

  // Drawer state
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);

  // Jump highlighting state
  const [highlightedEventId, setHighlightedEventId] = useState<string | null>(null);

  // Horizontal scroll container ref
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Available unique hospitals in events
  const hospitalNames = Array.from(
    new Set(events.map((e) => e.hospital || 'Metro General Hospital'))
  );

  // Filter events
  const filteredEvents = events.filter((e) => {
    const eHospital = e.hospital || 'Metro General Hospital';
    const matchesHospital = selectedHospital === 'all' || eHospital === selectedHospital;
    const matchesType = selectedType === 'all' || e.type === selectedType;
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'superseded' && Boolean(e.supersededBy)) ||
      (statusFilter === 'active' && !e.supersededBy);

    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      q === '' ||
      e.title.toLowerCase().includes(q) ||
      e.provider.toLowerCase().includes(q) ||
      eHospital.toLowerCase().includes(q) ||
      (e.notes && e.notes.toLowerCase().includes(q)) ||
      (e.code && e.code.toLowerCase().includes(q)) ||
      (e.value && e.value.toLowerCase().includes(q));

    return matchesHospital && matchesType && matchesStatus && matchesSearch;
  });

  // Handle keyboard shortcuts (Escape to close drawer, Arrow keys to navigate)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedEvent(null);
      } else if (e.key === 'ArrowRight' && selectedEvent) {
        // Next event in filtered list
        const currentIndex = filteredEvents.findIndex((ev) => ev.id === selectedEvent.id);
        if (currentIndex >= 0 && currentIndex < filteredEvents.length - 1) {
          setSelectedEvent(filteredEvents[currentIndex + 1]);
        }
      } else if (e.key === 'ArrowLeft' && selectedEvent) {
        // Prev event in filtered list
        const currentIndex = filteredEvents.findIndex((ev) => ev.id === selectedEvent.id);
        if (currentIndex > 0) {
          setSelectedEvent(filteredEvents[currentIndex - 1]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedEvent, filteredEvents]);

  // Scroll navigation helpers
  const handleScroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 420;
      scrollContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  // Jump to correcting event with horizontal scroll & focus
  const handleJumpToEvent = (targetEventId: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }

    const targetEvent = events.find((ev) => ev.id === targetEventId);
    if (!targetEvent) return;

    // Reset filters if target is hidden by filters
    if (selectedHospital !== 'all' && (targetEvent.hospital || 'Metro General Hospital') !== selectedHospital) {
      setSelectedHospital('all');
    }
    if (selectedType !== 'all' && targetEvent.type !== selectedType) {
      setSelectedType('all');
    }
    if (statusFilter !== 'all') {
      setStatusFilter('all');
    }

    // Highlight and open in drawer
    setHighlightedEventId(targetEventId);
    setSelectedEvent(targetEvent);

    // Scroll card into view
    setTimeout(() => {
      const el = document.getElementById(`timeline-card-${targetEventId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }, 100);

    // Remove pulse highlight after 3 seconds
    setTimeout(() => {
      setHighlightedEventId((prev) => (prev === targetEventId ? null : prev));
    }, 3000);
  };

  const getHospitalMeta = (hospitalName?: string): HospitalMeta => {
    if (!hospitalName) return DEFAULT_HOSPITAL_META;
    return HOSPITALS[hospitalName] || DEFAULT_HOSPITAL_META;
  };

  const getEventIcon = (type: EventType) => {
    switch (type) {
      case 'diagnosis':
        return <Activity className="w-4 h-4 text-teal-400" />;
      case 'lab':
        return <FileText className="w-4 h-4 text-sky-400" />;
      case 'imaging':
        return <Scan className="w-4 h-4 text-purple-400" />;
      case 'prescription':
        return <Pill className="w-4 h-4 text-emerald-400" />;
      case 'correction':
        return <CheckCircle2 className="w-4 h-4 text-amber-400" />;
      default:
        return <Activity className="w-4 h-4 text-teal-400" />;
    }
  };

  const getEvidenceIcon = (type: Evidence['type']) => {
    switch (type) {
      case 'lab':
        return <FileText className="w-3.5 h-3.5 text-sky-400" />;
      case 'imaging':
        return <Scan className="w-3.5 h-3.5 text-purple-400" />;
      case 'symptom':
        return <AlertCircle className="w-3.5 h-3.5 text-amber-400" />;
      case 'clinical_note':
        return <FileText className="w-3.5 h-3.5 text-teal-400" />;
      case 'biopsy':
        return <Activity className="w-3.5 h-3.5 text-rose-400" />;
      case 'genomics':
        return <Sparkles className="w-3.5 h-3.5 text-indigo-400" />;
      default:
        return <FileText className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Present / Ongoing';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const formatTimestamp = (dateStr: string | null) => {
    if (!dateStr) return 'Current Active Record';
    try {
      const d = new Date(dateStr);
      return d.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  // Find correcting event details for superseded badge
  const getCorrectingEvent = (supersededById?: string) => {
    if (!supersededById) return null;
    return events.find((e) => e.id === supersededById);
  };

  // Drawer index for prev/next navigation
  const currentDrawerIndex = selectedEvent
    ? filteredEvents.findIndex((e) => e.id === selectedEvent.id)
    : -1;

  return (
    <div className="space-y-6 relative">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-teal-500/15 text-teal-300 border border-teal-500/30 shadow-glowTeal">
              <Clock className="w-5 h-5 text-teal-400" />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
                Patient Longitudinal Timeline
                <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-teal-500/10 text-teal-300 border border-teal-500/30 font-medium">
                  Across 3 Hospitals
                </span>
              </h1>
              <p className="text-sm text-slate-300 mt-1">
                Visualizing bitemporal clinical history for{' '}
                <span className="text-teal-300 font-semibold">{activePatient.name}</span>{' '}
                (MRN: <span className="font-mono text-slate-200">{activePatient.mrn}</span>).
                Events color-coded by originating health system.
              </p>
            </div>
          </div>
        </div>

        {/* 3 Hospitals Color-Coded Legend */}
        <div className="flex flex-wrap items-center gap-2 p-2 rounded-2xl bg-[#101620] border border-[#1e293b] shadow-card">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 px-2 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-slate-400" />
            <span>Hospitals:</span>
          </div>
          {Object.entries(HOSPITALS).map(([hospName, meta]) => {
            const count = events.filter((e) => (e.hospital || 'Metro General Hospital') === hospName).length;
            const isSelected = selectedHospital === hospName;
            return (
              <button
                key={hospName}
                onClick={() => setSelectedHospital(selectedHospital === hospName ? 'all' : hospName)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium border transition-all ${
                  isSelected
                    ? `${meta.badgeBg} ${meta.badgeText} ${meta.badgeBorder} shadow-sm ring-1 ring-white/20`
                    : 'bg-[#141c29] text-slate-300 border-[#1e293b] hover:text-white hover:border-slate-700'
                }`}
                title={`Filter by ${hospName}`}
              >
                <span className={`w-2.5 h-2.5 rounded-full ${meta.dotColor} shadow-sm`} />
                <span>{meta.shortName}</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-900/80 text-slate-300 border border-[#1e293b]">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter Chips Bar (Hospital, Event Type, Search, and Status) */}
      <div className="space-y-3 p-4 rounded-2xl bg-[#101620] border border-[#1e293b] shadow-card">
        {/* Row 1: Hospital Filter Chips */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mr-1">
              <Filter className="w-3.5 h-3.5 text-teal-400" />
              <span>Hospital:</span>
            </span>

            {/* All Hospitals chip */}
            <button
              onClick={() => setSelectedHospital('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 border ${
                selectedHospital === 'all'
                  ? 'bg-teal-500/20 text-teal-200 border-teal-500/50 shadow-sm ring-1 ring-teal-500/30'
                  : 'bg-[#141c29] text-slate-300 border-[#1e293b] hover:text-white hover:border-slate-700'
              }`}
            >
              <span>All 3 Hospitals</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-800 text-slate-300">
                {events.length}
              </span>
            </button>

            {/* Specific Hospital Chips */}
            {hospitalNames.map((hospName) => {
              const meta = getHospitalMeta(hospName);
              const count = events.filter((e) => (e.hospital || 'Metro General Hospital') === hospName).length;
              const isSelected = selectedHospital === hospName;
              return (
                <button
                  key={hospName}
                  onClick={() => setSelectedHospital(hospName)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-2 border ${
                    isSelected
                      ? `${meta.badgeBg} ${meta.badgeText} ${meta.badgeBorder} ring-1 ring-white/20 shadow-sm`
                      : 'bg-[#141c29] text-slate-300 border-[#1e293b] hover:text-white hover:border-slate-700'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${meta.dotColor}`} />
                  <span>{hospName}</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-800/80 text-slate-300">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search Input */}
          <div className="relative min-w-[240px] flex-1 max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search diagnosis, lab, provider, code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-[#141c29] border border-[#1e293b] text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-teal-500/60"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Event Type Chips & Status Filter */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#1e293b]/60">
          {/* Event Type Filter Chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mr-1">
              <Layers className="w-3.5 h-3.5 text-teal-400" />
              <span>Event Type:</span>
            </span>

            {(
              [
                { id: 'all', label: 'All Records', icon: null, count: events.length },
                {
                  id: 'diagnosis',
                  label: 'Diagnoses',
                  icon: <Activity className="w-3.5 h-3.5 text-teal-400" />,
                  count: events.filter((e) => e.type === 'diagnosis').length,
                },
                {
                  id: 'lab',
                  label: 'Labs',
                  icon: <FileText className="w-3.5 h-3.5 text-sky-400" />,
                  count: events.filter((e) => e.type === 'lab').length,
                },
                {
                  id: 'imaging',
                  label: 'Imaging',
                  icon: <Scan className="w-3.5 h-3.5 text-purple-400" />,
                  count: events.filter((e) => e.type === 'imaging').length,
                },
                {
                  id: 'prescription',
                  label: 'Meds',
                  icon: <Pill className="w-3.5 h-3.5 text-emerald-400" />,
                  count: events.filter((e) => e.type === 'prescription').length,
                },
                {
                  id: 'correction',
                  label: 'Corrections',
                  icon: <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />,
                  count: events.filter((e) => e.type === 'correction').length,
                },
              ] as const
            ).map((filter) => {
              const isSelected = selectedType === filter.id;
              return (
                <button
                  key={filter.id}
                  onClick={() => setSelectedType(filter.id)}
                  className={`px-2.5 py-1 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 border ${
                    isSelected
                      ? 'bg-teal-500/20 text-teal-200 border-teal-500/50 shadow-sm'
                      : 'bg-[#141c29] text-slate-300 border-[#1e293b] hover:text-white hover:border-slate-700'
                  }`}
                >
                  {filter.icon}
                  <span>{filter.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                      isSelected ? 'bg-teal-500/30 text-teal-200' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {filter.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Superseded Filter Quick Toggle */}
          <div className="flex items-center gap-1.5 bg-[#141c29] p-1 rounded-xl border border-[#1e293b] text-xs">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-2 py-0.5 rounded-lg text-[11px] font-medium transition-colors ${
                statusFilter === 'all'
                  ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All Status
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-2 py-0.5 rounded-lg text-[11px] font-medium transition-colors ${
                statusFilter === 'active'
                  ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Active Only
            </button>
            <button
              onClick={() => setStatusFilter('superseded')}
              className={`px-2 py-0.5 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1 ${
                statusFilter === 'superseded'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-slate-400 hover:text-amber-300'
              }`}
            >
              <AlertCircle className="w-3 h-3 text-amber-400" />
              <span>Superseded Only</span>
            </button>
          </div>
        </div>
      </div>

      {/* Horizontal Timeline Controls & Counter */}
      <div className="flex items-center justify-between text-xs text-slate-400 px-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-300">
            Showing <span className="text-teal-300 font-bold">{filteredEvents.length}</span> of {events.length} timeline events
          </span>
          {(selectedHospital !== 'all' || selectedType !== 'all' || searchQuery || statusFilter !== 'all') && (
            <button
              onClick={() => {
                setSelectedHospital('all');
                setSelectedType('all');
                setSearchQuery('');
                setStatusFilter('all');
              }}
              className="text-teal-400 hover:underline text-[11px] font-medium ml-2"
            >
              Reset all filters
            </button>
          )}
        </div>

        {/* Scroll Left & Right Navigation Buttons */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-500 hidden sm:inline">
            Scroll horizontally to explore chronology
          </span>
          <button
            onClick={() => handleScroll('left')}
            className="p-1.5 rounded-xl bg-[#141c29] border border-[#1e293b] text-slate-300 hover:text-white hover:border-teal-500/40 hover:bg-slate-800 transition-all shadow-sm"
            title="Scroll Timeline Left"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleScroll('right')}
            className="p-1.5 rounded-xl bg-[#141c29] border border-[#1e293b] text-slate-300 hover:text-white hover:border-teal-500/40 hover:bg-slate-800 transition-all shadow-sm"
            title="Scroll Timeline Right"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* HORIZONTAL SCROLLABLE TIMELINE CONTAINER */}
      <div className="relative rounded-2xl bg-[#0e131b] border border-[#1e293b] p-6 shadow-inner">
        {/* Horizontal Timeline Central Rail */}
        <div className="absolute left-6 right-6 top-[28px] h-0.5 bg-gradient-to-r from-sky-500/40 via-emerald-500/40 to-purple-500/40 z-0 pointer-events-none" />

        {/* Horizontal Scroll Area */}
        <div
          ref={scrollContainerRef}
          className="overflow-x-auto pb-4 pt-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent scroll-smooth flex items-stretch gap-6 z-10"
          style={{ scrollSnapType: 'x proximity' }}
        >
          {filteredEvents.length === 0 ? (
            <div className="w-full py-16 text-center text-slate-400 space-y-2">
              <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
              <p className="text-base font-semibold text-slate-200">No events matched your filters</p>
              <p className="text-xs text-slate-500">
                Try selecting a different hospital or clearing your search criteria.
              </p>
              <button
                onClick={() => {
                  setSelectedHospital('all');
                  setSelectedType('all');
                  setSearchQuery('');
                  setStatusFilter('all');
                }}
                className="mt-2 px-3 py-1.5 rounded-xl bg-teal-500/20 text-teal-300 border border-teal-500/40 text-xs font-medium hover:bg-teal-500/30"
              >
                Clear Filters
              </button>
            </div>
          ) : (
            filteredEvents.map((event, index) => {
              const hospitalMeta = getHospitalMeta(event.hospital);
              const isSuperseded = Boolean(event.supersededBy);
              const isSelected = selectedEvent?.id === event.id;
              const isHighlighted = highlightedEventId === event.id;
              const correctingEvent = getCorrectingEvent(event.supersededBy);

              return (
                <div
                  key={event.id}
                  id={`timeline-card-${event.id}`}
                  onClick={() => setSelectedEvent(event)}
                  className={`relative flex flex-col justify-between shrink-0 w-[340px] rounded-2xl border transition-all duration-200 cursor-pointer select-none group ${
                    isHighlighted
                      ? 'ring-4 ring-amber-400/90 border-amber-400 shadow-glowAmber scale-[1.02] bg-[#151f2e]'
                      : isSelected
                      ? `${hospitalMeta.activeRing} bg-[#141e2e] shadow-lg scale-[1.01]`
                      : isSuperseded
                      ? 'bg-gradient-to-b from-amber-950/20 via-[#141c29] to-[#101620] border-amber-500/40 hover:border-amber-400 hover:shadow-glowAmber'
                      : `bg-[#101620] ${hospitalMeta.cardBorder} ${hospitalMeta.cardHoverBorder} ${hospitalMeta.glowShadow} hover:-translate-y-1`
                  }`}
                  style={{ scrollSnapAlign: 'start' }}
                >
                  {/* Top Color-Coded Hospital Accent Strip */}
                  <div
                    className={`h-1.5 w-full rounded-t-2xl ${
                      isSuperseded
                        ? 'bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600'
                        : hospitalMeta.accentBar
                    }`}
                  />

                  {/* Card Main Content */}
                  <div className="p-4.5 space-y-3.5 flex-1 flex flex-col justify-between">
                    {/* Top Row: Hospital & Event Type Badges */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        {/* Hospital Tag */}
                        <span
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold tracking-wide ${hospitalMeta.badgeBg} ${hospitalMeta.badgeText} ${hospitalMeta.badgeBorder}`}
                        >
                          <Building2 className="w-3 h-3 shrink-0" />
                          <span className="truncate max-w-[170px]" title={hospitalMeta.name}>
                            {hospitalMeta.name}
                          </span>
                        </span>

                        {/* Chronological Step Order */}
                        <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-[#182232] border border-[#1e293b] text-slate-400">
                          #{index + 1}
                        </span>
                      </div>

                      {/* Event Type & Status Header */}
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <div className="flex items-center gap-1.5">
                          <span className="p-1 rounded-md bg-[#141c29] border border-[#1e293b]">
                            {getEventIcon(event.type)}
                          </span>
                          <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                            {event.type}
                          </span>
                          {event.code && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#141c29] border border-[#1e293b] text-teal-300">
                              {event.code}
                            </span>
                          )}
                        </div>

                        {/* Superseded Badge */}
                        {isSuperseded ? (
                          <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-glowAmber animate-pulse">
                            <AlertCircle className="w-3 h-3 text-amber-400" />
                            SUPERSEDED
                          </span>
                        ) : event.type === 'correction' ? (
                          <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30">
                            <CheckCircle2 className="w-3 h-3 text-amber-400" />
                            CORRECTION
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                            Active
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Event Title */}
                    <div className="space-y-1">
                      <h3
                        className={`text-sm font-bold leading-snug line-clamp-2 ${
                          isSuperseded ? 'text-amber-200 line-through decoration-amber-500/70' : 'text-white'
                        }`}
                        title={event.title}
                      >
                        {event.title}
                      </h3>

                      {event.value && (
                        <div className="text-xs font-semibold text-teal-300 bg-teal-950/40 border border-teal-900/50 rounded-lg px-2.5 py-1 inline-block mt-1">
                          {event.value}
                        </div>
                      )}
                    </div>

                    {/* Provider Info */}
                    <div className="flex items-center gap-1.5 text-xs text-slate-300 pt-1">
                      <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate text-slate-300 font-medium" title={event.provider}>
                        {event.provider}
                      </span>
                    </div>

                    {/* Corrected Events: Amber Superseded Badge with Link */}
                    {isSuperseded && event.supersededBy && (
                      <div className="p-2.5 rounded-xl bg-amber-950/50 border border-amber-700/60 text-xs space-y-1">
                        <div className="flex items-center gap-1.5 text-amber-300 font-semibold text-[11px]">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>Superseded by Correcting Record:</span>
                        </div>
                        <button
                          onClick={(e) => handleJumpToEvent(event.supersededBy!, e)}
                          className="w-full text-left font-mono text-[11px] text-amber-200 hover:text-white bg-amber-900/40 hover:bg-amber-800/60 border border-amber-600/40 rounded-lg px-2 py-1 flex items-center justify-between group/link transition-all"
                          title="Click to jump and focus on correcting event"
                        >
                          <span className="truncate underline font-bold">
                            {event.supersededByName || event.supersededBy}
                          </span>
                          <ArrowRight className="w-3 h-3 text-amber-400 group-hover/link:translate-x-0.5 transition-transform shrink-0 ml-1" />
                        </button>
                      </div>
                    )}

                    {/* Four Timestamps Preview / Valid & Recorded Dates */}
                    <div className="pt-2 border-t border-[#1e293b]/70 space-y-1.5 text-[11px] bg-[#0b0f14]/50 rounded-xl p-2.5">
                      {/* Valid Date (Biological) */}
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-slate-400 flex items-center gap-1 font-medium">
                          <Calendar className="w-3 h-3 text-teal-400" />
                          <span>Valid Date:</span>
                        </span>
                        <span className="font-mono text-teal-300 font-semibold">
                          {formatDate(event.validFrom)}
                        </span>
                      </div>

                      {/* Recorded Date (EHR System) */}
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-slate-400 flex items-center gap-1 font-medium">
                          <History className="w-3 h-3 text-amber-400" />
                          <span>Recorded Date:</span>
                        </span>
                        <span className="font-mono text-amber-300 font-semibold">
                          {formatDate(event.sysFrom)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Bottom Click Action Cue */}
                  <div className="px-4 py-2 border-t border-[#1e293b]/60 bg-[#0c1017] rounded-b-2xl flex items-center justify-between text-[11px] text-slate-400 group-hover:text-teal-300 transition-colors">
                    <span className="flex items-center gap-1 font-medium">
                      <span>Click for details & evidence</span>
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform text-slate-500 group-hover:text-teal-300" />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT DRAWER: FULL DETAILS, 4 TIMESTAMPS & SUPPORTED BY EVIDENCE */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop Overlay */}
          <div
            onClick={() => setSelectedEvent(null)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
          />

          {/* Slide-over Right Drawer Panel */}
          <div className="relative w-full max-w-xl bg-[#0e141e] border-l border-[#1e293b] shadow-2xl z-10 flex flex-col h-full overflow-hidden animate-in slide-in-from-right duration-300">
            {/* Top Hospital Color Accent Bar */}
            <div
              className={`h-1.5 w-full ${
                selectedEvent.supersededBy
                  ? 'bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600'
                  : getHospitalMeta(selectedEvent.hospital).accentBar
              }`}
            />

            {/* Drawer Header */}
            <div className="p-5 border-b border-[#1e293b] bg-[#101724] space-y-3">
              <div className="flex items-center justify-between gap-3">
                {/* Hospital Badge */}
                <div className="flex items-center gap-2">
                  <span
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold border ${
                      getHospitalMeta(selectedEvent.hospital).badgeBg
                    } ${getHospitalMeta(selectedEvent.hospital).badgeText} ${
                      getHospitalMeta(selectedEvent.hospital).badgeBorder
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    <span>{getHospitalMeta(selectedEvent.hospital).name}</span>
                  </span>

                  {/* Status badge */}
                  {selectedEvent.supersededBy ? (
                    <span className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      <AlertCircle className="w-3 h-3 text-amber-400" />
                      SUPERSEDED
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      <Check className="w-3 h-3 text-emerald-400" />
                      Active Record
                    </span>
                  )}
                </div>

                {/* Close and Prev/Next Navigation Controls */}
                <div className="flex items-center gap-1.5">
                  <button
                    disabled={currentDrawerIndex <= 0}
                    onClick={() => {
                      if (currentDrawerIndex > 0) {
                        setSelectedEvent(filteredEvents[currentDrawerIndex - 1]);
                      }
                    }}
                    className="p-1.5 rounded-lg bg-[#141c29] border border-[#1e293b] text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="Previous event (Arrow Left)"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    disabled={currentDrawerIndex >= filteredEvents.length - 1}
                    onClick={() => {
                      if (currentDrawerIndex < filteredEvents.length - 1) {
                        setSelectedEvent(filteredEvents[currentDrawerIndex + 1]);
                      }
                    }}
                    className="p-1.5 rounded-lg bg-[#141c29] border border-[#1e293b] text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="Next event (Arrow Right)"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setSelectedEvent(null)}
                    className="p-1.5 rounded-lg bg-[#141c29] border border-[#1e293b] text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ml-1"
                    title="Close drawer (Escape)"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Event Title and Code */}
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  <span className="p-1 rounded bg-[#141c29] border border-[#1e293b]">
                    {getEventIcon(selectedEvent.type)}
                  </span>
                  <span>{selectedEvent.type}</span>
                  {selectedEvent.code && (
                    <span className="font-mono text-teal-300 font-bold px-2 py-0.5 rounded bg-[#141c29] border border-[#1e293b]">
                      {selectedEvent.code}
                    </span>
                  )}
                  <span className="text-slate-500 font-mono text-[11px] ml-auto">
                    ID: {selectedEvent.id}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-white tracking-tight leading-snug">
                  {selectedEvent.title}
                </h2>
              </div>
            </div>

            {/* Drawer Body - Scrollable */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-thin scrollbar-thumb-slate-700">
              {/* Superseded Alert Callout if applicable */}
              {selectedEvent.supersededBy && (
                <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-600/50 space-y-2.5">
                  <div className="flex items-center justify-between text-amber-300 font-bold text-xs">
                    <span className="flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 text-amber-400" />
                      THIS CLINICAL RECORD WAS SUPERSEDED
                    </span>
                    <span className="text-[10px] font-mono uppercase bg-amber-900/60 px-2 py-0.5 rounded border border-amber-700/50">
                      Retracted
                    </span>
                  </div>
                  <p className="text-xs text-amber-200/90 leading-relaxed">
                    This entry was formally amended or corrected in subsequent diagnostic audits. The
                    correcting record supersedes the clinical validity of this historical entry.
                  </p>
                  <button
                    onClick={() => handleJumpToEvent(selectedEvent.supersededBy!)}
                    className="w-full py-2 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/50 text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-sm"
                  >
                    <span>Jump to Correcting Record ({selectedEvent.supersededByName || selectedEvent.supersededBy})</span>
                    <ArrowRight className="w-3.5 h-3.5 text-amber-400" />
                  </button>
                </div>
              )}

              {/* SECTION: FOUR BITEMPORAL TIMESTAMPS */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-teal-400" />
                    <span>Four Bitemporal Timestamps</span>
                  </h3>
                  <span className="text-[11px] text-slate-500 font-mono">Bitemporal Matrix</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* 1. valid_from */}
                  <div className="p-3.5 rounded-xl bg-[#121a26] border border-[#1e293b] space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-teal-400 font-semibold uppercase">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-teal-400" />
                        <span>valid_from</span>
                      </span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-teal-500/10 text-teal-300 border border-teal-500/20">
                        Biological Start
                      </span>
                    </div>
                    <div className="text-sm font-mono font-bold text-white pt-1">
                      {formatDate(selectedEvent.validFrom)}
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 break-all">
                      {selectedEvent.validFrom}
                    </div>
                  </div>

                  {/* 2. valid_to */}
                  <div className="p-3.5 rounded-xl bg-[#121a26] border border-[#1e293b] space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-teal-400 font-semibold uppercase">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-teal-400" />
                        <span>valid_to</span>
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded border ${
                          selectedEvent.validTo
                            ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                            : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                        }`}
                      >
                        {selectedEvent.validTo ? 'Resolved / Ended' : 'Present / Indefinite'}
                      </span>
                    </div>
                    <div
                      className={`text-sm font-mono font-bold pt-1 ${
                        selectedEvent.validTo ? 'text-amber-300' : 'text-emerald-300'
                      }`}
                    >
                      {formatDate(selectedEvent.validTo)}
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 break-all">
                      {selectedEvent.validTo || 'null (Currently ongoing)'}
                    </div>
                  </div>

                  {/* 3. sys_from */}
                  <div className="p-3.5 rounded-xl bg-[#121a26] border border-[#1e293b] space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-amber-400 font-semibold uppercase">
                      <span className="flex items-center gap-1">
                        <History className="w-3.5 h-3.5 text-amber-400" />
                        <span>sys_from</span>
                      </span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                        EHR Recorded
                      </span>
                    </div>
                    <div className="text-sm font-mono font-bold text-white pt-1">
                      {formatTimestamp(selectedEvent.sysFrom)}
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 break-all">
                      {selectedEvent.sysFrom}
                    </div>
                  </div>

                  {/* 4. sys_to */}
                  <div className="p-3.5 rounded-xl bg-[#121a26] border border-[#1e293b] space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-amber-400 font-semibold uppercase">
                      <span className="flex items-center gap-1">
                        <History className="w-3.5 h-3.5 text-amber-400" />
                        <span>sys_to</span>
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded border ${
                          selectedEvent.sysTo
                            ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                            : 'bg-slate-700 text-slate-300 border-slate-600'
                        }`}
                      >
                        {selectedEvent.sysTo ? 'Version Closed' : 'Current Active EHR'}
                      </span>
                    </div>
                    <div
                      className={`text-sm font-mono font-bold pt-1 ${
                        selectedEvent.sysTo ? 'text-amber-300' : 'text-slate-300'
                      }`}
                    >
                      {formatTimestamp(selectedEvent.sysTo)}
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 break-all">
                      {selectedEvent.sysTo || 'null (Current active record version)'}
                    </div>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-[#0c1017] border border-[#1e293b]/60 flex items-start gap-2 text-[11px] text-slate-400">
                  <Info className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-slate-200">Bitemporal Principle:</strong> Valid time traces
                    when the biological condition was true in the patient. System time audits when the
                    hospital EHR transaction was committed to disk.
                  </span>
                </div>
              </div>

              {/* SECTION: CLINICAL DETAILS & OBSERVATIONS */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-teal-400" />
                  <span>Clinical Details & Attributes</span>
                </h3>

                <div className="p-4 rounded-xl bg-[#121a26] border border-[#1e293b] space-y-3 text-xs">
                  {/* Provider & Facility */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-3 border-b border-[#1e293b]">
                    <div>
                      <span className="text-[11px] text-slate-400 block">Attending Provider</span>
                      <span className="font-semibold text-slate-200 flex items-center gap-1.5 mt-0.5">
                        <User className="w-3.5 h-3.5 text-teal-400" />
                        {selectedEvent.provider}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-400 block">Facility & Department</span>
                      <span className="font-semibold text-slate-200 flex items-center gap-1.5 mt-0.5">
                        <Building2 className="w-3.5 h-3.5 text-sky-400" />
                        {selectedEvent.facility || selectedEvent.hospital || 'Metro General'}
                      </span>
                    </div>
                  </div>

                  {/* Value / Result */}
                  {selectedEvent.value && (
                    <div className="space-y-1">
                      <span className="text-[11px] text-slate-400 block">Diagnostic Value / Dosage</span>
                      <div className="p-2.5 rounded-lg bg-[#0b0f14] border border-[#1e293b] font-mono text-teal-300 font-semibold text-xs">
                        {selectedEvent.value}
                      </div>
                    </div>
                  )}

                  {/* Reference Range */}
                  {selectedEvent.referenceRange && (
                    <div className="flex items-center justify-between text-xs pt-1">
                      <span className="text-slate-400">Reference / Normal Range:</span>
                      <span className="font-mono text-slate-300 font-medium bg-[#141c29] px-2 py-0.5 rounded border border-[#1e293b]">
                        {selectedEvent.referenceRange}
                      </span>
                    </div>
                  )}

                  {/* Clinical Notes */}
                  {selectedEvent.notes && (
                    <div className="space-y-1 pt-1">
                      <span className="text-[11px] text-slate-400 block">Clinical Documentation</span>
                      <p className="text-slate-300 leading-relaxed bg-[#0b0f14] p-3 rounded-lg border border-[#1e293b]">
                        {selectedEvent.notes}
                      </p>
                    </div>
                  )}

                  {/* Rationale */}
                  {selectedEvent.rationale && (
                    <div className="space-y-1 pt-1">
                      <span className="text-[11px] text-slate-400 block">Clinical Rationale / Protocol</span>
                      <p className="text-slate-300 italic leading-relaxed bg-teal-950/20 border border-teal-900/40 p-3 rounded-lg text-[11px]">
                        "{selectedEvent.rationale}"
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION: "SUPPORTED BY" EVIDENCE LIST */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Supported by Evidence List</span>
                  </h3>
                  <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                    {selectedEvent.evidence?.length || 0} citations
                  </span>
                </div>

                {(!selectedEvent.evidence || selectedEvent.evidence.length === 0) ? (
                  <div className="p-6 rounded-xl bg-[#121a26] border border-[#1e293b] text-center text-slate-400 text-xs">
                    No primary laboratory or imaging evidence artifacts attached directly to this entry.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {selectedEvent.evidence.map((evItem) => (
                      <div
                        key={evItem.id}
                        className="p-3.5 rounded-xl bg-[#121a26] border border-[#1e293b] hover:border-slate-700 transition-all space-y-2"
                      >
                        {/* Evidence Item Top Bar */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="p-1 rounded-md bg-[#141c29] border border-[#1e293b]">
                              {getEvidenceIcon(evItem.type)}
                            </span>
                            <span className="text-xs font-bold text-white tracking-tight">
                              {evItem.label}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {evItem.confidence !== undefined && (
                              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                {Math.round(evItem.confidence * 100)}% Conf
                              </span>
                            )}
                            <span className="text-[10px] font-mono text-slate-400">
                              {formatDate(evItem.date)}
                            </span>
                          </div>
                        </div>

                        {/* Evidence Value */}
                        {evItem.value && (
                          <div className="text-xs font-mono text-teal-300 bg-[#0b0f14] p-2 rounded-lg border border-[#1e293b]">
                            {evItem.value}
                          </div>
                        )}

                        {/* Evidence Interpretation */}
                        {evItem.interpretation && (
                          <p className="text-[11px] text-slate-300 leading-relaxed">
                            {evItem.interpretation}
                          </p>
                        )}

                        {/* Provider Footer */}
                        {evItem.provider && (
                          <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-[#1e293b]/50">
                            <span>Source Provider: <strong className="text-slate-300">{evItem.provider}</strong></span>
                            <span className="font-mono text-slate-500">Ref: {evItem.id}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Drawer Bottom Actions */}
            <div className="p-4 border-t border-[#1e293b] bg-[#101724] flex items-center justify-between gap-3">
              <button
                onClick={() => onNavigateTab('provenance')}
                className="py-2 px-3 rounded-xl bg-[#141c29] hover:bg-slate-800 text-teal-300 border border-teal-500/30 text-xs font-semibold flex items-center gap-2 transition-colors"
                title="Inspect in Provenance Knowledge Graph"
              >
                <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                <span>Trace Graph</span>
              </button>

              {onAskAgentAboutEvent && (
                <button
                  onClick={() => onAskAgentAboutEvent(selectedEvent)}
                  className="py-2 px-3 rounded-xl bg-teal-500/20 hover:bg-teal-500/30 text-teal-200 border border-teal-500/40 text-xs font-semibold flex items-center gap-2 transition-colors"
                >
                  <History className="w-3.5 h-3.5 text-teal-300" />
                  <span>Ask AI Agent</span>
                </button>
              )}

              <button
                onClick={() => setSelectedEvent(null)}
                className="py-2 px-4 rounded-xl bg-[#141c29] hover:bg-slate-800 text-slate-300 border border-[#1e293b] text-xs font-medium transition-colors ml-auto"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

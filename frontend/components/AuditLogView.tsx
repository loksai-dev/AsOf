'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Patient,
  PastAgentAnswer,
  AuditStep,
  Evidence,
} from '@/lib/types';
import { getPastAgentAnswers } from '@/lib/api';
import {
  FileCode,
  Database,
  Filter,
  Check,
  Copy,
  Zap,
  Search,
  Calendar,
  Clock,
  Download,
  Printer,
  X,
  ChevronRight,
  ShieldCheck,
  FileText,
  AlertTriangle,
  User,
  Info,
  RotateCcw,
  SlidersHorizontal,
  ExternalLink,
  ChevronDown,
  Terminal,
  Activity,
  CheckCircle2,
} from 'lucide-react';

interface AuditLogViewProps {
  activePatient: Patient;
  viewMode: 'doctor' | 'patient';
}

export function AuditLogView({
  activePatient,
  viewMode: _viewMode,
}: AuditLogViewProps) {
  const [allAnswers, setAllAnswers] = useState<PastAgentAnswer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedToolFilter, setSelectedToolFilter] = useState<string>('all');
  const [patientFilter, setPatientFilter] = useState<'current' | 'all'>('current');
  const [sortField, setSortField] = useState<'timestamp' | 'confidence' | 'latency'>('timestamp');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Selected row for Drawer
  const [selectedAnswer, setSelectedAnswer] = useState<PastAgentAnswer | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // PDF Export Stub notification
  const [pdfNotification, setPdfNotification] = useState<string | null>(null);
  const [copiedCypherIndex, setCopiedCypherIndex] = useState<number | null>(null);

  // Load audit log answers
  useEffect(() => {
    let isCancelled = false;
    setIsLoading(true);
    getPastAgentAnswers().then((data) => {
      if (!isCancelled) {
        setAllAnswers(data);
        setIsLoading(false);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, []);

  // Filter unique tools across all answers
  const uniqueTools = useMemo(() => {
    const set = new Set<string>();
    allAnswers.forEach((a) => {
      a.toolsUsed.forEach((t) => set.add(t));
    });
    return Array.from(set);
  }, [allAnswers]);

  // Apply filters: Search, Date-range, Patient, Tool
  const filteredAnswers = useMemo(() => {
    return allAnswers
      .filter((item) => {
        // Patient filter
        if (patientFilter === 'current' && item.patientId !== activePatient.id) {
          return false;
        }

        // Search query filter
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchesQuestion = item.question.toLowerCase().includes(q);
          const matchesAnswer = item.answer.toLowerCase().includes(q);
          const matchesPatient = item.patientName.toLowerCase().includes(q) || item.mrn.toLowerCase().includes(q);
          const matchesTool = item.toolsUsed.some((t) => t.toLowerCase().includes(q));
          if (!matchesQuestion && !matchesAnswer && !matchesPatient && !matchesTool) {
            return false;
          }
        }

        // Date-range filter (checking against both asOfDate and execution timestamp)
        if (startDate) {
          const itemDate = item.asOfDate || item.timestamp.slice(0, 10);
          if (itemDate < startDate) return false;
        }
        if (endDate) {
          const itemDate = item.asOfDate || item.timestamp.slice(0, 10);
          if (itemDate > endDate) return false;
        }

        // Tool filter
        if (selectedToolFilter !== 'all') {
          if (!item.toolsUsed.includes(selectedToolFilter)) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        if (sortField === 'timestamp') {
          const diff = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
          return sortOrder === 'desc' ? diff : -diff;
        }
        if (sortField === 'confidence') {
          const diff = b.confidence - a.confidence;
          return sortOrder === 'desc' ? diff : -diff;
        }
        if (sortField === 'latency') {
          const latA = a.totalLatencyMs || 0;
          const latB = b.totalLatencyMs || 0;
          const diff = latB - latA;
          return sortOrder === 'desc' ? diff : -diff;
        }
        return 0;
      });
  }, [
    allAnswers,
    patientFilter,
    activePatient.id,
    searchQuery,
    startDate,
    endDate,
    selectedToolFilter,
    sortField,
    sortOrder,
  ]);

  // Summary Metrics
  const avgLatency = useMemo(() => {
    if (filteredAnswers.length === 0) return '0.0';
    const sum = filteredAnswers.reduce(
      (acc, a) => acc + (a.totalLatencyMs || 40),
      0
    );
    return (sum / filteredAnswers.length).toFixed(1);
  }, [filteredAnswers]);

  const avgConfidence = useMemo(() => {
    if (filteredAnswers.length === 0) return '0%';
    const sum = filteredAnswers.reduce((acc, a) => acc + a.confidence, 0);
    return `${Math.round((sum / filteredAnswers.length) * 100)}%`;
  }, [filteredAnswers]);

  const totalRowsScanned = useMemo(() => {
    return filteredAnswers.reduce((acc, a) => acc + (a.totalRows || 0), 0);
  }, [filteredAnswers]);

  // Open Drawer on row click
  const handleRowClick = (ans: PastAgentAnswer) => {
    setSelectedAnswer(ans);
    setIsDrawerOpen(true);
  };

  // Close Drawer
  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
  };

  // Copy Cypher in Drawer
  const handleCopyCypher = (cypher: string, idx: number) => {
    navigator.clipboard.writeText(cypher);
    setCopiedCypherIndex(idx);
    setTimeout(() => setCopiedCypherIndex(null), 2000);
  };

  // Stub Export as PDF
  const handleExportPdf = (answerId?: string) => {
    const target = answerId ? allAnswers.find((a) => a.id === answerId) : selectedAnswer;
    const qName = target ? target.question : 'Clinical Audit Trace';
    const fileName = `AsOf_Audit_Report_${target?.mrn || 'General'}_${new Date().toISOString().slice(0, 10)}.pdf`;
    
    setPdfNotification(`Generated PDF Audit Report: "${fileName}" (Query: "${qName.slice(0, 32)}...")`);
    setTimeout(() => {
      setPdfNotification(null);
    }, 4500);
  };

  // Clear all filters
  const handleResetFilters = () => {
    setSearchQuery('');
    setStartDate('');
    setEndDate('');
    setSelectedToolFilter('all');
    setPatientFilter('current');
    setSortField('timestamp');
    setSortOrder('desc');
  };

  return (
    <div className="space-y-6 relative">
      {/* Top PDF Export Notification Toast */}
      {pdfNotification && (
        <div className="fixed top-6 right-6 z-50 p-4 rounded-2xl bg-[#0e1726] border border-teal-500/80 shadow-[0_0_30px_rgba(20,184,166,0.35)] flex items-center gap-3 animate-in fade-in slide-in-from-top-3 text-slate-100 max-w-md">
          <div className="w-9 h-9 rounded-xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400 shrink-0">
            <Download className="w-5 h-5" />
          </div>
          <div className="flex-1 text-xs">
            <div className="font-bold text-white flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-teal-400" />
              PDF Export Generated (Stub)
            </div>
            <div className="text-slate-300 font-mono text-[11px] mt-0.5 truncate">
              {pdfNotification}
            </div>
          </div>
          <button
            onClick={() => setPdfNotification(null)}
            className="text-slate-400 hover:text-white p-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Page Header & KPI Metric Badges */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/30 shadow-glowTeal">
              <FileCode className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                Clinical Agent Audit Log
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-teal-950 text-teal-300 border border-teal-800 font-normal">
                  Bitemporal Ledger
                </span>
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                Table of past agent answers with bitemporal valid and system recorded dates, executed tool chains, and complete Cypher traces.
              </p>
            </div>
          </div>
        </div>

        {/* Global KPI Cards */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="px-3.5 py-2 rounded-xl bg-[#101620] border border-[#1e293b] flex items-center gap-2.5 shadow-card">
            <div className="w-8 h-8 rounded-lg bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400">
                Avg Confidence
              </div>
              <div className="text-sm font-bold text-teal-300 font-mono">
                {avgConfidence}
              </div>
            </div>
          </div>

          <div className="px-3.5 py-2 rounded-xl bg-[#101620] border border-[#1e293b] flex items-center gap-2.5 shadow-card">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400">
                Avg Latency
              </div>
              <div className="text-sm font-bold text-cyan-300 font-mono">
                {avgLatency} ms
              </div>
            </div>
          </div>

          <div className="px-3.5 py-2 rounded-xl bg-[#101620] border border-[#1e293b] flex items-center gap-2.5 shadow-card">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400">
                Rows Extracted
              </div>
              <div className="text-sm font-bold text-indigo-300 font-mono">
                {totalRowsScanned} rows
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* FILTER CONTROLS: SEARCH & DATE-RANGE FILTERS (Requested in Prompt 6) */}
      {/* ================================================================= */}
      <div className="p-4 rounded-2xl bg-[#101620] border border-[#1e293b] shadow-card space-y-3.5">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          {/* Search Filter */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by question, answer text, tool name, or patient MRN..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 rounded-xl bg-[#141c29] border border-[#1e293b] text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-teal-500/60 shadow-inner"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Date-Range Filters (Start & End Date) */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#141c29] border border-[#1e293b] text-xs text-slate-300">
              <Calendar className="w-3.5 h-3.5 text-teal-400 shrink-0" />
              <span className="text-slate-400 text-[11px]">From:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent text-slate-200 text-xs focus:outline-none font-mono"
              />
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#141c29] border border-[#1e293b] text-xs text-slate-300">
              <Calendar className="w-3.5 h-3.5 text-teal-400 shrink-0" />
              <span className="text-slate-400 text-[11px]">To:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-transparent text-slate-200 text-xs focus:outline-none font-mono"
              />
            </div>
          </div>

          {/* Reset Filters */}
          {(searchQuery || startDate || endDate || selectedToolFilter !== 'all' || patientFilter !== 'current') && (
            <button
              onClick={handleResetFilters}
              className="flex items-center gap-1 px-3 py-2 rounded-xl bg-red-950/40 text-red-300 border border-red-800/60 text-xs hover:bg-red-900/50 transition-colors shrink-0"
              title="Clear all filters"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}
        </div>

        {/* Secondary Filter Badges: Patient Scope & Tools */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#1e293b]/60">
          <div className="flex flex-wrap items-center gap-2">
            {/* Patient Scope Toggle */}
            <div className="flex items-center rounded-lg bg-[#141c29] border border-[#1e293b] p-0.5 text-xs">
              <button
                onClick={() => setPatientFilter('current')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  patientFilter === 'current'
                    ? 'bg-teal-500/20 text-teal-300 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Current Patient ({activePatient.name.split(' ')[0]})
              </button>
              <button
                onClick={() => setPatientFilter('all')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  patientFilter === 'all'
                    ? 'bg-teal-500/20 text-teal-300 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                All Patients ({allAnswers.length})
              </button>
            </div>

            {/* Quick Date Presets */}
            <div className="hidden sm:flex items-center gap-1 text-[11px]">
              <span className="text-slate-400 ml-1">Presets:</span>
              <button
                onClick={() => {
                  setStartDate('2024-03-01');
                  setEndDate('2024-03-31');
                }}
                className="px-2 py-0.5 rounded bg-[#141c29] text-slate-300 hover:text-teal-300 border border-[#1e293b] transition-colors"
              >
                Mar 2024
              </button>
              <button
                onClick={() => {
                  setStartDate('2024-04-01');
                  setEndDate('2024-04-30');
                }}
                className="px-2 py-0.5 rounded bg-[#141c29] text-slate-300 hover:text-teal-300 border border-[#1e293b] transition-colors"
              >
                Apr 2024
              </button>
              <button
                onClick={() => {
                  setStartDate('2024-01-01');
                  setEndDate('2024-05-31');
                }}
                className="px-2 py-0.5 rounded bg-[#141c29] text-slate-300 hover:text-teal-300 border border-[#1e293b] transition-colors"
              >
                2024 YTD
              </button>
            </div>
          </div>

          {/* Results count & Sort Order */}
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span>
              Showing <strong className="text-teal-400">{filteredAnswers.length}</strong> of{' '}
              {allAnswers.length} entries
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px]">Sort:</span>
              <select
                value={sortField}
                onChange={(e) => setSortField(e.target.value as any)}
                className="bg-[#141c29] text-slate-200 border border-[#1e293b] rounded-lg px-2 py-1 text-xs focus:outline-none"
              >
                <option value="timestamp">Timestamp</option>
                <option value="confidence">Confidence</option>
                <option value="latency">Latency</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* MAIN TABLE: PAST AGENT ANSWERS (Requested in Prompt 6)            */}
      {/* Columns: Question, As-Of Date, Known-As-Of Date, Tools Used,     */}
      {/* Confidence, Timestamp. Row click opens Drawer.                   */}
      {/* ================================================================= */}
      <div className="rounded-2xl bg-[#0b0f14] border border-[#1e293b] shadow-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            {/* Table Header */}
            <thead className="bg-[#101620] border-b border-[#1e293b] text-slate-400 uppercase text-[10px] tracking-wider font-mono">
              <tr>
                <th scope="col" className="px-5 py-3.5 font-bold">
                  Question / Clinical Query
                </th>
                <th scope="col" className="px-4 py-3.5 font-bold whitespace-nowrap">
                  As-Of Date (Valid)
                </th>
                <th scope="col" className="px-4 py-3.5 font-bold whitespace-nowrap">
                  Known-As-Of Date (Sys)
                </th>
                <th scope="col" className="px-4 py-3.5 font-bold">
                  Tools Used
                </th>
                <th scope="col" className="px-4 py-3.5 font-bold whitespace-nowrap">
                  Confidence
                </th>
                <th scope="col" className="px-4 py-3.5 font-bold whitespace-nowrap">
                  Timestamp
                </th>
                <th scope="col" className="px-4 py-3.5 text-right font-bold">
                  Action
                </th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-[#1e293b]/70">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
                      <span>Loading bitemporal audit entries...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredAnswers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                      <AlertTriangle className="w-8 h-8 text-amber-400/80 mb-1" />
                      <div className="font-bold text-white text-sm">
                        No audit trace records match criteria
                      </div>
                      <p className="text-xs text-slate-500">
                        Try adjusting your search terms, removing date boundaries, or toggling to "All Patients".
                      </p>
                      <button
                        onClick={handleResetFilters}
                        className="mt-2 px-3 py-1.5 rounded-lg bg-teal-500/20 text-teal-300 border border-teal-500/40 text-xs hover:bg-teal-500/30 transition-colors"
                      >
                        Reset All Filters
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredAnswers.map((item) => {
                  const isSelected = selectedAnswer?.id === item.id && isDrawerOpen;
                  const confPct = Math.round(item.confidence * 100);

                  return (
                    <tr
                      key={item.id}
                      onClick={() => handleRowClick(item)}
                      className={`group hover:bg-[#121a26] transition-all cursor-pointer ${
                        isSelected ? 'bg-teal-500/10 border-l-4 border-l-teal-400' : ''
                      }`}
                    >
                      {/* Column 1: Question */}
                      <td className="px-5 py-4 max-w-md">
                        <div className="space-y-1">
                          <div className="font-semibold text-white group-hover:text-teal-300 transition-colors text-xs sm:text-sm flex items-center gap-1.5">
                            <span>{item.question}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400">
                            <span className="font-mono text-slate-300 bg-[#141c29] px-1.5 py-0.5 rounded border border-[#1e293b]">
                              {item.patientName}
                            </span>
                            <span className="font-mono text-slate-500">
                              {item.mrn}
                            </span>
                            <span className="text-teal-400/80">•</span>
                            <span className="text-slate-400">
                              {item.auditSteps.length} tool calls
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Column 2: As-Of Date (Valid Time) */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                          <span className="font-mono text-slate-200 font-medium">
                            {item.asOfDate}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          Real-world event
                        </div>
                      </td>

                      {/* Column 3: Known-As-Of Date (Transaction Time) */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span className="font-mono text-slate-200 font-medium">
                            {item.knownAsOfDate}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          EHR recorded
                        </div>
                      </td>

                      {/* Column 4: Tools Used */}
                      <td className="px-4 py-4 max-w-xs">
                        <div className="flex flex-wrap gap-1">
                          {item.toolsUsed.slice(0, 2).map((tool, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 rounded-md bg-[#141c29] border border-[#1e293b] text-slate-300 font-mono text-[10px] truncate max-w-[140px]"
                              title={tool}
                            >
                              {tool}
                            </span>
                          ))}
                          {item.toolsUsed.length > 2 && (
                            <span className="px-1.5 py-0.5 rounded-md bg-teal-950 text-teal-300 border border-teal-800 font-mono text-[10px]">
                              +{item.toolsUsed.length - 2}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Column 5: Confidence */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-mono font-bold text-xs ${
                                confPct >= 90
                                  ? 'text-teal-400'
                                  : confPct >= 75
                                  ? 'text-cyan-400'
                                  : 'text-amber-400'
                              }`}
                            >
                              {confPct}%
                            </span>
                          </div>
                          <div className="w-20 h-1.5 rounded-full bg-[#1e293b] overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                confPct >= 90
                                  ? 'bg-teal-400 shadow-glowTeal'
                                  : confPct >= 75
                                  ? 'bg-cyan-400'
                                  : 'bg-amber-400'
                              }`}
                              style={{ width: `${confPct}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Column 6: Timestamp */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="font-mono text-slate-200 text-xs">
                          {item.timestamp.slice(0, 10)}
                        </div>
                        <div className="font-mono text-[10px] text-slate-400">
                          {item.timestamp.slice(11)}
                        </div>
                      </td>

                      {/* Column 7: Action (Inspect & PDF) */}
                      <td className="px-4 py-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleExportPdf(item.id);
                            }}
                            className="p-1.5 rounded-lg bg-[#141c29] hover:bg-[#1f2c40] text-slate-400 hover:text-white border border-[#1e293b] transition-colors"
                            title="Export Audit Trace as PDF"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          <span className="p-1 rounded text-slate-400 group-hover:text-teal-400 group-hover:translate-x-0.5 transition-all">
                            <ChevronRight className="w-4 h-4" />
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ================================================================= */}
      {/* SLIDE-OVER RIGHT DRAWER (Requested in Prompt 6)                   */}
      {/* Row click opens drawer with full audit trace & "Export as PDF"    */}
      {/* ================================================================= */}
      {isDrawerOpen && selectedAnswer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in">
          {/* Backdrop click to dismiss */}
          <div
            className="flex-1"
            onClick={handleCloseDrawer}
          />

          {/* Drawer Container */}
          <div className="w-full max-w-2xl bg-[#090d14] border-l border-[#1e293b] h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            {/* Drawer Header */}
            <div className="px-6 py-4 bg-[#0e141f] border-b border-[#1e293b] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400 shadow-glowTeal">
                  <FileCode className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-white tracking-tight">
                      Full Audit Trace & Graph Provenance
                    </h2>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-teal-950 text-teal-300 border border-teal-800">
                      {selectedAnswer.id}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-mono">
                    Executed: {selectedAnswer.timestamp} • Patient: {selectedAnswer.patientName}
                  </p>
                </div>
              </div>

              {/* Header Actions: Export as PDF & Close */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleExportPdf(selectedAnswer.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold transition-all shadow-glowTeal"
                  title="Export this audit trace as PDF"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export as PDF</span>
                </button>
                <button
                  onClick={handleCloseDrawer}
                  className="p-1.5 rounded-xl bg-[#141c29] text-slate-400 hover:text-white border border-[#1e293b] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Drawer Body (Scrollable) */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-slate-200">
              {/* Question & Bitemporal Context Card */}
              <div className="p-4 rounded-2xl bg-[#101620] border border-[#1e293b] space-y-3">
                <div className="text-[10px] uppercase font-bold text-teal-400 tracking-wider font-mono">
                  CLINICAL REASONING QUERY
                </div>
                <h3 className="text-base font-bold text-white leading-snug">
                  {selectedAnswer.question}
                </h3>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[#1e293b]/70 text-xs font-mono">
                  <div className="p-2 rounded-lg bg-[#0d141e] border border-[#1e293b]">
                    <span className="text-[10px] text-slate-400 block font-sans">
                      As-Of Valid Date
                    </span>
                    <span className="text-teal-300 font-bold">
                      {selectedAnswer.asOfDate}
                    </span>
                  </div>

                  <div className="p-2 rounded-lg bg-[#0d141e] border border-[#1e293b]">
                    <span className="text-[10px] text-slate-400 block font-sans">
                      Known-As-Of Sys Date
                    </span>
                    <span className="text-amber-300 font-bold">
                      {selectedAnswer.knownAsOfDate}
                    </span>
                  </div>

                  <div className="p-2 rounded-lg bg-[#0d141e] border border-[#1e293b]">
                    <span className="text-[10px] text-slate-400 block font-sans">
                      Confidence Score
                    </span>
                    <span className="text-emerald-300 font-bold">
                      {Math.round(selectedAnswer.confidence * 100)}%
                    </span>
                  </div>

                  <div className="p-2 rounded-lg bg-[#0d141e] border border-[#1e293b]">
                    <span className="text-[10px] text-slate-400 block font-sans">
                      Execution Time
                    </span>
                    <span className="text-cyan-300 font-bold">
                      {selectedAnswer.totalLatencyMs || 54.4} ms
                    </span>
                  </div>
                </div>
              </div>

              {/* Agent's Answer Payload */}
              <div className="p-4 rounded-2xl bg-[#101620] border border-[#1e293b] space-y-2">
                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider font-mono flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-teal-400" />
                  Synthesized Answer Payload
                </div>
                <div className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap text-slate-200">
                  {selectedAnswer.answer}
                </div>
              </div>

              {/* Cited Objective Evidence (if present) */}
              {selectedAnswer.evidenceCited && selectedAnswer.evidenceCited.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider font-mono flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-cyan-400" />
                    Cited Objective Laboratory & Clinical Evidence
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {selectedAnswer.evidenceCited.map((ev) => (
                      <div
                        key={ev.id}
                        className="p-3 rounded-xl bg-[#101620] border border-[#1e293b] text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white text-[11px] truncate">
                            {ev.label}
                          </span>
                          <span className="text-[10px] font-mono text-teal-400">
                            {ev.date}
                          </span>
                        </div>
                        {ev.value && (
                          <div className="font-mono text-teal-300 text-[11px]">
                            {ev.value}
                          </div>
                        )}
                        {ev.interpretation && (
                          <p className="text-[11px] text-slate-400 leading-tight">
                            {ev.interpretation}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Full Audit Trace Tool Calls in Order */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-[#1e293b] pb-2">
                  <div className="text-[11px] uppercase font-bold text-slate-300 tracking-wider font-mono flex items-center gap-1.5">
                    <Terminal className="w-4 h-4 text-teal-400" />
                    Sequential Tool Calls & Cypher Execution Trace
                  </div>
                  <span className="text-[10px] font-mono text-teal-400">
                    {selectedAnswer.auditSteps.length} tools executed
                  </span>
                </div>

                <div className="space-y-3.5">
                  {selectedAnswer.auditSteps.map((step: AuditStep, idx: number) => (
                    <div
                      key={step.id || idx}
                      className="p-4 rounded-xl bg-[#101620] border border-[#1e293b] space-y-2.5 shadow-card"
                    >
                      {/* Step Header */}
                      <div className="flex items-center justify-between gap-2 border-b border-[#1e293b]/70 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-md bg-teal-950 border border-teal-800 text-teal-300 font-mono text-[10px] font-bold flex items-center justify-center">
                            #{idx + 1}
                          </span>
                          <span className="font-mono font-bold text-teal-300 text-xs">
                            {step.tool}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 font-mono text-[10px]">
                          <span className="px-2 py-0.5 rounded bg-[#141c29] border border-[#1e293b] text-cyan-400">
                            {step.rows} {step.rows === 1 ? 'row' : 'rows'}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-[#141c29] border border-[#1e293b] text-teal-400">
                            {step.latencyMs} ms
                          </span>
                          <button
                            onClick={() => handleCopyCypher(step.cypher, idx)}
                            className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                            title="Copy Cypher query"
                          >
                            {copiedCypherIndex === idx ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span className="text-emerald-400">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Plain-English explanation */}
                      {step.explanation && (
                        <p className="text-xs text-slate-300 leading-relaxed font-sans">
                          {step.explanation}
                        </p>
                      )}

                      {/* Cypher in a Code Block */}
                      <div className="rounded-lg bg-[#05080c] border border-[#1e293b] p-3 overflow-x-auto">
                        <div className="text-[10px] font-mono text-slate-400 uppercase font-bold mb-1.5 flex items-center justify-between">
                          <span>Neo4j Cypher Statement</span>
                          <span className="text-teal-400">READ-ONLY AUDIT</span>
                        </div>
                        <pre className="text-xs font-mono text-teal-200 whitespace-pre-wrap leading-relaxed">
                          {step.cypher}
                        </pre>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Drawer Footer Actions */}
            <div className="p-4 bg-[#0e141f] border-t border-[#1e293b] flex items-center justify-between shrink-0">
              <button
                onClick={() => handleExportPdf(selectedAnswer.id)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs transition-all shadow-glowTeal"
              >
                <Printer className="w-4 h-4" />
                <span>Export as PDF Report</span>
              </button>

              <button
                onClick={handleCloseDrawer}
                className="px-4 py-2 rounded-xl bg-[#141c29] hover:bg-[#1a2536] text-slate-300 hover:text-white border border-[#1e293b] text-xs transition-colors"
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

'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  Node,
  Edge,
  NodeProps,
  EdgeProps,
  getBezierPath,
  EdgeLabelRenderer,
  ReactFlowProvider,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';

import {
  ProvenancePath,
  GraphNode,
  GraphEdge,
  Patient,
} from '@/lib/types';
import { getPath } from '@/lib/api';
import {
  User,
  Activity,
  FileText,
  Scan,
  Stethoscope,
  CheckCircle2,
  Play,
  RotateCcw,
  Sparkles,
  Network,
  Clock,
  Calendar,
  History,
  AlertTriangle,
  Info,
  Check,
  ShieldCheck,
  Eye,
  EyeOff,
} from 'lucide-react';

interface ProvenanceGraphViewProps {
  activePatient: Patient;
  viewMode: 'doctor' | 'patient';
}

// ==========================================
// 1. CUSTOM NODE COMPONENT FOR REACT FLOW
// ==========================================
function ClinicalNodeComponent({ id, data, selected }: NodeProps) {
  const { node, isHighlighted, isDimmed, isCurrentReplay } = data as {
    node: GraphNode;
    isHighlighted: boolean;
    isDimmed: boolean;
    isCurrentReplay: boolean;
  };

  // Node type formatting: Patient, Diagnosis, Lab/Imaging, Provider, Correction
  const getNodeStyle = () => {
    switch (node.type) {
      case 'patient':
        return {
          icon: <User className="w-4 h-4 text-sky-400" />,
          typeLabel: 'Patient',
          borderColor: isCurrentReplay
            ? 'border-sky-300 ring-4 ring-sky-400/80'
            : isHighlighted
            ? 'border-sky-400 shadow-[0_0_20px_rgba(56,189,248,0.35)]'
            : 'border-sky-500/40',
          bg: 'bg-[#0c1828]',
          badgeBg: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
          accentDot: 'bg-sky-400',
        };
      case 'diagnosis':
        const isSuperseded = node.status === 'superseded';
        const isConflict = node.status === 'conflict';
        return {
          icon: <Activity className={`w-4 h-4 ${isSuperseded ? 'text-amber-400' : 'text-teal-400'}`} />,
          typeLabel: isSuperseded ? 'Diagnosis (Superseded)' : 'Diagnosis',
          borderColor: isCurrentReplay
            ? 'border-teal-300 ring-4 ring-teal-400/80'
            : isSuperseded
            ? 'border-amber-500/60 shadow-glowAmber'
            : isConflict
            ? 'border-red-500/60 shadow-glowRed'
            : isHighlighted
            ? 'border-teal-400 shadow-glowTeal ring-2 ring-teal-400/50'
            : 'border-teal-500/40',
          bg: isSuperseded ? 'bg-[#241608]' : isConflict ? 'bg-[#280c10]' : 'bg-[#0a2320]',
          badgeBg: isSuperseded
            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
            : 'bg-teal-500/15 text-teal-300 border-teal-500/30',
          accentDot: isSuperseded ? 'bg-amber-400' : 'bg-teal-400',
        };
      case 'lab':
      case 'imaging':
      case 'lab_imaging':
        return {
          icon: node.type === 'imaging' ? <Scan className="w-4 h-4 text-purple-400" /> : <FileText className="w-4 h-4 text-purple-400" />,
          typeLabel: node.type === 'imaging' ? 'Imaging Study' : 'Laboratory Assay',
          borderColor: isCurrentReplay
            ? 'border-purple-300 ring-4 ring-purple-400/80'
            : isHighlighted
            ? 'border-purple-400 shadow-[0_0_20px_rgba(168,85,247,0.35)]'
            : 'border-purple-500/40',
          bg: 'bg-[#1b102b]',
          badgeBg: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
          accentDot: 'bg-purple-400',
        };
      case 'provider':
        return {
          icon: <Stethoscope className="w-4 h-4 text-blue-400" />,
          typeLabel: 'Clinician / Specialist',
          borderColor: isCurrentReplay
            ? 'border-blue-300 ring-4 ring-blue-400/80'
            : isHighlighted
            ? 'border-blue-400 shadow-[0_0_20px_rgba(96,165,250,0.35)]'
            : 'border-blue-500/40',
          bg: 'bg-[#0d1d33]',
          badgeBg: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
          accentDot: 'bg-blue-400',
        };
      case 'correction':
        return {
          icon: <CheckCircle2 className="w-4 h-4 text-amber-400" />,
          typeLabel: 'Provenance Correction',
          borderColor: isCurrentReplay
            ? 'border-amber-300 ring-4 ring-amber-400/90'
            : isHighlighted
            ? 'border-amber-400 shadow-glowAmber ring-2 ring-amber-400/50'
            : 'border-amber-500/50',
          bg: 'bg-[#291a08]',
          badgeBg: 'bg-amber-500/25 text-amber-300 border-amber-500/40',
          accentDot: 'bg-amber-400',
        };
      default:
        return {
          icon: <Activity className="w-4 h-4 text-slate-400" />,
          typeLabel: 'Clinical Node',
          borderColor: 'border-slate-700',
          bg: 'bg-[#141c29]',
          badgeBg: 'bg-slate-800 text-slate-300 border-slate-700',
          accentDot: 'bg-slate-400',
        };
    }
  };

  const style = getNodeStyle();

  return (
    <div
      className={`relative min-w-[210px] max-w-[240px] rounded-2xl border p-3.5 transition-all duration-300 shadow-card ${
        style.bg
      } ${style.borderColor} ${
        isDimmed
          ? 'opacity-30 grayscale-[40%] scale-[0.98]'
          : isCurrentReplay
          ? 'scale-105 z-40 animate-pulse'
          : isHighlighted
          ? 'opacity-100 scale-100 z-30'
          : 'opacity-85 hover:opacity-100'
      } ${selected ? 'ring-2 ring-white/60' : ''}`}
    >
      {/* Handles for clean routing */}
      <Handle type="target" position={Position.Left} className="w-2.5 h-2.5 bg-teal-400 border-2 border-[#0b0f14]" />
      <Handle type="source" position={Position.Right} className="w-2.5 h-2.5 bg-teal-400 border-2 border-[#0b0f14]" />
      <Handle type="target" position={Position.Top} id="top" className="w-2.5 h-2.5 bg-teal-400 border-2 border-[#0b0f14]" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="w-2.5 h-2.5 bg-teal-400 border-2 border-[#0b0f14]" />

      {/* Top Header Badge */}
      <div className="flex items-center justify-between gap-1.5 pb-2 border-b border-white/10">
        <div className="flex items-center gap-1.5">
          <span className="p-1 rounded-md bg-[#0b0f14]/80 border border-white/10">
            {style.icon}
          </span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${style.badgeBg}`}>
            {style.typeLabel}
          </span>
        </div>

        {node.status === 'superseded' && (
          <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800">
            RETRACTED
          </span>
        )}
      </div>

      {/* Label and Sublabel */}
      <div className="pt-2 space-y-1">
        <h4
          className={`text-xs font-bold leading-tight ${
            node.status === 'superseded' ? 'line-through text-amber-200/80 decoration-amber-500/70' : 'text-white'
          }`}
        >
          {node.label}
        </h4>

        {node.sublabel && (
          <p className="text-[10px] text-slate-300 leading-snug line-clamp-2">
            {node.sublabel}
          </p>
        )}

        {node.date && (
          <div className="flex items-center gap-1 text-[10px] font-mono text-slate-400 pt-1">
            <Calendar className="w-3 h-3 text-slate-500" />
            <span>{node.date}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// 2. CUSTOM EDGE WITH BITEMPORAL HOVER TOOLTIP
// ==========================================
function ClinicalEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const [isHovered, setIsHovered] = useState(false);

  const {
    label,
    isHighlighted,
    isDimmed,
    isCurrentReplay,
    validFrom,
    validTo,
    sysFrom,
    sysTo,
    type,
  } = (data || {}) as {
    label: string;
    isHighlighted: boolean;
    isDimmed: boolean;
    isCurrentReplay: boolean;
    validFrom?: string;
    validTo?: string | null;
    sysFrom?: string;
    sysTo?: string | null;
    type?: string;
  };

  // Edge stroke color & styling
  const isConflict = type === 'CONFLICTS_WITH' || label === 'CONFLICTS_WITH';
  const isSupersedes = type === 'SUPERSEDED_BY' || label?.includes('SUPERSEDES');

  const strokeColor = isCurrentReplay
    ? '#2dd4bf'
    : isHighlighted
    ? '#2dd4bf'
    : isConflict
    ? '#ef4444'
    : isSupersedes
    ? '#f59e0b'
    : isDimmed
    ? '#334155'
    : '#475569';

  const strokeWidth = isCurrentReplay ? 3.5 : isHighlighted ? 3 : isDimmed ? 1 : 1.5;
  const strokeOpacity = isDimmed && !isHighlighted ? 0.2 : isHighlighted ? 1 : 0.65;

  return (
    <>
      {/* Interactive wider hover trigger path */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={24}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="cursor-pointer"
      />

      {/* Visible Bezier Edge Path */}
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeOpacity={strokeOpacity}
        strokeDasharray={isHighlighted ? '6 3' : undefined}
        markerEnd={markerEnd}
        className={`transition-all duration-300 ${
          isHighlighted ? 'filter drop-shadow-[0_0_6px_rgba(45,212,191,0.6)] animate-pulse' : ''
        }`}
      />

      {/* Edge Label and Tooltip via EdgeLabelRenderer */}
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className="relative z-20"
        >
          {/* Label Badge */}
          <span
            className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold tracking-tight transition-all duration-200 cursor-pointer border select-none ${
              isCurrentReplay
                ? 'bg-teal-500 text-slate-950 border-teal-300 shadow-glowTeal scale-110'
                : isHighlighted
                ? 'bg-teal-950/90 text-teal-300 border-teal-500/60 shadow-glowTeal ring-1 ring-teal-400/40'
                : isConflict
                ? 'bg-red-950/90 text-red-300 border-red-600/60'
                : isSupersedes
                ? 'bg-amber-950/90 text-amber-300 border-amber-600/60'
                : isDimmed
                ? 'bg-[#101620]/70 text-slate-600 border-slate-800 opacity-40'
                : 'bg-[#141c29]/90 text-slate-300 border-[#1e293b] hover:border-slate-600'
            }`}
          >
            {label}
          </span>

          {/* HOVER TOOLTIP: valid_from, valid_to, sys_from, sys_to */}
          {isHovered && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-3 rounded-xl bg-[#0b0f14]/95 backdrop-blur-md border border-teal-500/50 shadow-2xl z-50 text-left animate-in fade-in zoom-in-95 pointer-events-none">
              <div className="flex items-center justify-between pb-1.5 border-b border-[#1e293b]">
                <span className="text-[10px] font-bold uppercase tracking-wider text-teal-400 flex items-center gap-1">
                  <Network className="w-3 h-3" />
                  {label}
                </span>
                <span className="text-[9px] font-mono text-slate-400">Provenance Link</span>
              </div>

              <div className="pt-2 space-y-2 text-[11px]">
                {/* Valid Time */}
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-semibold text-teal-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Valid Time (Biological Reality)
                  </span>
                  <div className="font-mono text-slate-200 text-[10px] bg-[#121824] px-2 py-1 rounded border border-[#1e293b]">
                    valid_from: <strong className="text-teal-300">{validFrom || '2024-01-10'}</strong>
                    <br />
                    valid_to: <strong className={validTo ? 'text-amber-400' : 'text-emerald-400'}>{validTo || 'null (Currently Active)'}</strong>
                  </div>
                </div>

                {/* System Time */}
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-semibold text-amber-400 flex items-center gap-1">
                    <History className="w-3 h-3" />
                    System Time (EHR Audit)
                  </span>
                  <div className="font-mono text-slate-200 text-[10px] bg-[#121824] px-2 py-1 rounded border border-[#1e293b]">
                    sys_from: <strong className="text-amber-300">{sysFrom || '2024-01-12T14:32:00Z'}</strong>
                    <br />
                    sys_to: <strong className={sysTo ? 'text-amber-400' : 'text-slate-400'}>{sysTo || 'null (Current Version)'}</strong>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

// Register custom node & edge types
const nodeTypes = {
  clinical: ClinicalNodeComponent,
};

const edgeTypes = {
  clinical: ClinicalEdgeComponent,
};

// ==========================================
// 3. MAIN PROVENANCE GRAPH VIEW
// ==========================================
function ProvenanceGraphInner({
  activePatient,
}: {
  activePatient: Patient;
}) {
  const [graphData, setGraphData] = useState<ProvenancePath | null>(null);
  const [highlightPathActive, setHighlightPathActive] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Replay reasoning animation state
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayStep, setReplayStep] = useState<number>(-1);
  const replayTimerRef = useRef<NodeJS.Timeout[]>([]);

  const { fitView } = useReactFlow();

  // Load graph data
  useEffect(() => {
    let isCancelled = false;
    getPath(activePatient.id).then((path) => {
      if (!isCancelled) {
        setGraphData(path);
        setSelectedNodeId(path.nodes[0]?.id || null);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [activePatient.id]);

  // Clean up replay timers
  useEffect(() => {
    return () => {
      replayTimerRef.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  // Set of edge IDs that form the agent's highlighted reasoning path
  const highlightedEdgeIds = useMemo(() => {
    return new Set(graphData?.highlightedEdgeIds || []);
  }, [graphData]);

  // Replay steps narration sequence
  const replayStepsSequence = useMemo(() => {
    if (!graphData) return [];
    return graphData.highlightedEdgeIds.map((edgeId, index) => {
      const edge = graphData.edges.find((e) => e.id === edgeId);
      const sourceNode = graphData.nodes.find((n) => n.id === edge?.source);
      const targetNode = graphData.nodes.find((n) => n.id === edge?.target);
      return {
        stepNumber: index + 1,
        edgeId,
        sourceNodeId: edge?.source,
        targetNodeId: edge?.target,
        label: edge?.label,
        narration: `Step ${index + 1}: ${sourceNode?.label || 'Origin'} → [${edge?.label}] → ${targetNode?.label || 'Target'}`,
      };
    });
  }, [graphData]);

  // Start sequential 600ms animated replay
  const handleStartReplay = useCallback(() => {
    if (!graphData || isReplaying) return;

    // Clear previous timers
    replayTimerRef.current.forEach((t) => clearTimeout(t));
    replayTimerRef.current = [];

    setIsReplaying(true);
    setHighlightPathActive(true);
    setReplayStep(0);

    const stepsCount = replayStepsSequence.length;

    replayStepsSequence.forEach((step, idx) => {
      const timer = setTimeout(() => {
        setReplayStep(idx);
        if (step.targetNodeId) {
          setSelectedNodeId(step.targetNodeId);
        }
      }, idx * 600); // Exactly 600ms delay per step as required
      replayTimerRef.current.push(timer);
    });

    // End replay after full sequence
    const finalTimer = setTimeout(() => {
      setIsReplaying(false);
      setReplayStep(-1);
    }, stepsCount * 600 + 400);
    replayTimerRef.current.push(finalTimer);
  }, [graphData, isReplaying, replayStepsSequence]);

  // Transform data into React Flow nodes
  const flowNodes: Node[] = useMemo(() => {
    if (!graphData) return [];

    // Find node IDs participating in the highlighted path
    const highlightedNodeIds = new Set<string>();
    graphData.edges
      .filter((e) => highlightedEdgeIds.has(e.id))
      .forEach((e) => {
        highlightedNodeIds.add(e.source);
        highlightedNodeIds.add(e.target);
      });

    return graphData.nodes.map((node) => {
      const isInHighlightedPath = highlightedNodeIds.has(node.id);
      const isDimmed = highlightPathActive && !isInHighlightedPath;

      // During active replay, check if node is in current step
      const currentReplayStepData = replayStep >= 0 ? replayStepsSequence[replayStep] : null;
      const isCurrentReplay = Boolean(
        currentReplayStepData &&
          (currentReplayStepData.sourceNodeId === node.id || currentReplayStepData.targetNodeId === node.id)
      );

      return {
        id: node.id,
        type: 'clinical',
        position: { x: node.x || 100, y: node.y || 100 },
        data: {
          node,
          isHighlighted: highlightPathActive && isInHighlightedPath,
          isDimmed,
          isCurrentReplay,
        },
      };
    });
  }, [graphData, highlightedEdgeIds, highlightPathActive, replayStep, replayStepsSequence]);

  // Transform data into React Flow edges
  const flowEdges: Edge[] = useMemo(() => {
    if (!graphData) return [];

    return graphData.edges.map((edge, index) => {
      const isHighlighted = highlightedEdgeIds.has(edge.id);
      const isDimmed = highlightPathActive && !isHighlighted;

      // During active replay, check if edge is at or before current replay step
      const activeReplayEdgeId = replayStep >= 0 ? replayStepsSequence[replayStep]?.edgeId : null;
      const isCurrentReplay = isReplaying && activeReplayEdgeId === edge.id;

      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'clinical',
        animated: isHighlighted || isCurrentReplay,
        data: {
          label: edge.label,
          type: edge.type,
          isHighlighted: highlightPathActive && isHighlighted,
          isDimmed,
          isCurrentReplay,
          validFrom: edge.validFrom,
          validTo: edge.validTo,
          sysFrom: edge.sysFrom,
          sysTo: edge.sysTo,
        },
      };
    });
  }, [graphData, highlightedEdgeIds, highlightPathActive, isReplaying, replayStep, replayStepsSequence]);

  // Currently inspected node details
  const selectedNode = graphData?.nodes.find((n) => n.id === selectedNodeId);

  if (!graphData) {
    return (
      <div className="p-16 text-center text-slate-400 bg-[#101620] rounded-2xl border border-[#1e293b]">
        Loading Clinical Provenance Graph...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Controls Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-teal-500/15 text-teal-300 border border-teal-500/30 shadow-glowTeal">
              <Network className="w-5 h-5 text-teal-400" />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
                Clinical Provenance Graph
                <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-teal-500/10 text-teal-300 border border-teal-500/30 font-semibold">
                  React Flow Powered
                </span>
              </h1>
              <p className="text-sm text-slate-300 mt-1">
                Multi-hop diagnostic graph for <span className="text-teal-300 font-semibold">{activePatient.name}</span>.
                Hover edges to inspect bitemporal timestamps.
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls: "Replay reasoning" & "Highlight Agent Path" */}
        <div className="flex flex-wrap items-center gap-2 bg-[#101620] p-1.5 rounded-2xl border border-[#1e293b] shadow-card">
          {/* Replay reasoning button (600ms delay per step) */}
          <button
            onClick={handleStartReplay}
            disabled={isReplaying}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border shadow-sm ${
              isReplaying
                ? 'bg-teal-500/20 text-teal-300 border-teal-500/60 ring-2 ring-teal-400 animate-pulse'
                : 'bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold shadow-glowTeal border-teal-400'
            }`}
            title="Animates the highlighted agent reasoning path edge by edge with a 600ms delay"
          >
            {isReplaying ? (
              <Clock className="w-4 h-4 text-teal-300 animate-spin" />
            ) : (
              <Play className="w-4 h-4 fill-current" />
            )}
            <span>{isReplaying ? 'Replaying Reasoning...' : 'Replay reasoning'}</span>
          </button>

          {/* Path Highlight Toggle */}
          <button
            onClick={() => setHighlightPathActive(!highlightPathActive)}
            className={`px-3 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 border ${
              highlightPathActive
                ? 'bg-[#141c29] text-teal-300 border-teal-500/40'
                : 'bg-[#141c29] text-slate-400 border-[#1e293b] hover:text-white'
            }`}
            title="Toggle dimming on non-reasoning paths"
          >
            {highlightPathActive ? <Eye className="w-3.5 h-3.5 text-teal-400" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>{highlightPathActive ? 'Agent Trail Highlighted' : 'Show All Raw Edges'}</span>
          </button>

          {/* Fit View button */}
          <button
            onClick={() => fitView({ duration: 400, padding: 0.2 })}
            className="p-2 rounded-xl bg-[#141c29] border border-[#1e293b] text-slate-300 hover:text-white hover:border-slate-700 transition-colors"
            title="Fit graph to viewport"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* GRAPH LEGEND BAR */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-[#101620] border border-[#1e293b] text-xs shadow-card">
        {/* Node Types Legend */}
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Node Types:</span>

          {/* 1. Patient */}
          <span className="flex items-center gap-1.5 text-sky-300 font-medium">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400 shadow-sm" />
            <User className="w-3.5 h-3.5" />
            <span>Patient</span>
          </span>

          {/* 2. Diagnosis */}
          <span className="flex items-center gap-1.5 text-teal-300 font-medium">
            <span className="w-2.5 h-2.5 rounded-full bg-teal-400 shadow-sm" />
            <Activity className="w-3.5 h-3.5" />
            <span>Diagnosis</span>
          </span>

          {/* 3. Lab/Imaging */}
          <span className="flex items-center gap-1.5 text-purple-300 font-medium">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-400 shadow-sm" />
            <Scan className="w-3.5 h-3.5" />
            <span>Lab / Imaging</span>
          </span>

          {/* 4. Provider */}
          <span className="flex items-center gap-1.5 text-blue-300 font-medium">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-400 shadow-sm" />
            <Stethoscope className="w-3.5 h-3.5" />
            <span>Provider</span>
          </span>

          {/* 5. Correction */}
          <span className="flex items-center gap-1.5 text-amber-300 font-medium">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-sm" />
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Correction</span>
          </span>
        </div>

        {/* Path Styles Legend */}
        <div className="flex items-center gap-3 text-xs pt-1 sm:pt-0 border-t sm:border-t-0 border-[#1e293b]">
          <span className="flex items-center gap-1.5 text-teal-300 font-bold">
            <span className="w-3 h-0.5 bg-teal-400 rounded-full" />
            <span>Agent Path (Teal)</span>
          </span>
          <span className="flex items-center gap-1.5 text-red-400">
            <span className="w-3 h-0.5 bg-red-400 rounded-full" />
            <span>Conflict</span>
          </span>
          <span className="flex items-center gap-1.5 text-slate-500">
            <span className="w-3 h-0.5 bg-slate-600 rounded-full" />
            <span>Dimmed</span>
          </span>
        </div>
      </div>

      {/* REPLAY REASONING LIVE PROGRESS BANNER */}
      {isReplaying && replayStep >= 0 && (
        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-teal-950/60 via-[#122422] to-[#101620] border border-teal-500/60 shadow-glowTeal flex items-center justify-between text-xs text-teal-200 animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-teal-400 animate-spin" />
            <span className="font-bold text-white">
              {replayStepsSequence[replayStep]?.narration}
            </span>
          </div>

          <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-teal-900/60 border border-teal-700/60 text-teal-300">
            Edge {replayStep + 1} of {replayStepsSequence.length} (600ms pace)
          </span>
        </div>
      )}

      {/* MAIN REACT FLOW GRAPH CANVAS & SIDE INSPECTOR */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* REACT FLOW CANVAS CONTAINER */}
        <div className="lg:col-span-8 rounded-2xl bg-[#080d14] border border-[#1e293b] shadow-2xl relative overflow-hidden h-[620px]">
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            minZoom={0.3}
            maxZoom={2.0}
            defaultEdgeOptions={{
              type: 'clinical',
            }}
            proOptions={{ hideAttribution: true }}
          >
            {/* Dark Clinical Dot Grid Background */}
            <Background color="#1e293b" gap={24} size={1} />

            {/* React Flow Built-in Controls (Zoom in, Zoom out, Fit View, Lock) */}
            <Controls
              className="bg-[#101620] border border-[#1e293b] rounded-xl fill-slate-300 overflow-hidden shadow-card m-4"
              showInteractive={false}
            />

            {/* React Flow MiniMap */}
            <MiniMap
              nodeColor={(n) => {
                if (n.data?.node?.type === 'patient') return '#38bdf8';
                if (n.data?.node?.type === 'diagnosis') return '#2dd4bf';
                if (n.data?.node?.type === 'lab' || n.data?.node?.type === 'imaging') return '#a855f7';
                if (n.data?.node?.type === 'provider') return '#60a5fa';
                if (n.data?.node?.type === 'correction') return '#f59e0b';
                return '#475569';
              }}
              maskColor="rgba(8, 13, 20, 0.75)"
              className="bg-[#0b0f14] border border-[#1e293b] rounded-xl overflow-hidden shadow-card m-4"
            />
          </ReactFlow>
        </div>

        {/* RIGHT: NODE INSPECTOR DETAIL PANEL */}
        <div className="lg:col-span-4 rounded-2xl bg-[#101620] border border-[#1e293b] p-5 space-y-4 shadow-card">
          <div className="flex items-center justify-between pb-3 border-b border-[#1e293b]">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Info className="w-4 h-4 text-teal-400" />
              <span>Node Inspector</span>
            </span>
            <span className="text-[11px] font-mono text-slate-500">
              {selectedNode ? selectedNode.id : 'None selected'}
            </span>
          </div>

          {selectedNode ? (
            <div className="space-y-4 text-xs">
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-teal-400 font-mono">
                  {selectedNode.type}
                </span>
                <h3 className="text-base font-bold text-white leading-snug">
                  {selectedNode.label}
                </h3>
                {selectedNode.sublabel && (
                  <p className="text-xs text-slate-300 leading-relaxed pt-0.5">
                    {selectedNode.sublabel}
                  </p>
                )}
              </div>

              {/* Status and Date pills */}
              <div className="p-3 rounded-xl bg-[#141c29] border border-[#1e293b] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Status:</span>
                  <span
                    className={`font-semibold capitalize px-2 py-0.5 rounded-full text-[11px] border ${
                      selectedNode.status === 'superseded'
                        ? 'bg-amber-950 text-amber-300 border-amber-800'
                        : selectedNode.status === 'active'
                        ? 'bg-teal-950 text-teal-300 border-teal-800'
                        : 'bg-slate-800 text-slate-300 border-slate-700'
                    }`}
                  >
                    {selectedNode.status || 'Active'}
                  </span>
                </div>

                {selectedNode.date && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Timestamp:</span>
                    <span className="font-mono text-slate-200">{selectedNode.date}</span>
                  </div>
                )}
              </div>

              {/* Connected Relationships in Graph */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                  Connected Graph Relationships:
                </span>
                <div className="space-y-1.5">
                  {graphData.edges
                    .filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
                    .map((edge) => {
                      const otherNodeId = edge.source === selectedNode.id ? edge.target : edge.source;
                      const otherNode = graphData.nodes.find((n) => n.id === otherNodeId);
                      const isHighlighted = highlightedEdgeIds.has(edge.id);

                      return (
                        <div
                          key={edge.id}
                          className={`p-2.5 rounded-xl border text-[11px] space-y-1 ${
                            isHighlighted
                              ? 'bg-teal-950/30 border-teal-500/40 text-teal-200'
                              : 'bg-[#141c29] border-[#1e293b] text-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-[10px] text-teal-400">
                              [{edge.label}]
                            </span>
                            {isHighlighted && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30">
                                Agent Path
                              </span>
                            )}
                          </div>
                          <div className="text-slate-200 font-medium">
                            {edge.source === selectedNode.id ? '→ Pointing to: ' : '← Originating from: '}
                            <strong className="text-white">{otherNode?.label || otherNodeId}</strong>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-slate-500 text-xs">
              Click any node in the graph to inspect its properties and connected provenance edges.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Wrapper with ReactFlowProvider
export function ProvenanceGraphView(props: ProvenanceGraphViewProps) {
  return (
    <ReactFlowProvider>
      <ProvenanceGraphInner {...props} />
    </ReactFlowProvider>
  );
}

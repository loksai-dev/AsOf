'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import ReactFlow, {
  Background,
  Controls,
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
  Patient,
  ChatMessage,
  AgentResponse,
  ProvenancePath,
  GraphNode,
  GraphEdge,
  AuditStep,
} from '@/lib/types';
import { askAgent, getPath } from '@/lib/api';
import {
  Bot,
  Send,
  Sparkles,
  FileCode,
  ChevronDown,
  ChevronUp,
  User,
  Scale,
  RotateCcw,
  Clock,
  Database,
  Copy,
  Check,
  Play,
  Network,
  Activity,
  FileText,
  Scan,
  Stethoscope,
  CheckCircle2,
  AlertTriangle,
  Info,
  Maximize2,
  Terminal,
  Zap,
  HelpCircle,
  Share2,
} from 'lucide-react';

// =========================================================================
// 1. CUSTOM NODE COMPONENT FOR MINI PROVENANCE GRAPH
// =========================================================================
function MiniClinicalNode({ id, data, selected }: NodeProps) {
  const { node, isHighlighted, isDimmed, isCurrentReplay } = data as {
    node: GraphNode;
    isHighlighted: boolean;
    isDimmed: boolean;
    isCurrentReplay: boolean;
  };

  const getNodeStyle = () => {
    switch (node.type) {
      case 'patient':
        return {
          icon: <User className="w-3.5 h-3.5 text-sky-400" />,
          typeLabel: 'Patient',
          border: isCurrentReplay
            ? 'border-sky-300 ring-2 ring-sky-400'
            : isHighlighted
            ? 'border-sky-400 shadow-[0_0_15px_rgba(56,189,248,0.35)]'
            : 'border-sky-500/40',
          bg: 'bg-[#0c1828]',
          badge: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
        };
      case 'diagnosis':
        const isSuperseded = node.status === 'superseded';
        const isConflict = node.status === 'conflict';
        return {
          icon: (
            <Activity
              className={`w-3.5 h-3.5 ${
                isSuperseded ? 'text-amber-400' : 'text-teal-400'
              }`}
            />
          ),
          typeLabel: isSuperseded ? 'Diagnosis (Superseded)' : 'Diagnosis',
          border: isCurrentReplay
            ? 'border-teal-300 ring-2 ring-teal-400'
            : isSuperseded
            ? 'border-amber-500/60 shadow-glowAmber'
            : isConflict
            ? 'border-red-500/60 shadow-glowRed'
            : isHighlighted
            ? 'border-teal-400 shadow-glowTeal ring-1 ring-teal-400/50'
            : 'border-teal-500/40',
          bg: isSuperseded ? 'bg-[#241608]' : isConflict ? 'bg-[#280c10]' : 'bg-[#0a2320]',
          badge: isSuperseded
            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
            : 'bg-teal-500/15 text-teal-300 border-teal-500/30',
        };
      case 'lab':
      case 'imaging':
      case 'lab_imaging':
        return {
          icon:
            node.type === 'imaging' ? (
              <Scan className="w-3.5 h-3.5 text-purple-400" />
            ) : (
              <FileText className="w-3.5 h-3.5 text-purple-400" />
            ),
          typeLabel: node.type === 'imaging' ? 'Imaging Study' : 'Laboratory Assay',
          border: isCurrentReplay
            ? 'border-purple-300 ring-2 ring-purple-400'
            : isHighlighted
            ? 'border-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.35)]'
            : 'border-purple-500/40',
          bg: 'bg-[#1b102b]',
          badge: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
        };
      case 'provider':
        return {
          icon: <Stethoscope className="w-3.5 h-3.5 text-blue-400" />,
          typeLabel: 'Clinician',
          border: isCurrentReplay
            ? 'border-blue-300 ring-2 ring-blue-400'
            : isHighlighted
            ? 'border-blue-400 shadow-[0_0_15px_rgba(96,165,250,0.35)]'
            : 'border-blue-500/40',
          bg: 'bg-[#0d1d33]',
          badge: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
        };
      case 'correction':
        return {
          icon: <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />,
          typeLabel: 'Correction',
          border: isCurrentReplay
            ? 'border-amber-300 ring-2 ring-amber-400'
            : isHighlighted
            ? 'border-amber-400 shadow-glowAmber ring-1 ring-amber-400/50'
            : 'border-amber-500/50',
          bg: 'bg-[#291a08]',
          badge: 'bg-amber-500/25 text-amber-300 border-amber-500/40',
        };
      default:
        return {
          icon: <Activity className="w-3.5 h-3.5 text-slate-400" />,
          typeLabel: 'Node',
          border: 'border-slate-700',
          bg: 'bg-[#141c29]',
          badge: 'bg-slate-800 text-slate-300 border-slate-700',
        };
    }
  };

  const style = getNodeStyle();

  return (
    <div
      className={`relative min-w-[180px] max-w-[210px] rounded-xl border p-2.5 transition-all duration-300 shadow-card ${
        style.bg
      } ${style.border} ${
        isDimmed ? 'opacity-30 grayscale-[50%]' : 'opacity-100'
      } ${selected ? 'ring-2 ring-teal-400 scale-[1.03]' : ''}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-teal-400 !w-2 !h-2 !border-2 !border-[#0b0f14]"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-teal-400 !w-2 !h-2 !border-2 !border-[#0b0f14]"
      />

      <div className="flex items-center justify-between gap-1.5 pb-1 border-b border-white/10">
        <div className="flex items-center gap-1.5">
          {style.icon}
          <span
            className={`text-[9px] font-mono px-1.5 py-0.5 rounded border uppercase tracking-wider font-semibold ${style.badge}`}
          >
            {style.typeLabel}
          </span>
        </div>
        {node.status === 'superseded' && (
          <span className="text-[8px] font-mono font-bold px-1 rounded bg-amber-950 text-amber-300 border border-amber-800">
            RETRACTED
          </span>
        )}
      </div>

      <div className="pt-1.5 space-y-0.5">
        <h4
          className={`text-[11px] font-bold leading-tight ${
            node.status === 'superseded'
              ? 'line-through text-amber-200/80 decoration-amber-500/70'
              : 'text-white'
          }`}
        >
          {node.label}
        </h4>
        {node.sublabel && (
          <p className="text-[9px] text-slate-300 leading-snug line-clamp-2">
            {node.sublabel}
          </p>
        )}
        {node.date && (
          <div className="text-[9px] font-mono text-slate-400 pt-0.5">
            {node.date}
          </div>
        )}
      </div>
    </div>
  );
}

// =========================================================================
// 2. CUSTOM EDGE COMPONENT FOR MINI PROVENANCE GRAPH
// =========================================================================
function MiniClinicalEdge({
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

  const { label, isHighlighted, isDimmed, isCurrentReplay } = (data || {}) as {
    label: string;
    isHighlighted: boolean;
    isDimmed: boolean;
    isCurrentReplay: boolean;
  };

  const strokeColor = isCurrentReplay
    ? '#2dd4bf'
    : isHighlighted
    ? '#14b8a6'
    : '#334155';

  const strokeWidth = isCurrentReplay ? 3.5 : isHighlighted ? 2.5 : 1.2;

  return (
    <>
      <path
        id={id}
        className="react-flow__edge-path transition-all duration-300"
        d={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: strokeColor,
          strokeWidth,
          opacity: isDimmed ? 0.2 : 1,
          filter:
            isHighlighted || isCurrentReplay
              ? 'drop-shadow(0 0 6px rgba(20, 184, 166, 0.7))'
              : undefined,
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'none',
          }}
          className={`text-[8px] font-mono px-1.5 py-0.5 rounded border transition-all duration-200 ${
            isHighlighted || isCurrentReplay
              ? 'bg-teal-950/90 text-teal-200 border-teal-500/70 shadow-sm'
              : 'bg-[#0f172a]/90 text-slate-400 border-slate-700/60'
          } ${isDimmed ? 'opacity-20' : 'opacity-90'}`}
        >
          {label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const nodeTypes = {
  miniClinicalNode: MiniClinicalNode,
};

const edgeTypes = {
  miniClinicalEdge: MiniClinicalEdge,
};

// =========================================================================
// 3. CYPHER CODE BLOCK WITH SYNTAX HIGHLIGHTING & COPY BUTTON
// =========================================================================
function CypherCodeBlock({ cypher }: { cypher: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(cypher);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Format cypher lines with color highlights
  const formattedLines = cypher.split('\n').map((line, idx) => {
    // Highlight Cypher keywords
    const keywords = [
      'MATCH',
      'OPTIONAL MATCH',
      'WHERE',
      'RETURN',
      'AND',
      'OR',
      'NOT',
      'IS NULL',
      'IS NOT NULL',
      'ORDER BY',
      'LIMIT',
      'count',
      'collect',
      'datetime',
      'avg',
      'EXPLAIN',
      'CLASSIFY',
      'INTENT',
    ];

    let highlighted = line;
    keywords.forEach((kw) => {
      const reg = new RegExp(`\\b${kw}\\b`, 'g');
      highlighted = highlighted.replace(
        reg,
        `<span class="text-teal-400 font-bold">${kw}</span>`
      );
    });

    // Highlight labels (:Patient, :Diagnosis, etc.)
    highlighted = highlighted.replace(
      /:([A-Za-z0-9_]+)/g,
      ':<span class="text-cyan-300 font-semibold">$1</span>'
    );

    // Highlight relationships ([:HAS_EVENT], etc.)
    highlighted = highlighted.replace(
      /-\[:([A-Za-z0-9_]+)\]->/g,
      '-[:<span class="text-amber-300 font-semibold">$1</span>]->'
    );

    return (
      <div key={idx} className="table-row leading-relaxed">
        <span className="table-cell pr-3 select-none text-slate-600 text-[10px] text-right">
          {idx + 1}
        </span>
        <span
          className="table-cell"
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      </div>
    );
  });

  return (
    <div className="relative rounded-lg bg-[#05080c] border border-[#1e293b] overflow-hidden my-2 group">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#090e15] border-b border-[#1e293b]/70 text-[10px] font-mono text-slate-400">
        <span className="flex items-center gap-1.5 text-teal-300">
          <Terminal className="w-3 h-3 text-teal-400" />
          Cypher Query (Neo4j Bitemporal Traversal)
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#141c29] hover:bg-[#1e293b] text-slate-300 hover:text-white transition-colors"
          title="Copy Cypher to clipboard"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <div className="p-3 overflow-x-auto text-[11px] font-mono text-slate-300">
        <div className="table min-w-full">{formattedLines}</div>
      </div>
    </div>
  );
}

// =========================================================================
// 4. MINI PROVENANCE GRAPH INTERNAL CANVAS
// =========================================================================
interface MiniGraphCanvasProps {
  provenance: ProvenancePath;
  queryLabel?: string;
  onSelectNode: (node: GraphNode | null) => void;
  selectedNode: GraphNode | null;
}

function MiniGraphCanvas({
  provenance,
  queryLabel,
  onSelectNode,
  selectedNode,
}: MiniGraphCanvasProps) {
  const { fitView } = useReactFlow();
  const [replayActive, setReplayActive] = useState(false);
  const [replayStep, setReplayStep] = useState<number>(-1);

  // Auto-fit view when provenance path changes
  useEffect(() => {
    const timer = setTimeout(() => {
      fitView({ padding: 0.22, duration: 500 });
    }, 100);
    return () => clearTimeout(timer);
  }, [provenance, fitView]);

  // Replay reasoning animation effect (600ms delay per edge)
  useEffect(() => {
    if (!replayActive) return;

    if (replayStep >= provenance.highlightedEdgeIds.length) {
      setReplayActive(false);
      setReplayStep(-1);
      return;
    }

    const timer = setTimeout(() => {
      setReplayStep((prev) => prev + 1);
    }, 600);

    return () => clearTimeout(timer);
  }, [replayActive, replayStep, provenance.highlightedEdgeIds.length]);

  const handleStartReplay = () => {
    setReplayStep(0);
    setReplayActive(true);
  };

  const handleResetReplay = () => {
    setReplayActive(false);
    setReplayStep(-1);
    fitView({ padding: 0.22, duration: 400 });
  };

  // Active highlighted edges during replay or standard view
  const currentHighlightedIds = useMemo(() => {
    if (!replayActive || replayStep < 0) {
      return new Set(provenance.highlightedEdgeIds);
    }
    return new Set(provenance.highlightedEdgeIds.slice(0, replayStep + 1));
  }, [replayActive, replayStep, provenance.highlightedEdgeIds]);

  const activeReplayEdgeId =
    replayActive && replayStep >= 0 && replayStep < provenance.highlightedEdgeIds.length
      ? provenance.highlightedEdgeIds[replayStep]
      : null;

  // Transform nodes for React Flow
  const flowNodes: Node[] = useMemo(() => {
    return provenance.nodes.map((n) => {
      const isIncident = provenance.edges.some(
        (e) =>
          currentHighlightedIds.has(e.id) &&
          (e.source === n.id || e.target === n.id)
      );
      const isHighlighted =
        isIncident ||
        (provenance.highlightedEdgeIds.length === 0 && true);
      const isDimmed =
        currentHighlightedIds.size > 0 && !isIncident;

      return {
        id: n.id,
        type: 'miniClinicalNode',
        position: { x: n.x || 100, y: n.y || 100 },
        data: {
          node: n,
          isHighlighted,
          isDimmed,
          isCurrentReplay: false,
        },
        selected: selectedNode?.id === n.id,
      };
    });
  }, [provenance, currentHighlightedIds, selectedNode]);

  // Transform edges for React Flow
  const flowEdges: Edge[] = useMemo(() => {
    return provenance.edges.map((e) => {
      const isHighlighted = currentHighlightedIds.has(e.id);
      const isCurrentReplay = activeReplayEdgeId === e.id;
      const isDimmed = currentHighlightedIds.size > 0 && !isHighlighted;

      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'miniClinicalEdge',
        data: {
          label: e.label,
          isHighlighted,
          isDimmed,
          isCurrentReplay,
        },
      };
    });
  }, [provenance, currentHighlightedIds, activeReplayEdgeId]);

  return (
    <div className="relative w-full h-full flex flex-col bg-[#070b10] overflow-hidden">
      {/* Mini Graph Header */}
      <div className="px-4 py-3 bg-[#0d131c] border-b border-[#1e293b] flex items-center justify-between shrink-0 z-10">
        <div>
          <div className="flex items-center gap-2">
            <Network className="w-4 h-4 text-teal-400" />
            <h3 className="text-xs font-bold text-white tracking-wide">
              Answer Provenance Subgraph
            </h3>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-teal-950 text-teal-300 border border-teal-800">
              {provenance.nodes.length} nodes • {provenance.edges.length} edges
            </span>
          </div>
          <p className="text-[10px] text-slate-400 truncate max-w-sm mt-0.5">
            {queryLabel || 'Current response reasoning traversal path'}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={handleStartReplay}
            disabled={replayActive || provenance.highlightedEdgeIds.length === 0}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/40 text-[11px] font-medium transition-colors disabled:opacity-40"
            title="Animate reasoning path edge-by-edge (600ms)"
          >
            <Play className={`w-3 h-3 ${replayActive ? 'animate-spin' : ''}`} />
            <span>{replayActive ? `Step ${replayStep + 1}` : 'Replay Path'}</span>
          </button>
          <button
            onClick={() => fitView({ padding: 0.22, duration: 400 })}
            className="p-1 rounded-lg bg-[#141c29] border border-[#1e293b] text-slate-300 hover:text-white hover:border-slate-700 transition-colors"
            title="Fit graph view"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* React Flow Canvas */}
      <div className="flex-1 w-full h-full relative">
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeClick={(_, node) => {
            const rawNode = provenance.nodes.find((n) => n.id === node.id);
            onSelectNode(rawNode || null);
          }}
          onPaneClick={() => onSelectNode(null)}
          fitView
          fitViewOptions={{ padding: 0.22 }}
          minZoom={0.2}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#1e293b" gap={18} size={1} />
          <Controls
            className="!bg-[#101620] !border-[#1e293b] !rounded-xl overflow-hidden [&>button]:!bg-[#141c29] [&>button]:!border-[#1e293b] [&>button]:!text-slate-300"
            showInteractive={false}
          />
        </ReactFlow>

        {/* Selected Node Details Card (Bottom Overlay) */}
        {selectedNode && (
          <div className="absolute bottom-3 left-3 right-3 p-3 rounded-xl bg-[#0e141f]/95 border border-teal-500/40 backdrop-blur-md shadow-2xl z-20 animate-in fade-in slide-in-from-bottom-2 text-xs">
            <div className="flex items-center justify-between border-b border-white/10 pb-1.5 mb-1.5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[9px] uppercase px-1.5 py-0.5 rounded bg-teal-950 text-teal-300 border border-teal-800">
                  {selectedNode.type}
                </span>
                <span className="font-bold text-white truncate">
                  {selectedNode.label}
                </span>
              </div>
              <button
                onClick={() => onSelectNode(null)}
                className="text-slate-400 hover:text-white text-xs px-1"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300 font-mono">
              {selectedNode.sublabel && (
                <div className="col-span-2 text-slate-200 font-sans">
                  {selectedNode.sublabel}
                </div>
              )}
              {selectedNode.date && (
                <div>
                  <span className="text-slate-500">Date:</span> {selectedNode.date}
                </div>
              )}
              {selectedNode.status && (
                <div>
                  <span className="text-slate-500">Status:</span>{' '}
                  <span
                    className={
                      selectedNode.status === 'superseded'
                        ? 'text-amber-400 font-bold'
                        : 'text-teal-400'
                    }
                  >
                    {selectedNode.status.toUpperCase()}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Mini Legend Footer */}
      <div className="px-4 py-2 bg-[#090d14] border-t border-[#1e293b]/70 flex items-center justify-between text-[10px] text-slate-400 shrink-0">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-sky-400" /> Patient
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-teal-400" /> Diagnosis
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-purple-400" /> Lab
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-400" /> Provider
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-400" /> Correction
          </span>
        </div>
        <div className="flex items-center gap-1 text-teal-400 font-mono">
          <span className="w-2 h-0.5 bg-teal-400" /> Agent reasoning path
        </div>
      </div>
    </div>
  );
}

// Wrapper for React Flow Context
function MiniProvenanceGraph(props: MiniGraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <MiniGraphCanvas {...props} />
    </ReactFlowProvider>
  );
}

// =========================================================================
// 5. MAIN AGENT CHAT VIEW COMPONENT
// =========================================================================
interface AgentChatViewProps {
  activePatient: Patient;
  viewMode: 'doctor' | 'patient';
  initialPrompt?: string;
}

export function AgentChatView({
  activePatient,
  viewMode: _viewMode,
  initialPrompt,
}: AgentChatViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);

  // Active answer selected for right-side mini provenance graph
  const [selectedResponse, setSelectedResponse] = useState<AgentResponse | null>(null);
  const [currentQueryTitle, setCurrentQueryTitle] = useState<string>('');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  // Expanded audit trace IDs
  const [expandedTraceIds, setExpandedTraceIds] = useState<Record<string, boolean>>({});

  // Base fallback graph
  const [baseGraph, setBaseGraph] = useState<ProvenancePath>({
    nodes: [],
    edges: [],
    highlightedEdgeIds: [],
  });

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const streamTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Exact 3 suggested chips specified by the user prompt
  const suggestedChips = [
    'Why do these two diagnoses differ?',
    'What did Hospital A know on Jan 3?',
    'Which diagnosis relied on a corrected lab?',
  ];

  // Load initial baseline graph
  useEffect(() => {
    getPath(activePatient.id).then((p) => {
      setBaseGraph(p);
    });
  }, [activePatient.id]);

  // Initialize or reset chat on patient change
  useEffect(() => {
    // Clear any active streaming
    if (streamTimerRef.current) {
      clearInterval(streamTimerRef.current);
    }

    const welcomeMsg: ChatMessage = {
      id: 'msg-welcome',
      role: 'assistant',
      content: `Hello, I am the **AsOf Clinical Provenance Agent**. I have loaded the bitemporal EHR knowledge graph for **${activePatient.name}** (${activePatient.mrn}).\n\nI can trace diagnostic lineages across hospitals, audit system awareness at point-in-time dates, and explain contradictions between competing provider diagnoses with complete Cypher execution traces.\n\nUse the suggested chips above or type a clinical question below to begin.`,
      timestamp: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    setMessages([welcomeMsg]);
    setSelectedResponse(null);
    setCurrentQueryTitle(`Initial Knowledge Graph: ${activePatient.name}`);
    setStreamingMsgId(null);

    if (initialPrompt) {
      handleSendMessage(initialPrompt);
    }
  }, [activePatient.id]);

  // Scroll to bottom on new messages or streaming tokens
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, streamingMsgId]);

  // Toggle collapsible audit trace
  const toggleTrace = (msgId: string) => {
    setExpandedTraceIds((prev) => ({
      ...prev,
      [msgId]: !prev[msgId],
    }));
  };

  // Execute agent query with streaming token simulation
  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || inputText).trim();
    if (!query || isLoading) return;

    const userMessage: ChatMessage = {
      id: `usr-${Date.now()}`,
      role: 'user',
      content: query,
      timestamp: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);
    setCurrentQueryTitle(query);

    try {
      // 1. Call askAgent from /lib/api.ts
      const response: AgentResponse = await askAgent(activePatient.id, query);

      // 2. Initialize streaming assistant message
      const asstId = `asst-${Date.now()}`;
      const assistantMessage: ChatMessage = {
        id: asstId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setStreamingMsgId(asstId);
      setIsLoading(false);

      // 3. Stream response tokens smoothly
      const fullAnswer = response.answer;
      // Split into words and tokens
      const words = fullAnswer.split(/(\s+)/);
      let currentIndex = 0;
      let accumulatedText = '';

      if (streamTimerRef.current) {
        clearInterval(streamTimerRef.current);
      }

      streamTimerRef.current = setInterval(() => {
        if (currentIndex < words.length) {
          accumulatedText += words[currentIndex];
          currentIndex++;

          setMessages((prev) =>
            prev.map((m) =>
              m.id === asstId ? { ...m, content: accumulatedText } : m
            )
          );
        } else {
          // Streaming finished
          if (streamTimerRef.current) {
            clearInterval(streamTimerRef.current);
            streamTimerRef.current = null;
          }

          setMessages((prev) =>
            prev.map((m) =>
              m.id === asstId
                ? {
                    ...m,
                    content: fullAnswer,
                    agentResponse: response,
                  }
                : m
            )
          );

          setStreamingMsgId(null);
          setSelectedResponse(response);
          // Auto-expand audit trace for this new response so user sees it
          setExpandedTraceIds((prev) => ({ ...prev, [asstId]: true }));
        }
      }, 16);
    } catch {
      setIsLoading(false);
      setStreamingMsgId(null);
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content:
          'An error occurred while executing the bitemporal graph query. Please try again.',
        timestamp: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    }
  };

  // Determine active provenance graph for the right pane
  const activeProvenanceGraph = useMemo<ProvenancePath>(() => {
    if (selectedResponse?.provenancePath) {
      return selectedResponse.provenancePath;
    }
    return baseGraph;
  }, [selectedResponse, baseGraph]);

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-8.5rem)] rounded-2xl bg-[#0b0f14] border border-[#1e293b] overflow-hidden shadow-2xl">
      {/* ================================================================= */}
      {/* LEFT COLUMN: CHAT INTERFACE WITH STREAMING & COLLAPSIBLE AUDIT TRACE */}
      {/* ================================================================= */}
      <div className="w-full lg:w-[58%] flex flex-col h-full border-b lg:border-b-0 lg:border-r border-[#1e293b]/80 bg-[#0b0f14]">
        {/* Chat Header */}
        <div className="px-5 py-3.5 bg-[#101620] border-b border-[#1e293b] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400 shadow-glowTeal">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white tracking-tight">
                  AsOf Clinical Provenance Agent
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-teal-950 text-teal-300 border border-teal-800 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
                  Streaming Reasoner
                </span>
              </div>
              <div className="text-[11px] text-slate-400">
                Patient: <span className="text-slate-200 font-semibold">{activePatient.name}</span> ({activePatient.mrn}) • Neo4j Cypher Traversal
              </div>
            </div>
          </div>

          <button
            onClick={() => {
              if (streamTimerRef.current) clearInterval(streamTimerRef.current);
              setMessages([
                {
                  id: 'msg-reset',
                  role: 'assistant',
                  content: `Session reset for **${activePatient.name}**. Knowledge graph ready. How can I help?`,
                  timestamp: new Date().toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                },
              ]);
              setSelectedResponse(null);
              setCurrentQueryTitle(`Session reset: ${activePatient.name}`);
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#141c29] border border-[#1e293b] text-xs text-slate-300 hover:text-white hover:border-slate-700 transition-colors"
            title="Reset conversation"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reset</span>
          </button>
        </div>

        {/* Suggested Chips Bar (Requested in Prompt 5) */}
        <div className="px-5 py-2.5 bg-[#0e141e] border-b border-[#1e293b]/70 flex items-center gap-2 overflow-x-auto shrink-0">
          <span className="text-[10px] uppercase font-bold text-slate-400 shrink-0 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-teal-400" />
            Suggested:
          </span>
          {suggestedChips.map((chip, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(chip)}
              disabled={isLoading || streamingMsgId !== null}
              className="px-3 py-1 rounded-full bg-[#141c29] hover:bg-[#192435] text-slate-300 hover:text-teal-300 border border-[#1e293b] hover:border-teal-500/50 text-xs whitespace-nowrap transition-all shrink-0 disabled:opacity-40 flex items-center gap-1.5 shadow-sm group"
            >
              <span className="text-teal-400 group-hover:scale-110 transition-transform">
                ✦
              </span>
              <span>{chip}</span>
            </button>
          ))}
        </div>

        {/* Messages Scroll Area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            const resp = msg.agentResponse;
            const isStreamingThis = streamingMsgId === msg.id;
            const isTraceExpanded = !!expandedTraceIds[msg.id];
            const isCurrentVisualized = selectedResponse === resp && !!resp;

            return (
              <div
                key={msg.id}
                className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div className="w-7 h-7 rounded-xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400 shrink-0 mt-1">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                )}

                <div
                  className={`max-w-2xl rounded-2xl p-4 space-y-3 shadow-card ${
                    isUser
                      ? 'bg-teal-500/15 border border-teal-500/30 text-teal-50'
                      : 'bg-[#101620] border border-[#1e293b] text-slate-200'
                  }`}
                >
                  {/* Message Header */}
                  <div className="flex items-center justify-between gap-3 text-[11px] text-slate-400 border-b border-[#1e293b]/60 pb-1.5">
                    <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                      {isUser ? (
                        'You (Clinician)'
                      ) : (
                        <>
                          <span>AsOf Clinical Reasoning Agent</span>
                          {isCurrentVisualized && (
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-full bg-teal-950 text-teal-300 border border-teal-800">
                              Active Provenance
                            </span>
                          )}
                        </>
                      )}
                    </span>
                    <span className="font-mono text-slate-400 text-[10px]">
                      {msg.timestamp}
                    </span>
                  </div>

                  {/* Message Content with Streaming Blinking Cursor */}
                  <div className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap space-y-2 text-slate-200">
                    {msg.content}
                    {isStreamingThis && (
                      <span className="inline-block w-2 h-4 ml-1 bg-teal-400 animate-pulse align-middle" />
                    )}
                  </div>

                  {/* Bayesian Probability breakdown */}
                  {resp?.conflictingHypotheses && (
                    <div className="pt-2 border-t border-[#1e293b]/60 space-y-1.5">
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                        Diagnostic Probability Distribution
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {resp.conflictingHypotheses.map((hyp, i) => (
                          <div
                            key={i}
                            className="px-2.5 py-1 rounded-lg bg-[#141c29] border border-[#1e293b] flex items-center gap-2 text-xs"
                          >
                            <span className="font-medium text-slate-200">
                              {hyp.diagnosis}
                            </span>
                            <span className="font-mono font-bold text-teal-400 bg-teal-950 px-1.5 py-0.5 rounded border border-teal-800 text-[11px]">
                              {Math.round(hyp.probability * 100)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Objective Evidence Cited */}
                  {resp?.evidenceCited && resp.evidenceCited.length > 0 && (
                    <div className="pt-2 border-t border-[#1e293b]/60 space-y-1.5">
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1.5">
                        <Scale className="w-3 h-3 text-teal-400" />
                        Objective Evidence Cited ({resp.evidenceCited.length})
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {resp.evidenceCited.map((ev) => (
                          <div
                            key={ev.id}
                            className="p-2 rounded-lg bg-[#141c29] border border-[#1e293b] text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-white truncate text-[11px]">
                                {ev.label}
                              </span>
                              <span className="text-[10px] font-mono text-teal-400 shrink-0">
                                {ev.date}
                              </span>
                            </div>
                            {ev.value && (
                              <div className="text-teal-300 font-mono text-[10px]">
                                {ev.value}
                              </div>
                            )}
                            {ev.interpretation && (
                              <p className="text-[10px] text-slate-400 leading-tight">
                                {ev.interpretation}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ======================================================= */}
                  {/* COLLAPSIBLE AUDIT TRACE (Requested in Prompt 5)        */}
                  {/* Under each assistant message: tool name, Cypher code   */}
                  {/* block, row count, latency in order.                    */}
                  {/* ======================================================= */}
                  {resp && resp.auditSteps && resp.auditSteps.length > 0 && (
                    <div className="pt-2 border-t border-[#1e293b]/80">
                      <div className="flex items-center justify-between gap-2">
                        <button
                          onClick={() => toggleTrace(msg.id)}
                          className="flex items-center gap-2 text-xs font-mono text-teal-300 hover:text-teal-200 transition-colors py-1 group"
                        >
                          <span className="flex items-center gap-1.5 font-bold">
                            <FileCode className="w-3.5 h-3.5 text-teal-400" />
                            Audit trace ({resp.auditSteps.length} tool calls)
                          </span>
                          <span className="text-[10px] text-slate-400 font-sans">
                            •{' '}
                            {resp.auditSteps
                              .reduce((acc, s) => acc + s.latencyMs, 0)
                              .toFixed(1)}{' '}
                            ms total
                          </span>
                          {isTraceExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5 text-teal-400 group-hover:-translate-y-0.5 transition-transform" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 text-teal-400 group-hover:translate-y-0.5 transition-transform" />
                          )}
                        </button>

                        <button
                          onClick={() => {
                            setSelectedResponse(resp);
                            setCurrentQueryTitle(
                              messages.find(
                                (m, idx) =>
                                  idx > 0 &&
                                  messages[idx - 1].role === 'user' &&
                                  m.id === msg.id
                              )?.content || 'Inspected Answer'
                            );
                          }}
                          className={`text-[10px] font-mono px-2 py-0.5 rounded-lg border transition-colors flex items-center gap-1 ${
                            isCurrentVisualized
                              ? 'bg-teal-950 text-teal-300 border-teal-700'
                              : 'bg-[#141c29] text-slate-300 border-[#1e293b] hover:text-white'
                          }`}
                          title="View this answer's provenance graph on the right"
                        >
                          <Network className="w-3 h-3 text-teal-400" />
                          <span>Show Provenance</span>
                        </button>
                      </div>

                      {/* Collapsible Content */}
                      {isTraceExpanded && (
                        <div className="mt-2.5 space-y-3 p-3.5 rounded-xl bg-[#080d14] border border-[#1e293b] animate-in fade-in">
                          <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase tracking-wider font-mono font-bold border-b border-[#1e293b] pb-1.5">
                            <span className="flex items-center gap-1 text-slate-300">
                              <Terminal className="w-3 h-3 text-teal-400" />
                              Executed Tool Calls in Order
                            </span>
                            <span>{resp.auditSteps.length} Steps Traversed</span>
                          </div>

                          {/* List of tool calls in exact order */}
                          <div className="space-y-3">
                            {resp.auditSteps.map((step: AuditStep, idx: number) => (
                              <div
                                key={idx}
                                className="p-3 rounded-lg bg-[#0d141e] border border-[#1e293b] space-y-2 text-xs"
                              >
                                {/* Tool Name, Row Count, Latency */}
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-md bg-teal-950 border border-teal-800 text-teal-300 font-mono text-[10px] font-bold flex items-center justify-center">
                                      #{idx + 1}
                                    </span>
                                    <span className="font-mono font-bold text-teal-300 text-xs">
                                      {step.tool}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                    {/* Row Count */}
                                    <span className="px-2 py-0.5 rounded bg-[#141c29] border border-[#1e293b] text-slate-300 font-mono text-[10px] flex items-center gap-1">
                                      <Database className="w-3 h-3 text-cyan-400" />
                                      <span>{step.rows} {step.rows === 1 ? 'row' : 'rows'}</span>
                                    </span>

                                    {/* Latency */}
                                    <span className="px-2 py-0.5 rounded bg-[#141c29] border border-[#1e293b] text-teal-300 font-mono text-[10px] flex items-center gap-1">
                                      <Clock className="w-3 h-3 text-teal-400" />
                                      <span>{step.latencyMs} ms</span>
                                    </span>
                                  </div>
                                </div>

                                {/* Plain-English explanation */}
                                {step.explanation && (
                                  <div className="text-[11px] text-slate-400 font-sans leading-relaxed">
                                    {step.explanation}
                                  </div>
                                )}

                                {/* Cypher in a Code Block */}
                                <CypherCodeBlock cypher={step.cypher} />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {isUser && (
                  <div className="w-7 h-7 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0 mt-1">
                    <User className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            );
          })}

          {/* Loading indicator while waiting for query */}
          {isLoading && (
            <div className="flex gap-3 items-start">
              <div className="w-7 h-7 rounded-xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400 shrink-0 animate-pulse">
                <Bot className="w-3.5 h-3.5" />
              </div>
              <div className="rounded-2xl p-3.5 bg-[#101620] border border-[#1e293b] flex items-center gap-2.5 text-xs text-teal-300 shadow-card">
                <Sparkles className="w-4 h-4 text-teal-400 animate-spin" />
                <span>Traversing bitemporal knowledge graph & executing Cypher...</span>
              </div>
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        {/* Message Input Box */}
        <div className="p-4 bg-[#101620] border-t border-[#1e293b] shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              placeholder={`Ask AsOf about ${activePatient.name}'s diagnosis provenance, point-in-time state, or conflicts...`}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={isLoading || streamingMsgId !== null}
              className="flex-1 px-4 py-2.5 rounded-xl bg-[#141c29] border border-[#1e293b] text-xs sm:text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-teal-500/60 shadow-inner"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isLoading || streamingMsgId !== null}
              className="px-4 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 disabled:opacity-40 text-slate-950 font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-all shadow-glowTeal shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </button>
          </form>
        </div>
      </div>

      {/* ================================================================= */}
      {/* RIGHT COLUMN: MINI PROVENANCE GRAPH FOR CURRENT ANSWER             */}
      {/* (Requested in Prompt 5)                                          */}
      {/* ================================================================= */}
      <div className="w-full lg:w-[42%] flex flex-col h-full bg-[#070b10]">
        <MiniProvenanceGraph
          provenance={activeProvenanceGraph}
          queryLabel={currentQueryTitle}
          onSelectNode={setSelectedNode}
          selectedNode={selectedNode}
        />
      </div>
    </div>
  );
}

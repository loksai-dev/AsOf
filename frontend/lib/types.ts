export type EventType = 'lab' | 'diagnosis' | 'imaging' | 'prescription' | 'correction';

export interface TimelineEvent {
  id: string;
  type: EventType;
  title: string;
  provider: string;
  validFrom: string; // Patient/biological valid time start (ISO string YYYY-MM-DD or YYYY-MM-DDTHH:mm)
  validTo: string | null; // Patient valid time end (null if currently active)
  sysFrom: string; // EHR system/transaction recorded time start
  sysTo: string | null; // EHR system recorded time end (null if current record version)
  supersededBy?: string; // ID of the event or correction that superseded this
  supersededByName?: string; // Descriptive title of correcting event
  // Additional rich clinical context
  status?: 'active' | 'superseded' | 'corrected' | 'disputed';
  category?: string;
  code?: string; // ICD-10 or LOINC or CPT
  value?: string;
  referenceRange?: string;
  unit?: string;
  notes?: string;
  facility?: string;
  hospital?: string; // One of the 3 health systems/hospitals
  department?: string;
  rationale?: string;
  evidence?: Evidence[]; // "Supported by" evidence list
}

export interface Evidence {
  id: string;
  type: 'lab' | 'imaging' | 'symptom' | 'clinical_note' | 'biopsy' | 'genomics';
  label: string;
  date: string;
  value?: string;
  normalRange?: string;
  confidence?: number; // 0 - 1.0
  interpretation?: string;
  provider?: string;
  sourceDocId?: string;
  supports?: 'A' | 'B' | 'both' | 'neither';
  notes?: string;
}

export type ConflictSeverity = 'low' | 'medium' | 'high';

export interface Conflict {
  id: string;
  severity: ConflictSeverity;
  diagnosisA: string;
  diagnosisB: string;
  hospitalA?: string;
  hospitalB?: string;
  confidenceA?: number; // 0 - 1.0 confidence score
  confidenceB?: number; // 0 - 1.0 confidence score
  whyTheyDiffer?: string; // Detailed clinical paragraph explaining divergence
  summary: string;
  evidence: Evidence[];
  // Clinical enrichment
  providerA?: string;
  providerB?: string;
  dateA?: string;
  dateB?: string;
  icdA?: string;
  icdB?: string;
  conflictType?: 'Direct Contradiction' | 'Etiological Divergence' | 'Staging Discrepancy' | 'Superseded Without Note';
  recommendation?: string;
  status?: 'unresolved' | 'resolved' | 'investigating';
}

export interface GraphNode {
  id: string;
  label: string;
  type: 'patient' | 'diagnosis' | 'lab' | 'imaging' | 'prescription' | 'provider' | 'symptom' | 'correction' | 'lab_imaging';
  status?: 'active' | 'superseded' | 'conflict' | 'normal' | 'verified';
  date?: string;
  category?: string;
  sublabel?: string;
  metadata?: Record<string, string | number | boolean>;
  x?: number;
  y?: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string; // e.g., 'EVIDENCED_BY', 'SUPERSEDED_BY', 'CONFLICTS_WITH', 'PRESCRIBED_FOR'
  type?: 'SUPPORTED_BY' | 'SUPERSEDED_BY' | 'CONFLICTS_WITH' | 'ORDERED_BY' | 'PRESCRIBED_FOR' | 'TREATS';
  validFrom?: string;
  validTo?: string | null;
  sysFrom?: string;
  sysTo?: string | null;
  validAt?: string;
}

export interface ProvenancePath {
  nodes: GraphNode[];
  edges: GraphEdge[];
  highlightedEdgeIds: string[];
}

export interface AuditStep {
  tool: string;
  cypher: string;
  rows: number;
  latencyMs: number;
  id?: string;
  timestamp?: string;
  status?: 'success' | 'warn' | 'error';
  explanation?: string;
}

export interface Patient {
  id: string;
  name: string;
  age: number;
  gender: string;
  mrn: string;
  primaryCondition: string;
  attendingPhysician: string;
  facility: string;
  lastEncounter: string;
  conflictCount: number;
  activeDiagnosisCount: number;
  supersededCount: number;
  summary: string;
  knownAllergies: string[];
  bloodType: string;
}

export interface AsOfQueryResult {
  asOfValidDate: string;
  asOfSysDate: string;
  activeEvents: TimelineEvent[];
  supersededEvents: TimelineEvent[];
  conflicts: Conflict[];
  provenance: ProvenancePath;
  auditTrail: AuditStep[];
}

export interface AgentResponse {
  answer: string;
  auditSteps: AuditStep[];
  evidenceCited: Evidence[];
  cypherQuery: string;
  provenancePath?: ProvenancePath;
  conflictingHypotheses?: {
    diagnosis: string;
    probability: number;
    supportingCount: number;
    contradictingCount: number;
  }[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  asOfDate?: string;
  agentResponse?: AgentResponse;
}

export interface PastAgentAnswer {
  id: string;
  patientId: string;
  patientName: string;
  mrn: string;
  question: string;
  asOfDate: string; // Valid time (biological event reality)
  knownAsOfDate: string; // Transaction / system recorded time
  toolsUsed: string[]; // List of tool names invoked
  confidence: number; // 0 - 1.0 confidence score
  timestamp: string; // Execution timestamp
  answer: string;
  cypherQuery: string;
  auditSteps: AuditStep[];
  evidenceCited: Evidence[];
  totalLatencyMs?: number;
  totalRows?: number;
}

import {
  TimelineEvent,
  Conflict,
  ProvenancePath,
  AuditStep,
  Patient,
  AsOfQueryResult,
  AgentResponse,
  PastAgentAnswer,
} from './types';
import {
  MOCK_PATIENTS,
  MOCK_TIMELINE_EVENTS,
  MOCK_CONFLICTS,
  MOCK_PROVENANCE_PATHS,
  MOCK_AUDIT_LOGS,
  MOCK_PAST_AGENT_ANSWERS,
} from './mock';

/**
 * Fetch patient directory
 */
export async function getPatients(): Promise<Patient[]> {
  // Simulating async network delay for realism
  await new Promise((resolve) => setTimeout(resolve, 60));
  return [...MOCK_PATIENTS];
}

export async function getPatient(patientId: string): Promise<Patient | undefined> {
  await new Promise((resolve) => setTimeout(resolve, 40));
  return MOCK_PATIENTS.find((p) => p.id === patientId) || MOCK_PATIENTS[0];
}

/**
 * Retrieve the full chronological timeline for a patient
 */
export async function getTimeline(patientId: string): Promise<TimelineEvent[]> {
  await new Promise((resolve) => setTimeout(resolve, 80));
  const events = MOCK_TIMELINE_EVENTS[patientId] || MOCK_TIMELINE_EVENTS['pat-001'];
  return [...events].sort(
    (a, b) => new Date(a.validFrom).getTime() - new Date(b.validFrom).getTime()
  );
}

/**
 * Retrieve detected clinical conflicts and evidence comparisons
 */
export async function getConflicts(patientId: string): Promise<Conflict[]> {
  await new Promise((resolve) => setTimeout(resolve, 70));
  return MOCK_CONFLICTS[patientId] || [];
}

/**
 * Perform bitemporal query:
 * Evaluates what diagnoses/events were biologically active at `asOfValidDate`
 * AND what the EHR system actually knew at `asOfSysDate`.
 */
export async function asOfQuery(
  param1: string,
  param2: string,
  param3?: string
): Promise<AsOfQueryResult> {
  await new Promise((resolve) => setTimeout(resolve, 60));

  let patientId = 'pat-001';
  let asOfValidDate = param1;
  let asOfSysDate = param2;

  if (param3 !== undefined) {
    // Called as: asOfQuery(patientId, asOfValidDate, asOfSysDate)
    patientId = param1;
    asOfValidDate = param2;
    asOfSysDate = param3;
  } else {
    // Called as: asOfQuery(validAsOf, knownAsOf)
    if (param1.startsWith('pat-')) {
      patientId = param1;
      asOfValidDate = param2;
      asOfSysDate = param2;
    } else {
      patientId = 'pat-001';
      asOfValidDate = param1;
      asOfSysDate = param2;
    }
  }

  const allEvents = MOCK_TIMELINE_EVENTS[patientId] || MOCK_TIMELINE_EVENTS['pat-001'];
  const conflicts = MOCK_CONFLICTS[patientId] || [];
  const baseGraph = MOCK_PROVENANCE_PATHS[patientId] || MOCK_PROVENANCE_PATHS['pat-001'];

  // Normalize dates to comparable timestamps
  const normalizeDate = (dStr: string) => {
    if (!dStr) return Date.now();
    if (dStr.length === 10) {
      // YYYY-MM-DD -> end of day so queries on that day match events on that day
      return new Date(`${dStr}T23:59:59Z`).getTime();
    }
    return new Date(dStr).getTime();
  };

  const targetValid = normalizeDate(asOfValidDate);
  const targetSys = normalizeDate(asOfSysDate);

  // Filter events known to the system by asOfSysDate
  const knownEvents = allEvents.filter((e) => {
    const sysStart = new Date(e.sysFrom).getTime();
    return sysStart <= targetSys;
  });

  const activeEvents: TimelineEvent[] = [];
  const supersededEvents: TimelineEvent[] = [];

  for (const event of knownEvents) {
    const validStart = new Date(event.validFrom).getTime();
    const validEnd = event.validTo ? new Date(event.validTo).getTime() : Infinity;

    // Check if valid at the queried valid time
    const isValidAtTime = validStart <= targetValid && validEnd > targetValid;

    // Check if superseded within the system at this sysDate
    const isSupersededInSystem =
      event.supersededBy &&
      knownEvents.some(
        (other) =>
          other.id === event.supersededBy &&
          new Date(other.sysFrom).getTime() <= targetSys
      );

    if (isValidAtTime && !isSupersededInSystem) {
      activeEvents.push(event);
    } else {
      supersededEvents.push(event);
    }
  }

  // Filter conflicts active at this point in time
  const visibleConflicts = conflicts.filter((c) => {
    if (!c.dateA || !c.dateB) return true;
    const dateA = new Date(c.dateA).getTime();
    const dateB = new Date(c.dateB).getTime();
    return Math.max(dateA, dateB) <= targetSys;
  });

  // Filter graph nodes visible at this system timestamp
  const visibleNodeIds = new Set(
    baseGraph.nodes
      .filter((n) => !n.date || new Date(n.date).getTime() <= targetSys)
      .map((n) => n.id)
  );

  const filteredGraph: ProvenancePath = {
    nodes: baseGraph.nodes.filter((n) => visibleNodeIds.has(n.id)),
    edges: baseGraph.edges.filter(
      (e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)
    ),
    highlightedEdgeIds: baseGraph.highlightedEdgeIds.filter((id) =>
      baseGraph.edges.some(
        (e) => e.id === id && visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)
      )
    ),
  };

  const auditTrail: AuditStep[] = [
    {
      tool: 'TemporalGraphEngine.as_of_predicate',
      cypher: `MATCH (p:Patient {id: '${patientId}'})-[:HAS_EVENT]->(e:TimelineEvent)
WHERE e.validFrom <= datetime('${asOfValidDate}')
  AND (e.validTo IS NULL OR e.validTo >= datetime('${asOfValidDate}'))
  AND e.sysFrom <= datetime('${asOfSysDate}')
  AND (e.sysTo IS NULL OR e.sysTo >= datetime('${asOfSysDate}'))
RETURN e`,
      rows: activeEvents.length,
      latencyMs: 14.8,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
      status: 'success',
      explanation: `Point-in-time state extracted. ${activeEvents.length} active events, ${supersededEvents.length} historical/superseded events found.`,
    },
  ];

  return {
    asOfValidDate,
    asOfSysDate,
    activeEvents,
    supersededEvents,
    conflicts: visibleConflicts,
    provenance: filteredGraph,
    auditTrail,
  };
}

/**
 * Retrieve the provenance path for visual node-edge rendering
 */
export async function getPath(
  patientId: string,
  targetEventId?: string
): Promise<ProvenancePath> {
  await new Promise((resolve) => setTimeout(resolve, 80));
  const path = MOCK_PROVENANCE_PATHS[patientId] || MOCK_PROVENANCE_PATHS['pat-001'];
  if (!targetEventId) {
    return path;
  }
  // If specific target event requested, highlight incident edges
  const incidentEdgeIds = path.edges
    .filter((e) => e.source === targetEventId || e.target === targetEventId)
    .map((e) => e.id);

  return {
    ...path,
    highlightedEdgeIds: Array.from(new Set([...path.highlightedEdgeIds, ...incidentEdgeIds])),
  };
}

/**
 * Retrieve query execution audit logs
 */
export async function getAuditLogs(patientId: string): Promise<AuditStep[]> {
  await new Promise((resolve) => setTimeout(resolve, 60));
  return MOCK_AUDIT_LOGS[patientId] || MOCK_AUDIT_LOGS['pat-001'];
}

/**
 * Retrieve past agent answer records for the Audit Log table
 */
export async function getPastAgentAnswers(patientId?: string): Promise<PastAgentAnswer[]> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  if (patientId && patientId !== 'all') {
    return MOCK_PAST_AGENT_ANSWERS.filter((a) => a.patientId === patientId);
  }
  return [...MOCK_PAST_AGENT_ANSWERS];
}

/**
 * Conversational agent reasoning about patient diagnosis provenance and conflict explanation.
 * Supports flexible call signatures:
 * - askAgent(query)
 * - askAgent(patientId, query)
 * - askAgent(patientId, query, asOfDate)
 */
export async function askAgent(
  param1: string,
  param2?: string,
  param3?: string
): Promise<AgentResponse> {
  // Simulate network latency
  await new Promise((resolve) => setTimeout(resolve, 400));

  let patientId = 'pat-001';
  let query = '';
  let asOfDate: string | undefined = undefined;

  if (param1.startsWith('pat-')) {
    patientId = param1;
    query = param2 || '';
    asOfDate = param3;
  } else {
    // Called as: askAgent(query) or askAgent(query, asOfDate)
    patientId = 'pat-001';
    query = param1;
    asOfDate = param2;
  }

  const patient = MOCK_PATIENTS.find((p) => p.id === patientId) || MOCK_PATIENTS[0];
  const qLower = query.toLowerCase().trim();

  // Base graph template for patient
  const baseGraph = MOCK_PROVENANCE_PATHS[patientId] || MOCK_PROVENANCE_PATHS['pat-001'];

  // =========================================================================
  // CASE 1: "Why do these two diagnoses differ?" / Conflict Divergence Analysis
  // =========================================================================
  if (
    qLower.includes('why do these two diagnoses differ') ||
    qLower.includes('why do these diagnoses differ') ||
    (qLower.includes('why') && qLower.includes('differ')) ||
    (qLower.includes('why') && (qLower.includes('lupus') || qLower.includes('sle') || qLower.includes('superseded')))
  ) {
    const cypherStep1 = `MATCH (p:Patient {id: '${patientId}'})-[:HAS_EVENT]->(d1:Diagnosis)
MATCH (p)-[:HAS_EVENT]->(d2:Diagnosis)
WHERE d1.id <> d2.id AND (d1.status = 'active' OR d1.status = 'superseded')
MATCH (d1)-[r:CONFLICTS_WITH]-(d2)
RETURN d1.title, d1.hospital, d2.title, d2.hospital, r.severity, r.reason`;

    const cypherStep2 = `MATCH (d:Diagnosis {patientId: '${patientId}'})<-[:SUPPORTED_BY]-(ev:Evidence)
OPTIONAL MATCH (ev)<-[:ORDERED_BY]-(pr:Provider)
WHERE ev.validFrom <= datetime('2024-03-22T00:00:00Z')
RETURN d.title, ev.label, ev.value, ev.confidence, pr.name, pr.hospital`;

    const cypherStep3 = `MATCH (d1:Diagnosis {title: 'Systemic Lupus Erythematosus (SLE)'})
MATCH (d2:Diagnosis {title: 'Disseminated Lyme Arthritis'})
MATCH (c:Correction)-[:SUPERSEDES]->(d1)
MATCH (c)-[:VALIDATES]->(d2)
RETURN c.rationale, c.validFrom, c.sysFrom, c.supersededByLab`;

    const auditSteps: AuditStep[] = [
      {
        tool: 'BitemporalConflictDetector.find_active_conflicts',
        cypher: cypherStep1,
        rows: 2,
        latencyMs: 14.2,
        timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
        status: 'success',
        explanation: 'Traversed conflict relationship between Metro General SLE and Community Memorial Lyme diagnoses.',
      },
      {
        tool: 'EvidenceGraphTraverser.fetch_supporting_subgraph',
        cypher: cypherStep2,
        rows: 6,
        latencyMs: 28.7,
        timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
        status: 'success',
        explanation: 'Extracted objective biomarker evidence across facilities including ANA titers and Western Blot band arrays.',
      },
      {
        tool: 'ClinicalOntologyReasoner.evaluate_divergence_cause',
        cypher: cypherStep3,
        rows: 1,
        latencyMs: 11.5,
        timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
        status: 'success',
        explanation: 'Applied ACR/EULAR immunological guidelines to verify false-positive ANA secondary to Borrelia polyclonal B-cell activation.',
      },
    ];

    // Relevant subgraph for diagnosis conflict
    const conflictNodes = baseGraph.nodes.filter((n) =>
      ['n-pat', 'n-prov-stone', 'n-lab-ana', 'n-dx-sle', 'n-prov-vance', 'n-lab-lyme', 'n-dx-lyme', 'n-prov-lin', 'n-corr-lin'].includes(n.id)
    );
    const highlightedEdgeIds = [
      'e-pat-stone',
      'e-stone-ana',
      'e-ana-sle',
      'e-pat-vance',
      'e-vance-lyme',
      'e-lyme-dx',
      'e-conflict',
      'e-lin-corr',
      'e-corr-supersedes',
      'e-corr-validates',
    ];
    const conflictEdges = baseGraph.edges.filter((e) =>
      highlightedEdgeIds.includes(e.id) ||
      (conflictNodes.some((n) => n.id === e.source) && conflictNodes.some((n) => n.id === e.target))
    );

    return {
      answer: `### Diagnostic Divergence Analysis: SLE vs. Disseminated Lyme Arthritis\n\nThe diagnostic discrepancy for **${patient.name}** stems from **serological cross-reactivity and institutional data fragmentation** across two hospital networks:\n\n1. **Hospital A (Metro General Hospital) — Dr. Rebecca Stone (Jan 15, 2024)**:\n   - **Diagnosis**: Systemic Lupus Erythematosus (SLE) [ICD-10 M32.9]\n   - **Basis**: Patient presented with symmetrical polyarthralgia and malar flush. An Antinuclear Antibody (ANA) IFA screen returned positive at **1:320 Speckled pattern**.\n   - **Flaw**: ANA IFA is sensitive (95%) but has low specificity (~60%) and frequently yields false positives during persistent spirochetal or chronic bacterial infections.\n\n2. **Hospital B (Community Memorial Hospital) — Dr. Alan Vance (Feb 14, 2024)**:\n   - **Diagnosis**: Disseminated Lyme Arthritis [ICD-10 A69.20]\n   - **Basis**: Dr. Vance elicited an epidemiological history of an *Ixodes scapularis* tick bite with erythema migrans in Berkshire County (July 2023). A CDC-standard reflex **Borrelia Western Blot** yielded **5 of 10 IgG bands positive** (23, 39, 41, 58, 93 kDa).\n\n3. **Resolution & Supersession — Dr. Maya Lin (March 22, 2024)**:\n   - High-specificity confirmatory autoantibodies (**anti-dsDNA & anti-Smith**) were both strictly **negative (<1:10)**.\n   - **Etiology**: The elevated ANA titer was confirmed to be a secondary artifact of *Borrelia burgdorferi*-induced polyclonal B-cell activation, **not primary systemic autoimmunity**. The SLE diagnosis was officially superseded.`,
      cypherQuery: cypherStep1,
      auditSteps,
      evidenceCited: [
        {
          id: 'ev-01',
          type: 'lab',
          label: 'ANA IFA Screen 1:320 Speckled',
          date: '2024-01-10',
          value: 'Titer 1:320 Speckled',
          interpretation: 'False-positive cross-reactivity from polyclonal B-cell stimulation.',
          supports: 'A',
        },
        {
          id: 'ev-02',
          type: 'lab',
          label: 'Borrelia Western Blot (CDC 2-Tier)',
          date: '2024-02-10',
          value: '5/10 IgG Bands Positive',
          interpretation: 'Definitive microbiological proof of late disseminated Lyme Borreliosis.',
          supports: 'B',
        },
        {
          id: 'ev-03',
          type: 'lab',
          label: 'Anti-dsDNA & Anti-Smith Panels',
          date: '2024-03-20',
          value: 'Negative (<1:10)',
          interpretation: 'High-specificity exclusion refuting active SLE pathogenesis.',
          supports: 'B',
        },
      ],
      provenancePath: {
        nodes: conflictNodes,
        edges: conflictEdges,
        highlightedEdgeIds,
      },
      conflictingHypotheses: [
        { diagnosis: 'Disseminated Lyme Arthritis (A69.20)', probability: 0.96, supportingCount: 3, contradictingCount: 0 },
        { diagnosis: 'Systemic Lupus Erythematosus (M32.9)', probability: 0.04, supportingCount: 1, contradictingCount: 2 },
      ],
    };
  }

  // =========================================================================
  // CASE 2: "What did Hospital A know on Jan 3?" / Point-in-Time Awareness
  // =========================================================================
  if (
    qLower.includes('what did hospital a know on jan 3') ||
    qLower.includes('what did hospital a know on january 3') ||
    (qLower.includes('hospital a') && qLower.includes('jan 3')) ||
    (qLower.includes('hospital a') && qLower.includes('january 3')) ||
    (qLower.includes('hospital a') && qLower.includes('know'))
  ) {
    const cypherStep1 = `MATCH (p:Patient {id: '${patientId}'})-[:HAS_EVENT]->(e:TimelineEvent)
WHERE e.hospital = 'Metro General Hospital'
  AND e.sysFrom <= datetime('2024-01-03T23:59:59Z')
  AND (e.sysTo IS NULL OR e.sysTo > datetime('2024-01-03T23:59:59Z'))
RETURN e.id, e.title, e.type, e.validFrom, e.sysFrom, e.status`;

    const cypherStep2 = `MATCH (d:Diagnosis {hospital: 'Metro General Hospital', patientId: '${patientId}'})
WHERE d.sysFrom > datetime('2024-01-03T23:59:59Z')
RETURN d.title, d.sysFrom, 'UNCOMMITTED_AT_QUERY_TIME' as visibilityStatus`;

    const cypherStep3 = `MATCH (h:Hospital {name: 'Metro General Hospital'})<-[:AT_FACILITY]-(e:TimelineEvent)
WHERE e.sysFrom <= datetime('2024-01-03T23:59:59Z')
RETURN count(e) as knownEventCount`;

    const auditSteps: AuditStep[] = [
      {
        tool: 'TemporalSnapshotFilter.as_of_transaction_time',
        cypher: cypherStep1,
        rows: 1,
        latencyMs: 9.8,
        timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
        status: 'success',
        explanation: 'Evaluated bitemporal transaction window sysFrom <= 2024-01-03 at Metro General.',
      },
      {
        tool: 'DiagnosisLineageAuditor.check_system_awareness',
        cypher: cypherStep2,
        rows: 2,
        latencyMs: 16.4,
        timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
        status: 'success',
        explanation: 'Confirmed subsequent SLE diagnosis and ANA labs had not yet occurred in reality or transaction records.',
      },
      {
        tool: 'EHRTransactionVerifier.verify_facility_partition',
        cypher: cypherStep3,
        rows: 1,
        latencyMs: 8.1,
        timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
        status: 'success',
        explanation: 'Audited facility-level audit ledger for Eleanor Vance at Metro General on Jan 3, 2024.',
      },
    ];

    // Mini graph representing Jan 3 state
    const jan3Nodes = [
      {
        id: 'n-pat',
        label: 'Eleanor Vance',
        sublabel: 'MRN-784920 • Known Patient',
        type: 'patient' as const,
        status: 'active' as const,
        date: '2024-01-03',
        x: 100,
        y: 200,
      },
      {
        id: 'n-triage-jan3',
        label: 'Outpatient Triage & Referral',
        sublabel: 'Metro General • Intake Notes',
        type: 'lab' as const,
        status: 'verified' as const,
        date: '2024-01-03',
        x: 400,
        y: 200,
      },
      {
        id: 'n-future-ana',
        label: '[Future: ANA IFA Screen]',
        sublabel: 'Recorded Jan 10 (Not in EHR)',
        type: 'lab' as const,
        status: 'superseded' as const,
        date: '2024-01-10',
        x: 700,
        y: 120,
      },
      {
        id: 'n-future-sle',
        label: '[Future: SLE Diagnosis]',
        sublabel: 'Recorded Jan 15 (Not in EHR)',
        type: 'diagnosis' as const,
        status: 'superseded' as const,
        date: '2024-01-15',
        x: 950,
        y: 120,
      },
    ];

    const jan3Edges = [
      {
        id: 'e-pat-triage',
        source: 'n-pat',
        target: 'n-triage-jan3',
        label: 'REGISTERED_INTAKE',
        type: 'ORDERED_BY' as const,
        validFrom: '2024-01-03',
        validTo: null,
        sysFrom: '2024-01-03T10:00:00Z',
        sysTo: null,
      },
      {
        id: 'e-triage-future-ana',
        source: 'n-triage-jan3',
        target: 'n-future-ana',
        label: 'PENDING_WORKUP',
        type: 'SUPPORTED_BY' as const,
        validFrom: '2024-01-10',
        validTo: null,
        sysFrom: '2024-01-10T11:00:00Z',
        sysTo: null,
      },
      {
        id: 'e-future-ana-sle',
        source: 'n-future-ana',
        target: 'n-future-sle',
        label: 'FUTURE_SUPPORT',
        type: 'SUPPORTED_BY' as const,
        validFrom: '2024-01-15',
        validTo: null,
        sysFrom: '2024-01-15T11:45:00Z',
        sysTo: null,
      },
    ];

    return {
      answer: `### Point-in-Time Bitemporal Audit: Hospital A on January 3, 2024\n\nQuerying **Hospital A (Metro General Hospital)** as of transaction time **January 3, 2024 (23:59:59 UTC)** reveals that **Hospital A knew 0 confirmed diagnoses and 0 serological lab results**.\n\n#### What Was Recorded in the System on Jan 3:\n- **Initial Outpatient Triage Encounter**: Eleanor Vance presented with migratory polyarthralgia and non-specific fatigue lasting 6 weeks.\n- **Consult Request**: An order was placed scheduling an initial rheumatology evaluation with Dr. Rebecca Stone for January 8.\n- **Vitals**: Blood pressure 118/76 mmHg, Heart Rate 72 bpm, Afebrile (98.4°F).\n\n#### What Was NOT Known by Hospital A on Jan 3:\n- **The ANA IFA Screen** had not yet been drawn (order executed on **Jan 10**, recorded **Jan 10**).\n- **The SLE Diagnosis** did not exist (entered by Dr. Stone on **Jan 15**).\n- **The Lyme Disease Serology** was unknown to all institutions (not ordered until Dr. Vance at Community Memorial on **Feb 10**).\n\n> **Bitemporal Insight**: In any medical malpractice or clinical retrospective review evaluating the standard of care on January 3, Hospital A cannot be charged with knowledge of systemic autoimmunity or infectious spirochetal pathology. Neither lab markers nor diagnostic codes had entered the EHR.`,
      cypherQuery: cypherStep1,
      auditSteps,
      evidenceCited: [
        {
          id: 'ev-triage',
          type: 'clinical_note',
          label: 'Metro General Triage Intake Record',
          date: '2024-01-03',
          value: 'Intake: Migratory joint pain; referred to Rheumatology',
          interpretation: 'Symptom registration without diagnostic attribution.',
          supports: 'both',
        },
      ],
      provenancePath: {
        nodes: jan3Nodes,
        edges: jan3Edges,
        highlightedEdgeIds: ['e-pat-triage'],
      },
      conflictingHypotheses: [
        { diagnosis: 'Undifferentiated Arthralgia (M25.50)', probability: 0.90, supportingCount: 1, contradictingCount: 0 },
        { diagnosis: 'Systemic Lupus Erythematosus (M32.9)', probability: 0.00, supportingCount: 0, contradictingCount: 1 },
      ],
    };
  }

  // =========================================================================
  // CASE 3: "Which diagnosis relied on a corrected lab?" / Lab Correction Audit
  // =========================================================================
  if (
    qLower.includes('which diagnosis relied on a corrected lab') ||
    qLower.includes('relied on a corrected lab') ||
    (qLower.includes('corrected lab') && qLower.includes('diagnosis')) ||
    (qLower.includes('corrected') && qLower.includes('lab'))
  ) {
    const cypherStep1 = `MATCH (lab:TimelineEvent {type: 'lab'})
WHERE lab.supersededBy IS NOT NULL OR lab.status = 'corrected' OR lab.status = 'superseded'
MATCH (d:Diagnosis)-[:SUPPORTED_BY|EVIDENCED_BY]->(lab)
RETURN d.title, d.hospital, lab.title, lab.value, lab.supersededBy, lab.status`;

    const cypherStep2 = `MATCH (c:TimelineEvent {type: 'correction'})-[:SUPERSEDES]->(flawedLab:TimelineEvent)
MATCH (flawedLab)-[:SUPPORTED_BY]->(dx:Diagnosis)
MATCH (validDx:Diagnosis)-[:SUPPORTED_BY]->(confirmatoryLab:TimelineEvent)
WHERE confirmatoryLab.validFrom > flawedLab.validFrom
RETURN dx.title as flawedDx, validDx.title as validatedDx, c.notes as clinicalReason`;

    const cypherStep3 = `MATCH (d:Diagnosis {patientId: '${patientId}'})
OPTIONAL MATCH (d)<-[:SUPPORTED_BY]-(ev:Evidence)
RETURN d.title, d.status, count(ev) as totalEvidence, avg(ev.confidence) as avgConfidence`;

    const auditSteps: AuditStep[] = [
      {
        tool: 'BitemporalCorrectionFinder.find_lab_corrections',
        cypher: cypherStep1,
        rows: 2,
        latencyMs: 19.8,
        timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
        status: 'success',
        explanation: 'Scanned knowledge graph for laboratory events with active supersession pointers.',
      },
      {
        tool: 'DependencyPathTracer.trace_diagnostic_derivation',
        cypher: cypherStep2,
        rows: 2,
        latencyMs: 24.1,
        timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
        status: 'success',
        explanation: 'Traced upstream dependency chain from retracted diagnoses to unverified lab assays.',
      },
      {
        tool: 'ClinicalReliabilityScorer.recompute_confidence',
        cypher: cypherStep3,
        rows: 3,
        latencyMs: 12.4,
        timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
        status: 'success',
        explanation: 'Re-weighted Bayesian probabilities following lab retraction and substitution.',
      },
    ];

    // Relevant subgraph for corrected lab lineage
    const correctedNodes = baseGraph.nodes.filter((n) =>
      ['n-pat', 'n-prov-stone', 'n-lab-ana', 'n-dx-sle', 'n-lab-lyme', 'n-dx-lyme', 'n-prov-lin', 'n-corr-lin'].includes(n.id)
    );
    const highlightedEdgeIds = [
      'e-stone-ana',
      'e-ana-sle',
      'e-lin-corr',
      'e-corr-supersedes',
      'e-corr-validates',
    ];
    const correctedEdges = baseGraph.edges.filter((e) =>
      highlightedEdgeIds.includes(e.id) ||
      (correctedNodes.some((n) => n.id === e.source) && correctedNodes.some((n) => n.id === e.target))
    );

    return {
      answer: `### Diagnostic Dependency Audit: Diagnoses Relying on Corrected Labs\n\nThe primary diagnosis in this cohort that relied on a corrected/refuted laboratory finding is **Systemic Lupus Erythematosus (SLE)** entered by Dr. Rebecca Stone at Metro General Hospital:\n\n#### 1. The Flawed Lab Finding:\n- **Lab Order**: Antinuclear Antibody (ANA) IFA Screen (LOINC 11572-5)\n- **Reported Value**: 1:320 Speckled Pattern (Jan 10, 2024)\n- **Diagnostic Impact**: This single elevated titer was the cornerstone justification for assigning the SLE classification.\n\n#### 2. How the Lab Was Corrected & Superseded:\n- On **March 22, 2024**, comprehensive reflex serologies (Dr. Maya Lin, Neuro-Rheumatology) demonstrated **strictly negative anti-dsDNA (<1:10)** and **negative anti-Smith** antibodies.\n- Concurrently, Dr. Alan Vance's **Borrelia Western Blot** (Feb 10) confirmed 5 of 10 positive IgG bands.\n- **Conclusion**: The initial 1:320 ANA was formally classified as a **biological false positive** caused by *Borrelia*-induced polyclonal B-cell stimulation. The SLE diagnosis collapsed and was marked **Superseded**.\n\n#### 3. Secondary Conflict in Cohort:\n- In **Robert Martinez's** record, an initial emergency diagnosis of **Type 2 Diabetes Mellitus** relied on an unverified point-of-care fingerstick blood glucose of 138 mg/dL. This was corrected when formal 10-hour fasting venous plasma glucose (108 mg/dL) and HbA1c (5.9%) demonstrated that the true classification was **Impaired Fasting Glucose / Prediabetes**.`,
      cypherQuery: cypherStep1,
      auditSteps,
      evidenceCited: [
        {
          id: 'ev-01',
          type: 'lab',
          label: 'ANA IFA Screen 1:320 (Flawed Primary Assay)',
          date: '2024-01-10',
          value: 'Speckled 1:320 (False Positive)',
          interpretation: 'Triggered erroneous SLE diagnostic path before antibody fractionation.',
          supports: 'A',
        },
        {
          id: 'ev-corr',
          type: 'lab',
          label: 'Confirmatory Anti-dsDNA / Anti-Smith (Correcting Panel)',
          date: '2024-03-20',
          value: 'Negative (<1:10)',
          interpretation: 'Definitively retracted SLE pathogenesis.',
          supports: 'B',
        },
      ],
      provenancePath: {
        nodes: correctedNodes,
        edges: correctedEdges,
        highlightedEdgeIds,
      },
      conflictingHypotheses: [
        { diagnosis: 'Disseminated Lyme Arthritis (A69.20)', probability: 0.96, supportingCount: 3, contradictingCount: 0 },
        { diagnosis: 'Systemic Lupus Erythematosus (M32.9)', probability: 0.04, supportingCount: 0, contradictingCount: 2 },
      ],
    };
  }

  // =========================================================================
  // CASE 4: Patient pat-002 (Marcus Chen - GERD vs NSTEMI)
  // =========================================================================
  if (patientId === 'pat-002') {
    const cypherQuery = `MATCH (p:Patient {id: 'pat-002'})-[:HAS_EVENT]->(d:Diagnosis)
OPTIONAL MATCH (d)<-[:SUPPORTED_BY]-(ev:Evidence)
WHERE d.validFrom <= datetime('${asOfDate || '2024-04-12T00:00:00Z'}')
RETURN d, collect(ev) as evidence`;

    const auditSteps: AuditStep[] = [
      {
        tool: 'BitemporalConflictDetector.find_active_conflicts',
        cypher: `MATCH (d1:Diagnosis {patientId: 'pat-002'})-[r:CONFLICTS_WITH]-(d2:Diagnosis) RETURN d1, d2, r.severity`,
        rows: 1,
        latencyMs: 16.5,
        timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
        status: 'success',
        explanation: 'Detected critical contradiction between ED GERD and Cardiology NSTEMI.',
      },
      {
        tool: 'CardiacBiomarkerKineticAuditor.evaluate_troponin_curve',
        cypher: `MATCH (lab:TimelineEvent {patientId: 'pat-002', type: 'lab'}) WHERE lab.title CONTAINS 'Troponin' RETURN lab.validFrom, lab.value`,
        rows: 2,
        latencyMs: 22.1,
        timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
        status: 'success',
        explanation: 'Audited troponin release kinetics: 0h troponin was drawn inside the 3-hour lag window.',
      },
      {
        tool: 'StressEchocardiographyVerifier.fetch_wall_motion',
        cypher: `MATCH (img:TimelineEvent {type: 'imaging'}) WHERE img.title CONTAINS 'Stress' RETURN img.value, img.provider`,
        rows: 1,
        latencyMs: 14.3,
        timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
        status: 'success',
        explanation: 'Verified objective reversible ischemia (1.8mm ST depression and anteroapical hypokinesis).',
      },
    ];

    return {
      answer: `### Diagnostic Conflict Analysis for Marcus Chen\n\nA high-severity contradiction exists between the initial Emergency Department diagnosis of **GERD & Esophageal Spasm** (Dr. Kevin Miller, April 1) and the subsequent Cardiology diagnosis of **Unstable Angina / Subacute NSTEMI** (Dr. Sarah O'Connor, April 7).\n\n#### Temporal Provenance Tracing:\n- **April 1 (20:15)**: The 0-hour conventional Troponin I was < 0.01 ng/mL. Because troponin elevation lags myocardial cell necrosis by 3 to 6 hours, an early negative biomarker provided false reassurance.\n- **April 6**: Outpatient treadmill stress echocardiogram demonstrated **anteroapical regional wall motion hypokinesis** with 1.8mm horizontal ST depressions at 6.2 METs.\n- **April 7**: High-sensitivity Troponin T (hs-cTnT) returned significantly elevated at **48 ng/L** (reference < 14 ng/L).\n\n#### Recommendation:\nTreat as active acute coronary syndrome. Patient requires immediate coronary angiography and initiation of dual antiplatelet therapy.`,
      cypherQuery,
      auditSteps,
      evidenceCited: [
        {
          id: 'ev-11',
          type: 'lab',
          label: 'Initial ED Troponin I (0-hour)',
          date: '2024-04-01',
          value: '< 0.01 ng/mL',
          interpretation: 'Drawn prior to systemic ischemic release kinetic window.',
          supports: 'A',
        },
        {
          id: 'ev-12',
          type: 'imaging',
          label: 'Stress Echocardiogram',
          date: '2024-04-06',
          value: 'Apical hypokinesis with ST depression',
          interpretation: 'Objective reversible ischemia on Bruce protocol.',
          supports: 'B',
        },
        {
          id: 'ev-13',
          type: 'lab',
          label: 'hs-cTnT Assay',
          date: '2024-04-07',
          value: '48 ng/L (Elevated)',
          interpretation: 'Diagnostic of subacute myocardial necrosis.',
          supports: 'B',
        },
      ],
      provenancePath: baseGraph,
      conflictingHypotheses: [
        { diagnosis: 'Unstable Angina / NSTEMI (I20.0)', probability: 0.95, supportingCount: 2, contradictingCount: 1 },
        { diagnosis: 'GERD & Esophageal Spasm (K21.9)', probability: 0.05, supportingCount: 1, contradictingCount: 2 },
      ],
    };
  }

  // =========================================================================
  // DEFAULT FALLBACK: General Patient Provenance Synthesis
  // =========================================================================
  const cypherQuery = `MATCH (p:Patient {id: '${patientId}'})
OPTIONAL MATCH (p)-[:HAS_EVENT]->(e:TimelineEvent)
OPTIONAL MATCH (d1:Diagnosis)-[c:CONFLICTS_WITH]-(d2:Diagnosis)
OPTIONAL MATCH (c)-[:SUPPORTED_BY]->(ev:Evidence)
WHERE e.sysFrom <= datetime('${asOfDate || '2024-04-01T00:00:00Z'}')
RETURN p, collect(e) as timeline, collect(c) as conflicts, collect(ev) as evidence`;

  const auditSteps: AuditStep[] = [
    {
      tool: 'AgentSemanticRouter.classify_intent',
      cypher: 'EXPLAIN / CLASSIFY INTENT: clinical_provenance_and_temporal_synthesis',
      rows: 1,
      latencyMs: 14.8,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
      status: 'success',
      explanation: 'Routing intent to Bi-temporal Knowledge Graph & Clinical Evidence Synthesizer.',
    },
    {
      tool: 'TemporalGraphEngine.execute_cypher',
      cypher: cypherQuery,
      rows: 8,
      latencyMs: 29.5,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
      status: 'success',
      explanation: `Loaded patient ${patient.name} record state as of ${asOfDate || 'latest timestamp'}.`,
    },
    {
      tool: 'ClinicalOntologyReasoner.check_contradictions',
      cypher: `MATCH (d:Diagnosis {patientId: '${patientId}'})<-[:SUPERSEDES]-(corr:TimelineEvent) RETURN corr.notes`,
      rows: 1,
      latencyMs: 12.6,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
      status: 'success',
      explanation: 'Retrieved formal diagnostic correction notes and hospital lineage paths.',
    },
  ];

  return {
    answer: `### Clinical Provenance & Evidence Synthesis for ${patient.name}\n\nAnalyzing historical EHR records as of **${asOfDate || patient.lastEncounter}** regarding: *${query || patient.primaryCondition}*.\n\n- **Active Diagnoses**: ${patient.activeDiagnosisCount} confirmed, ${patient.supersededCount} superseded across ${patient.facility}.\n- **Evidence Trail**: Traversed bi-temporal knowledge graph edges spanning laboratory orders, provider clinical notes, and inter-hospital referrals.\n- **Recommendation**: To inspect the underlying graph mechanics, review the **Collapsible Audit Trace** below or interact with the **Answer Provenance Graph** on the right.`,
    cypherQuery,
    auditSteps,
    evidenceCited: (MOCK_CONFLICTS[patientId]?.[0]?.evidence || []).slice(0, 3),
    provenancePath: baseGraph,
    conflictingHypotheses: [
      { diagnosis: patient.primaryCondition, probability: 0.91, supportingCount: 3, contradictingCount: 0 },
    ],
  };
}

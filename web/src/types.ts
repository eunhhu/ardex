export type ProjectSummary = {
  id: string;
  name: string;
  path: string;
  defaultWorkflow: string;
  archivedAt: string | null;
};

export type AgentActivity = {
  state: "running" | "idle";
  lastSeenAt: string;
  staleSeconds: number;
};

export type Statement = {
  project: { id: string; alias: string; path: string; name: string };
  session: SessionSummary | null;
  currentTask: CurrentTaskSummary | null;
  scale: { latestReportId: string | null; maxWeight: number | null; blockingFindings: number; nextSplitRequired: boolean };
  visualScenario: unknown;
  subagents: {
    required: boolean;
    reason: string | null;
    instruction: string | null;
    pending: Array<{ id: string; alias: string; title: string; owner: string; role: string; status: string; priority: number; estimatedWeight: number | null }>;
  };
  blockers: string[];
  nextExpectedAction: string | null;
};

export type CurrentTaskSummary = {
  id: string;
  alias: string;
  title: string;
  progress: number;
  qualityGate: string;
  owner: string;
  status: string;
  runtimeSeconds: number;
};

export type SessionSummary = {
  id: string;
  status: string;
  goal: string | null;
  mode: string;
  model: string | null;
  currentTaskId: string | null;
  currentTaskRef: string | null;
  runtimeSeconds: number;
  lastSeenAt: string;
  agent: AgentActivity;
  nextExpectedAction: string | null;
};

export type TaskSummary = {
  id: string;
  title: string;
  status: string;
  progress: number;
  priority: number;
  importance: number;
  owner: string;
  qualityGate: string;
  estimatedWeight: number | null;
  contextRisk: number | null;
  startedAt: string | null;
  pausedAt: string | null;
  resumedAt: string | null;
  activeSeconds: number;
  runtimeSeconds: number;
  pauseReason: string | null;
  checklistPassed: boolean;
};

export type OutputSummary = {
  id: string;
  type: string;
  status: string;
  taskRef: string | null;
  summary: string;
  path: string | null;
  url: string | null;
  previewUrl: string | null;
  renderableImage: boolean;
  visualScenario: boolean;
  prompt: string | null;
  reviewComment: string | null;
  needsApproval: boolean;
  createdAt: string;
};

export type EvidenceSummary = {
  id: string;
  type: string;
  status: string;
  targetType: string;
  targetRef: string | null;
  summary: string;
  payload: Record<string, unknown>;
  media: OutputSummary | null;
  createdAt: string;
};

export type AskSummary = {
  id: string;
  status: string;
  question: string;
  answer: string | null;
  answerSource: string | null;
  attachments: string[];
  createdAt: string;
  answeredAt: string | null;
};

export type ScaleReportSummary = {
  estimate: {
    id: string;
    targetType: string;
    targetId: string | null;
    weight: number;
    complexity: string;
    contextRisk: number;
    modularityRisk: number;
    recommendedAgent: string;
    recommendedSplit: Record<string, unknown> | null;
    basis: string;
    createdAt: string;
  };
  findings: Array<{
    id: string;
    path: string;
    lineCount: number;
    byteCount: number;
    role: string;
    severity: string;
    reason: string;
    recommendation: string;
    waivedAt: string | null;
    waiverStale: boolean;
  }>;
  blocked: boolean;
};

export type DashboardSnapshot = {
  generatedAt: string;
  project: ProjectSummary | null;
  projects: ProjectSummary[];
  statement: Statement | null;
  sessions: SessionSummary[];
  tasks: TaskSummary[];
  evidence: EvidenceSummary[];
  outputs: OutputSummary[];
  asks: AskSummary[];
  scale: {
    latest: ScaleReportSummary | null;
    reports: ScaleReportSummary["estimate"][];
  };
};

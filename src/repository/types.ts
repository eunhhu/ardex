export type Project = {
  id: string;
  alias: string;
  path: string;
  name: string;
  codexProjectKey: string | null;
  defaultWorkflow: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Session = {
  id: string;
  alias: string;
  projectId: string;
  threadId: string | null;
  status: string;
  previousStatus: string | null;
  currentTaskId: string | null;
  goal: string | null;
  mode: string;
  model: string | null;
  nextExpectedAction: string | null;
  startedAt: string;
  lastSeenAt: string;
  endedAt: string | null;
  runtimeSeconds: number;
};

export type AgentActivity = {
  state: "running" | "idle";
  lastSeenAt: string;
  staleSeconds: number;
};

export type Task = {
  id: string;
  alias: string;
  projectId: string;
  sessionId: string | null;
  featureId: string | null;
  title: string;
  content: string;
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
  pauseReason: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type TaskEvent = {
  id: string;
  alias: string;
  projectId: string;
  sessionId: string | null;
  taskId: string | null;
  taskAlias: string;
  type: string;
  summary: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type Evidence = {
  id: string;
  alias: string;
  projectId: string;
  sessionId: string | null;
  targetType: string;
  targetId: string | null;
  type: string;
  status: string;
  summary: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type Ask = {
  id: string;
  alias: string;
  projectId: string;
  sessionId: string | null;
  question: string;
  answer: string | null;
  answerSource: string | null;
  attachments: string[];
  status: string;
  createdAt: string;
  answeredAt: string | null;
};

export type ScaleEstimate = {
  id: string;
  alias: string;
  projectId: string;
  sessionId: string | null;
  targetType: string;
  targetId: string | null;
  weight: number;
  complexity: string;
  contextRisk: number;
  modularityRisk: number;
  recommendedAgent: string;
  recommendedSplit: Record<string, unknown> | null;
  basis: string;
  createdBy: string;
  createdAt: string;
};

export type FileScaleFinding = {
  id: string;
  alias: string;
  projectId: string;
  path: string;
  lineCount: number;
  byteCount: number;
  contentHash: string;
  mtimeMs: number;
  role: string;
  severity: string;
  reason: string;
  recommendation: string;
  waivedAt: string | null;
  waivedReason: string | null;
  waiverHash: string | null;
  createdAt: string;
};

export type ScaleReport = {
  estimate: ScaleEstimate;
  findings: FileScaleFinding[];
  blocked: boolean;
};

export type Statement = {
  project: {
    id: string;
    alias: string;
    path: string;
    name: string;
  };
  session: {
    id: string;
    alias: string;
    status: string;
    mode: string;
    goal: string | null;
    runtimeSeconds: number;
    lastSeenAt: string;
    agent: AgentActivity;
  } | null;
  currentTask: {
    id: string;
    alias: string;
    title: string;
    progress: number;
    qualityGate: string;
    owner: string;
    status: string;
    runtimeSeconds: number;
  } | null;
  scale: {
    latestReportId: string | null;
    maxWeight: number | null;
    blockingFindings: number;
    nextSplitRequired: boolean;
  };
  subagents: {
    required: boolean;
    reason: string | null;
    instruction: string | null;
    pending: Array<{
      id: string;
      alias: string;
      title: string;
      owner: string;
      role: string;
      status: string;
      priority: number;
      estimatedWeight: number | null;
    }>;
  };
  blockers: string[];
  nextExpectedAction: string | null;
};

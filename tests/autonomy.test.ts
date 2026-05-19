import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agentActionCommand, agentRunCommand, decisionCommand } from "../src/cli-autonomy-commands.ts";
import { handleDashboardRequest } from "../src/dashboard.ts";
import { initializeStorage } from "../src/daemon.ts";
import { LATEST_SCHEMA_VERSION, openDatabase } from "../src/db.ts";
import { getArdexPaths } from "../src/paths.ts";
import {
  addAgentAction,
  addDecision,
  addProject,
  addTask,
  answerDecision,
  completeAgentRun,
  dismissDecision,
  endAgentAction,
  listAgentActions,
  listAgentRuns,
  listDecisions,
  startAgentRun,
  startSession,
} from "../src/repository.ts";

const tempRoots: string[] = [];

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
  delete process.env.ARDEX_HOME;
});

test("autonomy migration creates repository tables and stores linked run action decision records", async () => {
  const { db, project } = await dbFixture();
  try {
    const tables = new Set(
      (
        db
          .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('agent_runs', 'agent_actions', 'decisions')")
          .all() as Array<{ name: string }>
      ).map((row) => row.name),
    );
    expect(tables).toEqual(new Set(["agent_runs", "agent_actions", "decisions"]));

    const session = startSession(db, project.alias, { goal: "autonomy smoke" });
    const task = addTask(db, project.alias, { title: "cover autonomy primitives" });
    const run = startAgentRun(db, project.alias, {
      owner: "test",
      taskRef: task.alias,
      goal: "Implement autonomy tests",
      model: "gpt-5",
      worktreePath: project.path,
      branchName: "agent/autonomy-tests",
      pid: 1234,
      autonomyBudget: { minutes: 20, tokens: 4000 },
    });
    const reading = addAgentAction(db, project.alias, {
      runRef: run.alias,
      type: "reading",
      status: "running",
      title: "Read autonomy implementation",
      currentFile: "src/repository/autonomy.ts",
      progress: 0.4,
    });
    const decision = addDecision(db, project.alias, {
      runRef: run.alias,
      actionRef: reading.alias,
      type: "scope_change",
      question: "Include dashboard mutation tests?",
      context: "Autonomy control room needs decision state.",
      options: [
        { id: "yes", label: "Yes", description: "Cover API mutation path" },
        { id: "no", label: "No", consequence: "Repository-only coverage" },
      ],
      recommendedOption: "yes",
      required: true,
      priority: 7,
    });
    const completedAction = endAgentAction(db, project.alias, reading.alias, { summary: "API shape found" });
    const completedRun = completeAgentRun(db, project.alias, run.alias, { summary: "Autonomy smoke passed", exitCode: 0 });

    expect(run.alias).toBe("ar_001");
    expect(run.sessionId).toBe(session.id);
    expect(run.taskId).toBe(task.id);
    expect(run.owner).toBe("subagent:test");
    expect(run.model).toBe("gpt-5");
    expect(run.worktreePath).toBe(project.path);
    expect(run.branchName).toBe("agent/autonomy-tests");
    expect(run.pid).toBe(1234);
    expect(run.autonomyBudget).toEqual({ minutes: 20, tokens: 4000 });
    expect(reading.alias).toBe("aa_001");
    expect(reading.runId).toBe(run.id);
    expect(reading.taskId).toBe(task.id);
    expect(reading.sequence).toBe(1);
    expect(reading.kind).toBe("reading");
    expect(reading.currentFile).toBe("src/repository/autonomy.ts");
    expect(reading.progress).toBe(0.4);
    expect(decision.alias).toBe("d_001");
    expect(decision.runId).toBe(run.id);
    expect(decision.agentRunId).toBe(run.id);
    expect(decision.actionId).toBe(reading.id);
    expect(decision.taskId).toBe(task.id);
    expect(decision.status).toBe("open");
    expect(decision.options.map((option) => option.id)).toEqual(["yes", "no"]);
    expect(completedAction.status).toBe("completed");
    expect(completedAction.completedAt).not.toBeNull();
    expect(completedRun.status).toBe("completed");
    expect(completedRun.completedAt).not.toBeNull();
    expect(listAgentRuns(db, project.alias).map((item) => item.alias)).toEqual([run.alias]);
    expect(listAgentActions(db, project.alias, { runRef: run.alias }).map((item) => item.alias)).toEqual([reading.alias]);
    expect(listDecisions(db, project.alias, { runRef: run.alias }).map((item) => item.alias)).toEqual([decision.alias]);
  } finally {
    db.close();
  }
});

test("repository decision answer and dismiss flow resolves only open decisions", async () => {
  const { db, project } = await dbFixture();
  try {
    const answerable = addDecision(db, project.alias, {
      question: "Approve CLI command names?",
      options: [{ id: "approve", label: "Approve" }],
      priority: 2,
    });
    const dismissible = addDecision(db, project.alias, {
      question: "Keep duplicate approval path?",
      priority: 1,
    });

    const answered = answerDecision(db, project.alias, answerable.alias, {
      answer: "approve",
      answerSource: "user",
    });
    const dismissed = dismissDecision(db, project.alias, dismissible.alias, {
      reason: "superseded by dashboard route",
      resolvedBy: "subagent:test",
    });

    expect(answered.status).toBe("answered");
    expect(answered.answer).toBe("approve");
    expect(answered.resolvedBy).toBe("user");
    expect(answered.answeredAt).not.toBeNull();
    expect(dismissed.status).toBe("dismissed");
    expect(dismissed.answer).toBeNull();
    expect(dismissed.dismissedReason).toBe("superseded by dashboard route");
    expect(dismissed.resolvedBy).toBe("subagent:test");
    expect(() => answerDecision(db, project.alias, answerable.alias, "again")).toThrow("Decision is already resolved");
    expect(() => dismissDecision(db, project.alias, dismissible.alias, "again")).toThrow("Decision is already resolved");
    expect(listDecisions(db, project.alias, { status: "answered" }).map((item) => item.alias)).toEqual([answerable.alias]);
    expect(listDecisions(db, project.alias, { status: "dismissed" }).map((item) => item.alias)).toEqual([dismissible.alias]);
  } finally {
    db.close();
  }
});

test("autonomy CLI commands create list update and resolve primitives", async () => {
  const { paths, db, project } = await dbFixture();
  process.env.ARDEX_HOME = paths.home;
  const task = addTask(db, project.alias, { title: "cli autonomy coverage" });
  db.close();

  const runStart = await agentRunCommand(parsed(project.alias, [
    "agent-run",
    "start",
    "--owner",
    "test",
    "--task",
    task.alias,
    "--goal",
    "Exercise CLI autonomy commands",
    "--model",
    "gpt-5",
    "--budget",
    '{"minutes":15}',
  ]));
  const run = (runStart.data as { agentRun: Record<string, any> }).agentRun;
  expect(run.id).toBe("ar_001");
  expect(run.owner).toBe("subagent:test");
  expect(run.status).toBe("running");
  expect(run.autonomyBudget).toEqual({ minutes: 15 });

  const actionAdd = await agentActionCommand(parsed(project.alias, [
    "agent-action",
    "add",
    "--run",
    run.id as string,
    "--type",
    "testing",
    "--summary",
    "Run focused autonomy tests",
    "--file",
    "tests/autonomy.test.ts",
    "--progress",
    "0.5",
  ]));
  const action = (actionAdd.data as { agentAction: Record<string, any> }).agentAction;
  expect(action.id).toBe("aa_001");
  expect(action.kind).toBe("testing");
  expect(action.currentFile).toBe("tests/autonomy.test.ts");
  expect(action.progress).toBe(0.5);

  const decisionAdd = await decisionCommand(parsed(project.alias, [
    "decision",
    "add",
    "--run",
    run.id as string,
    "--task",
    task.alias,
    "--type",
    "risk_waiver",
    "--priority",
    "4",
    "--recommended",
    "ship",
    "--required",
    "true",
    "--option",
    "ship:Ship with focused coverage",
    "--option",
    "hold:Wait for broader integration",
    "Ship autonomy tests now?",
  ]));
  const decision = (decisionAdd.data as { decision: Record<string, any> }).decision;
  expect(decision.id).toBe("d_001");
  expect(decision.runId).toBe((run.internalId as string) ?? run.id);
  expect(decision.status).toBe("open");
  expect(decision.options.map((option: any) => option.id)).toEqual(["ship", "hold"]);

  const heartbeat = await agentRunCommand(parsed(project.alias, ["agent-run", "heartbeat", run.id as string, "--status", "verifying", "--summary", "Tests running"]));
  expect((heartbeat.data as { agentRun: Record<string, any> }).agentRun.status).toBe("verifying");

  const actionEnd = await agentActionCommand(parsed(project.alias, ["agent-action", "end", action.id as string, "--summary", "Focused tests passed"]));
  expect((actionEnd.data as { agentAction: Record<string, any> }).agentAction.status).toBe("completed");

  const decisionAnswer = await decisionCommand(parsed(project.alias, ["decision", decision.id as string, "answer", "ship"]));
  expect((decisionAnswer.data as { decision: Record<string, any> }).decision.status).toBe("answered");

  const runDone = await agentRunCommand(parsed(project.alias, ["agent-run", "done", run.id as string, "--summary", "CLI autonomy covered", "--exit-code", "0"]));
  expect((runDone.data as { agentRun: Record<string, any> }).agentRun.status).toBe("completed");

  const runList = await agentRunCommand(parsed(project.alias, ["agent-run", "ls", "--status", "completed"]));
  expect((runList.data as { agentRuns: Array<Record<string, any>> }).agentRuns.map((item) => item.id)).toEqual([run.id]);
  const actionList = await agentActionCommand(parsed(project.alias, ["agent-action", "ls", "--run", run.id as string]));
  expect((actionList.data as { agentActions: Array<Record<string, any>> }).agentActions.map((item) => item.id)).toEqual([action.id]);
  const decisionList = await decisionCommand(parsed(project.alias, ["decision", "ls", "--status", "answered"]));
  expect((decisionList.data as { decisions: Array<Record<string, any>> }).decisions.map((item) => item.id)).toEqual([decision.id]);
});

test("dashboard snapshot exposes autonomy arrays and decision mutations", async () => {
  const { paths, db, project } = await dbFixture();
  const session = startSession(db, project.alias, { goal: "dashboard autonomy" });
  const task = addTask(db, project.alias, { title: "render autonomy panels" });
  const run = startAgentRun(db, project.alias, {
    owner: "ui",
    taskRef: task.alias,
    goal: "Render Agent Control Room",
    model: "gpt-5",
  });
  const action = addAgentAction(db, project.alias, {
    runRef: run.alias,
    type: "waiting_approval",
    status: "running",
    title: "Wait for decision",
    summary: "Decision queue has pending approval",
    currentFile: "web/App.tsx",
    progress: 0.75,
  });
  const answerable = addDecision(db, project.alias, {
    runRef: run.alias,
    actionRef: action.alias,
    question: "Approve dashboard autonomy panel?",
    type: "visual_approval",
    priority: 9,
    required: true,
    recommendedOption: "approve",
    options: [{ id: "approve", label: "Approve", consequence: "Unblocks UI" }],
  });
  const dismissible = addDecision(db, project.alias, {
    runRef: run.alias,
    taskRef: task.alias,
    question: "Keep stale panel variant?",
    priority: 1,
  });
  db.close();

  const before = await getJson(paths, `/api/projects/${project.alias}/dashboard`);
  expect(before.data.agentRuns.map((item: any) => item.id)).toEqual([run.alias]);
  expect(before.data.agentRuns[0].sessionRef).toBe(session.alias);
  expect(before.data.agentRuns[0].taskRef).toBe(task.alias);
  expect(before.data.agentRuns[0].owner).toBe("subagent:ui");
  expect(before.data.agentActions.map((item: any) => item.id)).toEqual([action.alias]);
  expect(before.data.agentActions[0].runRef).toBe(run.alias);
  expect(before.data.agentActions[0].taskRef).toBe(task.alias);
  expect(before.data.agentActions[0].kind).toBe("waiting_approval");
  expect(before.data.decisions.map((item: any) => item.id)).toEqual([answerable.alias, dismissible.alias]);
  expect(before.data.decisions[0].runRef).toBe(run.alias);
  expect(before.data.decisions[0].agentRunRef).toBe(run.alias);
  expect(before.data.decisions[0].taskRef).toBe(task.alias);
  expect(before.data.decisions[0].required).toBe(true);
  expect(before.data.decisions[0].options[0].consequence).toBe("Unblocks UI");

  const answered = await postJson(paths, `/api/projects/${project.alias}/decisions/${answerable.alias}/answer`, { answer: "approve" });
  expect(answered.data.decision.status).toBe("answered");
  expect(answered.data.decision.answer).toBe("approve");
  expect(answered.data.decision.answeredAt).not.toBeNull();

  const dismissed = await postJson(paths, `/api/projects/${project.alias}/decisions/${dismissible.alias}/dismiss`, { reason: "not needed" });
  expect(dismissed.data.decision.status).toBe("dismissed");
  expect(dismissed.data.decision.dismissedReason).toBe("not needed");

  const after = await getJson(paths, `/api/projects/${project.alias}/dashboard`);
  expect(after.data.decisions.map((item: any) => [item.id, item.status])).toEqual([
    [answerable.alias, "answered"],
    [dismissible.alias, "dismissed"],
  ]);
});

async function dbFixture() {
  const root = await tempRoot();
  const projectPath = join(root, "project");
  await mkdir(projectPath);
  const paths = getArdexPaths(join(root, "ardex"));
  const storage = await initializeStorage(paths);
  expect(storage.schemaVersion).toBe(LATEST_SCHEMA_VERSION);
  const db = openDatabase(paths);
  const project = await addProject(db, projectPath);
  return { paths, db, project };
}

function parsed(projectId: string, args: string[]) {
  return {
    args,
    commandName: args.join("."),
    json: true,
    noStart: false,
    projectId,
  };
}

async function postJson(paths: ReturnType<typeof getArdexPaths>, path: string, body: Record<string, unknown>) {
  const response = await handleDashboardRequest(
    new Request(`http://127.0.0.1:17373${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://127.0.0.1:17373" },
      body: JSON.stringify(body),
    }),
    paths,
  );
  expect(response?.status).toBe(200);
  return (await response?.json()) as { ok: boolean; data: Record<string, any> };
}

async function getJson(paths: ReturnType<typeof getArdexPaths>, path: string) {
  const response = await handleDashboardRequest(new Request(`http://127.0.0.1:17373${path}`), paths);
  expect(response?.status).toBe(200);
  return (await response?.json()) as { ok: boolean; data: Record<string, any> };
}

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ardex-autonomy-test-"));
  tempRoots.push(root);
  return root;
}

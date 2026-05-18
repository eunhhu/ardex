import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { handleDashboardRequest } from "../src/dashboard.ts";
import { initializeStorage } from "../src/daemon.ts";
import { openDatabase } from "../src/db.ts";
import { initializeArdex } from "../src/init.ts";
import { checkCommand, statementCommand } from "../src/cli-core-commands.ts";
import { evidenceCommand } from "../src/cli-workflow-commands.ts";
import { getArdexPaths } from "../src/paths.ts";
import { migrateCodexProjects } from "../src/codex-migration.ts";
import {
  addEvidence,
  addProject,
  addTask,
  archiveProject,
  buildStatement,
  buildProductionChecklist,
  completeTask,
  claimTask,
  deleteTask,
  ensureVisualScenarioPrompt,
  listEvidence,
  listTaskEvents,
  listTasks,
  latestScaleReport,
  pauseTask,
  resumeTask,
  setTaskOwner,
  setEvidenceStatus,
  splitTaskFromScale,
  startSession,
  setTaskField,
  setSessionField,
  storeScaleReport,
  waiveScaleFinding,
} from "../src/repository.ts";
import { scanScale } from "../src/scale.ts";

const tempRoots: string[] = [];

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
  delete process.env.ARDEX_SKILL_ROOT;
  delete process.env.ARDEX_CODEX_HOME;
  delete process.env.ARDEX_HOME;
});

test("init installs Codex skill and hooks without touching real home when overridden", async () => {
  const root = await tempRoot();
  const paths = getArdexPaths(join(root, "ardex"));
  process.env.ARDEX_SKILL_ROOT = join(root, "skills");
  process.env.ARDEX_CODEX_HOME = join(root, "codex");

  const result = await initializeArdex(paths, { installCodex: true });

  expect(result.codex.skillPath).toEndWith("skills/ardex/SKILL.md");
  const skill = await readFile(result.codex.skillPath, "utf8");
  expect(skill).toContain("name: ardex");
  expect(skill).toContain("statement.subagents.required");
  expect(skill).toContain("explicit Ardex delegation request");
  const promptHookPath = result.codex.hookScriptPaths.find((path) => path.endsWith("user-prompt-context.mjs"));
  expect(promptHookPath).toBeDefined();
  expect(await readFile(promptHookPath ?? "", "utf8")).toContain("Subagent rule");
  const hooks = JSON.parse(await readFile(result.codex.hooksConfigPath, "utf8")) as { hooks: Record<string, unknown[]> };
  expect(hooks.hooks.UserPromptSubmit?.length).toBe(1);
  expect(hooks.hooks.Stop?.length).toBe(1);
  expect(hooks.hooks.PostToolUse).toBeUndefined();
});

test("init preserves existing hooks and writes backup", async () => {
  const root = await tempRoot();
  const paths = getArdexPaths(join(root, "ardex"));
  process.env.ARDEX_SKILL_ROOT = join(root, "skills");
  process.env.ARDEX_CODEX_HOME = join(root, "codex");
  await mkdir(process.env.ARDEX_CODEX_HOME, { recursive: true });
  const hooksPath = join(process.env.ARDEX_CODEX_HOME, "hooks.json");
  await writeFile(hooksPath, `${JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: "echo keep" }] }] } })}\n`, "utf8");

  await initializeArdex(paths, { installCodex: true });

  const hooks = JSON.parse(await readFile(hooksPath, "utf8")) as { hooks: { Stop: unknown[]; UserPromptSubmit: unknown[]; PostToolUse?: unknown[] } };
  expect(hooks.hooks.Stop.length).toBe(2);
  expect(hooks.hooks.UserPromptSubmit.length).toBe(1);
  expect(hooks.hooks.PostToolUse).toBeUndefined();
  expect(await readFile(`${hooksPath}.ardex-backup`, "utf8")).toContain("echo keep");
});

test("init is idempotent and replaces stale Ardex hook entries", async () => {
  const root = await tempRoot();
  const paths = getArdexPaths(join(root, "ardex"));
  process.env.ARDEX_SKILL_ROOT = join(root, "skills");
  process.env.ARDEX_CODEX_HOME = join(root, "codex");
  await mkdir(process.env.ARDEX_CODEX_HOME, { recursive: true });
  const hooksPath = join(process.env.ARDEX_CODEX_HOME, "hooks.json");
  await writeFile(
    hooksPath,
    `${JSON.stringify({
      hooks: {
        UserPromptSubmit: [{ hooks: [{ type: "command", command: "node /old/.ardex/hooks/user-prompt-context.mjs", statusMessage: "Loading Ardex statement" }] }],
        Stop: [
          { hooks: [{ type: "command", command: "echo keep" }] },
          { hooks: [{ type: "command", command: "node /old/.ardex/hooks/stop-check.mjs", statusMessage: "Checking Ardex gates" }] },
        ],
        PostToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "node /old/.ardex/hooks/post-tool-use-evidence.mjs" }] }],
      },
    })}\n`,
    "utf8",
  );

  await initializeArdex(paths, { installCodex: true });
  await initializeArdex(paths, { installCodex: true });

  const hooks = JSON.parse(await readFile(hooksPath, "utf8")) as { hooks: Record<string, unknown[]> };
  expect(hooks.hooks.UserPromptSubmit?.length).toBe(1);
  expect(hooks.hooks.Stop?.length).toBe(2);
  expect(hooks.hooks.PostToolUse).toBeUndefined();
});

test("check auto-migrates stale installed Codex integration", async () => {
  const root = await tempRoot();
  process.env.ARDEX_HOME = join(root, "ardex");
  process.env.ARDEX_SKILL_ROOT = join(root, "skills");
  process.env.ARDEX_CODEX_HOME = join(root, "codex");
  await mkdir(join(process.env.ARDEX_SKILL_ROOT, "ardex"), { recursive: true });
  await mkdir(process.env.ARDEX_CODEX_HOME, { recursive: true });
  await writeFile(join(process.env.ARDEX_SKILL_ROOT, "ardex", "SKILL.md"), "old skill\n", "utf8");
  const hooksPath = join(process.env.ARDEX_CODEX_HOME, "hooks.json");
  await writeFile(
    hooksPath,
    `${JSON.stringify({
      hooks: {
        PostToolUse: [{ hooks: [{ type: "command", command: "node /old/.ardex/hooks/post-tool-use-evidence.mjs" }] }],
      },
    })}\n`,
    "utf8",
  );

  try {
    await checkCommand();
  } catch {
    // The daemon is intentionally not running; migration must happen before that failure.
  }

  const skill = await readFile(join(process.env.ARDEX_SKILL_ROOT, "ardex", "SKILL.md"), "utf8");
  const hooks = JSON.parse(await readFile(hooksPath, "utf8")) as { hooks: Record<string, unknown[]> };
  expect(skill).toContain("statement.subagents.required");
  expect(hooks.hooks.PostToolUse).toBeUndefined();
  expect(hooks.hooks.UserPromptSubmit?.length).toBe(1);
  expect(hooks.hooks.Stop?.length).toBe(1);
});

test("task priority shifts and quality gate is advisory", async () => {
  const { db, project } = await dbFixture();
  try {
    startSession(db, project.alias, { goal: "test" });
    const first = addTask(db, project.alias, { title: "first", priority: 1, qualityGate: "test" });
    const second = addTask(db, project.alias, { title: "second", priority: 1 });
    const tasks = listTasks(db, project.alias);
    expect(tasks.map((task) => [task.alias, task.priority])).toEqual([
      [second.alias, 1],
      [first.alias, 2],
    ]);

    setTaskField(db, project.alias, first.alias, "progress", "1");
    expect(completeTask(db, project.alias, first.alias).status).toBe("done");
  } finally {
    db.close();
  }
});

test("task runtime pause resume owner and delete are tracked as events", async () => {
  const { db, project } = await dbFixture();
  try {
    startSession(db, project.alias, { goal: "runtime" });
    const task = addTask(db, project.alias, { title: "runtime task" });
    expect(setTaskOwner(db, project.alias, task.alias, "subagent:worker").owner).toBe("subagent:worker");
    expect(pauseTask(db, project.alias, task.alias, "waiting for user").status).toBe("paused");
    const resumed = resumeTask(db, project.alias, task.alias);
    expect(resumed.status).toBe("active");
    expect(resumed.startedAt).not.toBeNull();

    setTaskField(db, project.alias, task.alias, "progress", "1");
    expect(buildProductionChecklist(db, project.alias, task.alias).passed).toBe(true);
    expect(completeTask(db, project.alias, task.alias).status).toBe("done");

    const events = listTaskEvents(db, project.alias, task.alias).map((event) => event.type);
    expect(events).toContain("created");
    expect(events).toContain("paused");
    expect(events).toContain("resumed");
    expect(events).toContain("owner_changed");
    expect(events).toContain("completed");
  } finally {
    db.close();
  }
});

test("statement exposes subagent delegation plan", async () => {
  const { db, project } = await dbFixture();
  try {
    const task = addTask(db, project.alias, { title: "delegated slice", qualityGate: "review" });
    setTaskOwner(db, project.alias, task.alias, "subagent:worker-1");
    const statement = buildStatement(db, project.alias);
    expect(statement.subagents.required).toBe(true);
    expect(statement.subagents.pending[0]?.id).toBe(task.alias);
    expect(statement.subagents.pending[0]?.role).toBe("worker-1");
    expect(statement.subagents.instruction).toContain("Spawn separate Codex subagents");
    expect(statement.nextExpectedAction).toBe(`spawn_subagent:${task.alias}`);
  } finally {
    db.close();
  }
});

test("statement command syncs stale planning session into active workflow", async () => {
  const { paths, db, project } = await dbFixture();
  process.env.ARDEX_HOME = paths.home;
  process.env.ARDEX_SKILL_ROOT = join(paths.home, "skills");
  process.env.ARDEX_CODEX_HOME = join(paths.home, "codex");
  let taskAlias = "";
  try {
    startSession(db, project.alias, { goal: "workflow" });
    const task = addTask(db, project.alias, { title: "workflow task", qualityGate: "none" });
    taskAlias = task.alias;
    const scan = await scanScale({ projectPath: project.path, paths: [] });
    storeScaleReport(db, project.alias, scan);
    claimTask(db, project.alias, task.alias);
    setSessionField(db, project.alias, "status", "planning");
  } finally {
    db.close();
  }

  const result = await statementCommand({
    args: ["statement"],
    commandName: "statement",
    json: true,
    noStart: false,
    projectId: project.alias,
  });
  const statement = (result.data as { statement: ReturnType<typeof buildStatement> }).statement;

  expect(statement.session?.status).toBe("implementing");
  expect(statement.session?.agent.state).toBe("running");
  expect(statement.currentTask?.id).toBe(taskAlias);
  expect(statement.nextExpectedAction).toBe(`work:${taskAlias}`);
});

test("statement command preserves reviewing after final task completion", async () => {
  const { paths, db, project } = await dbFixture();
  process.env.ARDEX_HOME = paths.home;
  process.env.ARDEX_SKILL_ROOT = join(paths.home, "skills");
  process.env.ARDEX_CODEX_HOME = join(paths.home, "codex");
  try {
    startSession(db, project.alias, { goal: "reviewing" });
    const task = addTask(db, project.alias, { title: "final task", qualityGate: "none" });
    const scan = await scanScale({ projectPath: project.path, paths: [] });
    storeScaleReport(db, project.alias, scan);
    claimTask(db, project.alias, task.alias);
    setTaskField(db, project.alias, task.alias, "progress", "1");
    completeTask(db, project.alias, task.alias);
    setSessionField(db, project.alias, "status", "specifying");
  } finally {
    db.close();
  }

  const result = await statementCommand({
    args: ["statement"],
    commandName: "statement",
    json: true,
    noStart: false,
    projectId: project.alias,
  });
  const statement = (result.data as { statement: ReturnType<typeof buildStatement> }).statement;

  expect(statement.session?.status).toBe("reviewing");
  expect(statement.nextExpectedAction).toBe("review_session");
});

test("task delete compacts priorities and leaves delete event", async () => {
  const { db, project } = await dbFixture();
  try {
    const first = addTask(db, project.alias, { title: "first" });
    const second = addTask(db, project.alias, { title: "second" });
    const event = deleteTask(db, project.alias, first.alias);
    expect(event.type).toBe("deleted");
    const tasks = listTasks(db, project.alias);
    expect(tasks.map((task) => [task.alias, task.priority])).toEqual([[second.alias, 1]]);
    expect(listTaskEvents(db, project.alias).some((item) => item.taskAlias === first.alias && item.type === "deleted")).toBe(true);
  } finally {
    db.close();
  }
});

test("task delete compacts a long priority range without unique collisions", async () => {
  const { db, project } = await dbFixture();
  try {
    const task1 = addTask(db, project.alias, { title: "task 1" });
    const task2 = addTask(db, project.alias, { title: "task 2" });
    const task3 = addTask(db, project.alias, { title: "task 3" });
    const task4 = addTask(db, project.alias, { title: "task 4" });
    const task5 = addTask(db, project.alias, { title: "task 5" });
    const task6 = addTask(db, project.alias, { title: "task 6" });
    const task7 = addTask(db, project.alias, { title: "task 7" });
    const task8 = addTask(db, project.alias, { title: "task 8" });
    deleteTask(db, project.alias, task4.alias);
    const remaining = listTasks(db, project.alias);

    expect(remaining.map((task) => task.priority)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(new Set(remaining.map((task) => task.priority)).size).toBe(7);
    expect(remaining.map((task) => task.alias)).toEqual([
      task1.alias,
      task2.alias,
      task3.alias,
      task5.alias,
      task6.alias,
      task7.alias,
      task8.alias,
    ]);
  } finally {
    db.close();
  }
});

test("evidence redacts secrets before storage", async () => {
  const { db, project } = await dbFixture();
  try {
    addEvidence(db, project.alias, {
      type: "command",
      targetType: "session",
      summary: "ran with token=super-secret-value and sk-abcdefghijklmnopqrstuvwxyz",
      payload: { output: "api_key=abc123 password=hunter2" },
    });
    const [evidence] = listEvidence(db, project.alias);
    expect(evidence).toBeDefined();
    if (evidence === undefined) {
      throw new Error("missing evidence");
    }
    expect(evidence.summary).toContain("[REDACTED]");
    expect(String(evidence.payload.output)).toContain("[REDACTED]");
  } finally {
    db.close();
  }
});

test("visual scenario gate blocks visual task claim until approved imagegen output exists", async () => {
  const { db, project } = await dbFixture();
  try {
    startSession(db, project.alias, { goal: "visual gate" });
    storeScaleReport(db, project.alias, await scanScale({ projectPath: project.path, paths: [] }));
    const task = addTask(db, project.alias, { title: "dashboard layout polish", qualityGate: "visual" });

    expect(() => claimTask(db, project.alias, task.alias)).toThrow("Visual scenario approval is required");

    const prompt = ensureVisualScenarioPrompt(db, project, task);
    expect(prompt.type).toBe("prototype");
    expect(prompt.status).toBe("candidate");
    expect(prompt.payload.kind).toBe("visual_scenario_prompt");
    expect(() => claimTask(db, project.alias, task.alias)).toThrow("Visual scenario approval is required");

    const candidate = addEvidence(db, project.alias, {
      type: "generated_image",
      targetType: "task",
      targetRef: task.alias,
      status: "candidate",
      summary: "visual scenario candidate",
      payload: { kind: "visual_scenario_confirm", path: "scenario.png", prompt: prompt.payload.prompt },
    });
    expect(() => claimTask(db, project.alias, task.alias)).toThrow("Visual scenario approval is required");

    setEvidenceStatus(db, project.alias, candidate.alias, "accepted", { comment: "matches expected flow" });
    expect(claimTask(db, project.alias, task.alias).status).toBe("active");
    const checklist = buildProductionChecklist(db, project.alias, task.alias);
    expect(checklist.items.find((item) => item.id === "visual_scenario_confirm")?.passed).toBe(true);
  } finally {
    db.close();
  }
});

test("dashboard rejects cross-origin mutation and accepts local task create", async () => {
  const { paths, db, project } = await dbFixture();
  db.close();

  const rejected = await handleDashboardRequest(
    new Request(`http://127.0.0.1:17373/api/projects/${project.alias}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://evil.example" },
      body: JSON.stringify({ title: "bad" }),
    }),
    paths,
  );
  expect(rejected?.status).toBe(400);

  const accepted = await handleDashboardRequest(
    new Request(`http://127.0.0.1:17373/api/projects/${project.alias}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://127.0.0.1:17373" },
      body: JSON.stringify({ title: "good", qualityGate: "none" }),
    }),
    paths,
  );
  expect(accepted?.status).toBe(200);
  const envelope = (await accepted?.json()) as { ok: boolean };
  expect(envelope.ok).toBe(true);
});

test("dashboard serves split static assets", async () => {
  const { paths, db } = await dbFixture();
  db.close();

  const html = await handleDashboardRequest(new Request("http://127.0.0.1:17373/"), paths);
  expect(html?.status).toBe(200);
  expect(html?.headers.get("content-type")).toContain("text/html");
  const body = (await html?.text()) ?? "";
  const appPath = body.match(/src="([^"]+\.js)"/)?.[1];
  const cssPath = body.match(/href="([^"]+\.css)"/)?.[1];
  expect(appPath).toBeDefined();
  expect(cssPath).toBeDefined();

  const app = await handleDashboardRequest(new Request(`http://127.0.0.1:17373${appPath}`), paths);
  const css = await handleDashboardRequest(new Request(`http://127.0.0.1:17373${cssPath}`), paths);
  expect(app?.status).toBe(200);
  expect(app?.headers.get("content-type")).toContain("text/javascript");
  expect(((await app?.text()) ?? "").length).toBeGreaterThan(100);
  expect(css?.status).toBe(200);
  expect(css?.headers.get("content-type")).toContain("text/css");
});

test("archived projects are hidden from dashboard project list", async () => {
  const { paths, db, project } = await dbFixture();
  try {
    archiveProject(db, project.alias);
  } finally {
    db.close();
  }

  const projects = await getJson(paths, "/api/projects");
  expect(projects.data.projects.some((item: any) => item.id === project.alias)).toBe(false);
});

test("scale block prevents implementing until finding is waived", async () => {
  const { db, project } = await dbFixture();
  try {
    await writeFile(join(project.path, "large.ts"), Array.from({ length: 1501 }, (_, index) => `export const v${index} = ${index};`).join("\n"), "utf8");
    startSession(db, project.alias, { goal: "scale" });
    const scan = await scanScale({ projectPath: project.path, paths: ["large.ts"] });
    const report = storeScaleReport(db, project.alias, scan);
    expect(report.blocked).toBe(true);
    expect(() => setSessionField(db, project.alias, "status", "implementing")).toThrow("Blocking scale findings");
    const finding = latestScaleReport(db, project.alias).findings.find((item) => item.severity === "block");
    expect(finding).toBeDefined();
    if (finding === undefined) throw new Error("missing block finding");
    waiveScaleFinding(db, project.alias, finding.alias, "Production test waiver with explicit tracked reasoning.");
    expect(setSessionField(db, project.alias, "status", "implementing").status).toBe("implementing");
  } finally {
    db.close();
  }
});

test("dashboard session and task mutation endpoints update snapshot", async () => {
  const { paths, db, project } = await dbFixture();
  db.close();

  await postJson(paths, `/api/projects/${project.alias}/session/start`, { goal: "dashboard flow" });
  const taskEnvelope = await postJson(paths, `/api/projects/${project.alias}/tasks`, { title: "storage task", qualityGate: "none" });
  const taskId = taskEnvelope.data.task.alias as string;
  await postJson(paths, `/api/projects/${project.alias}/tasks/${taskId}/priority`, { priority: 1 });
  await postJson(paths, `/api/projects/${project.alias}/tasks/${taskId}/progress`, { progress: 1 });
  await postJson(paths, `/api/projects/${project.alias}/tasks/${taskId}/done`, {});
  const dashboard = await getJson(paths, `/api/projects/${project.alias}/dashboard`);

  expect(dashboard.data.tasks[0].title).toBe("storage task");
  expect(dashboard.data.tasks[0].status).toBe("done");
});

test("dashboard pause resume owner and generated image outputs update snapshot", async () => {
  const { paths, db, project } = await dbFixture();
  startSession(db, project.alias, { goal: "dashboard output" });
  const task = addTask(db, project.alias, { title: "visual task", qualityGate: "visual" });
  addEvidence(db, project.alias, {
    type: "generated_image",
    targetType: "task",
    targetRef: task.alias,
    summary: "generated scenario output",
    payload: { url: "http://127.0.0.1:3000/output.png" },
  });
  addEvidence(db, project.alias, {
    type: "browser_diff",
    targetType: "task",
    targetRef: task.alias,
    summary: "browser diff accepted",
    payload: { url: "http://127.0.0.1:3000/diff.html" },
  });
  db.close();

  await postJson(paths, `/api/projects/${project.alias}/tasks/${task.alias}/owner`, { owner: "subagent:worker" });
  await postJson(paths, `/api/projects/${project.alias}/tasks/${task.alias}/pause`, { reason: "user reprioritized" });
  await postJson(paths, `/api/projects/${project.alias}/tasks/${task.alias}/resume`, {});
  const dashboard = await getJson(paths, `/api/projects/${project.alias}/dashboard`);

  expect(dashboard.data.tasks[0].owner).toBe("subagent:worker");
  expect(dashboard.data.tasks[0].status).toBe("active");
  expect(dashboard.data.outputs.some((output: any) => output.type === "browser_diff")).toBe(true);
  expect(dashboard.data.outputs.some((output: any) => output.type === "generated_image" && output.renderableImage === true)).toBe(true);
});

test("dashboard output summaries expose markdown and html artifact metadata", async () => {
  const { paths, db, project } = await dbFixture();
  startSession(db, project.alias, { goal: "rich outputs" });
  const task = addTask(db, project.alias, { title: "document visible outputs" });
  addEvidence(db, project.alias, {
    type: "artifact",
    targetType: "task",
    targetRef: task.alias,
    summary: "markdown summary",
    payload: { markdown: "## Result\n\nDone.", format: "markdown" },
  });
  addEvidence(db, project.alias, {
    type: "prototype",
    targetType: "task",
    targetRef: task.alias,
    summary: "html summary",
    payload: { html: "<section>Done.</section>", format: "html" },
  });
  db.close();

  const dashboard = await getJson(paths, `/api/projects/${project.alias}/dashboard`);
  const markdown = dashboard.data.outputs.find((output: any) => output.summary === "markdown summary");
  const html = dashboard.data.outputs.find((output: any) => output.summary === "html summary");

  expect(markdown.kind).toBe("markdown");
  expect(markdown.format).toBe("markdown");
  expect(markdown.mimeType).toBe("text/markdown");
  expect(markdown.markdown).toContain("Done.");
  expect(markdown.renderable).toBe(true);
  expect(html.kind).toBe("html");
  expect(html.format).toBe("html");
  expect(html.mimeType).toBe("text/html");
  expect(html.html).toContain("<section>");
});

test("cli evidence add accepts markdown html and text payload fields", async () => {
  const { paths, db, project } = await dbFixture();
  process.env.ARDEX_HOME = paths.home;
  startSession(db, project.alias, { goal: "cli rich evidence" });
  const task = addTask(db, project.alias, { title: "cli output" });
  db.close();

  await evidenceCommand({
    args: ["evidence", "add", "artifact", "--task", task.alias, "--summary", "cli artifact", "--markdown", "# Notes", "--html", "<p>Notes</p>", "--text", "Notes"],
    commandName: "evidence",
    json: true,
    noStart: false,
    projectId: project.alias,
  });

  const dashboard = await getJson(paths, `/api/projects/${project.alias}/dashboard`);
  const output = dashboard.data.outputs.find((item: any) => item.summary === "cli artifact");
  expect(output.markdown).toBe("# Notes");
  expect(output.html).toBe("<p>Notes</p>");
  expect(output.text).toBe("Notes");
});

test("dashboard shows visual scenario candidates and records review comments", async () => {
  const { paths, db, project } = await dbFixture();
  await writeFile(join(project.path, "scenario.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64"));
  startSession(db, project.alias, { goal: "visual review" });
  const task = addTask(db, project.alias, { title: "dashboard screen state", qualityGate: "visual" });
  const evidence = addEvidence(db, project.alias, {
    type: "generated_image",
    targetType: "task",
    targetRef: task.alias,
    status: "candidate",
    summary: "expected dashboard state",
    payload: { kind: "visual_scenario_confirm", path: "scenario.png", prompt: "Show dashboard expected state." },
  });
  db.close();

  const before = await getJson(paths, `/api/projects/${project.alias}/dashboard`);
  const candidate = before.data.outputs.find((output: any) => output.id === evidence.alias);
  expect(candidate.status).toBe("candidate");
  expect(candidate.needsApproval).toBe(true);
  expect(candidate.previewUrl).toContain("/artifacts?path=scenario.png");

  const artifact = await handleDashboardRequest(new Request(`http://127.0.0.1:17373${candidate.previewUrl}`), paths);
  expect(artifact?.headers.get("content-type")).toBe("image/png");

  await postJson(paths, `/api/projects/${project.alias}/evidence/${evidence.alias}/accept`, { comment: "approved direction" });
  const after = await getJson(paths, `/api/projects/${project.alias}/dashboard`);
  const accepted = after.data.outputs.find((output: any) => output.id === evidence.alias);
  expect(accepted.status).toBe("accepted");
  expect(accepted.reviewComment).toBe("approved direction");
});

test("visual scenario gate accepts approved non-image renderable artifact", async () => {
  const { db, project } = await dbFixture();
  try {
    startSession(db, project.alias, { goal: "html scenario" });
    storeScaleReport(db, project.alias, await scanScale({ projectPath: project.path, paths: [] }));
    const task = addTask(db, project.alias, { title: "dashboard html scenario", qualityGate: "visual" });
    const prompt = ensureVisualScenarioPrompt(db, project, task);
    const candidate = addEvidence(db, project.alias, {
      type: "prototype",
      targetType: "task",
      targetRef: task.alias,
      status: "candidate",
      summary: "visual scenario html",
      payload: { kind: "visual_scenario_confirm", html: "<main>Expected state</main>", format: "html", prompt: prompt.payload.prompt },
    });

    expect(() => claimTask(db, project.alias, task.alias)).toThrow("Visual scenario approval is required");
    setEvidenceStatus(db, project.alias, candidate.alias, "accepted", { comment: "html scenario approved" });
    expect(claimTask(db, project.alias, task.alias).status).toBe("active");
    const checklist = buildProductionChecklist(db, project.alias, task.alias);
    expect(checklist.items.find((item) => item.id === "visual_scenario_confirm")?.passed).toBe(true);
  } finally {
    db.close();
  }
});

test("split child can inherit approved parent visual scenario", async () => {
  const { db, project } = await dbFixture();
  try {
    startSession(db, project.alias, { goal: "child visual inheritance" });
    storeScaleReport(db, project.alias, await scanScale({ projectPath: project.path, paths: [] }));
    const parent = addTask(db, project.alias, { title: "dashboard cleanup", qualityGate: "visual" });
    const prompt = ensureVisualScenarioPrompt(db, project, parent);
    const approved = addEvidence(db, project.alias, {
      type: "generated_image",
      targetType: "task",
      targetRef: parent.alias,
      status: "accepted",
      summary: "approved parent scenario",
      payload: { kind: "visual_scenario_confirm", path: "scenario.png", prompt: prompt.payload.prompt },
    });
    const child = addTask(db, project.alias, {
      title: "dashboard project cleanup controls",
      content: `Generated from scale report sc_001.\nParent task: ${parent.alias}.\nTarget slice 1/2.`,
      qualityGate: "test",
    });
    setTaskField(db, project.alias, child.alias, "content", "Edited child implementation scope.");

    expect(claimTask(db, project.alias, child.alias).status).toBe("active");
    const item = buildProductionChecklist(db, project.alias, child.alias).items.find((entry) => entry.id === "visual_scenario_confirm");
    expect(item?.passed).toBe(true);
    expect(item?.detail).toBe(`inherited=${approved.alias}`);
  } finally {
    db.close();
  }
});

test("codex project migration registers existing paths from metadata", async () => {
  const { db, project } = await dbFixture();
  try {
    const codexHome = join(project.path, ".fake-codex");
    await mkdir(codexHome);
    await writeFile(join(codexHome, "thread.jsonl"), JSON.stringify({ cwd: project.path }) + "\n", "utf8");
    const result = await migrateCodexProjects(db, codexHome);
    expect(result.scannedFiles).toBe(1);
    expect(result.registeredProjects.some((item) => item.path === project.path)).toBe(true);
  } finally {
    db.close();
  }
});

test("scale split creates weighted subagent-owned child tasks", async () => {
  const { db, project } = await dbFixture();
  try {
    startSession(db, project.alias, { goal: "split" });
    const task = addTask(db, project.alias, { title: "large feature", qualityGate: "spec" });
    await mkdir(join(project.path, "src"));
    for (let index = 0; index < 4; index += 1) {
      await writeFile(
        join(project.path, "src", `part${index}.ts`),
        Array.from({ length: 420 }, (_, line) => `export const v${index}_${line} = ${line};`).join("\n"),
        "utf8",
      );
    }
    const scan = await scanScale({ projectPath: project.path, paths: ["src"] });
    storeScaleReport(db, project.alias, scan);
    const split = splitTaskFromScale(db, project.alias, task.alias);
    const owners = split.tasks.map((item) => item.owner);
    expect(split.tasks.length).toBeGreaterThanOrEqual(2);
    expect(owners.every((owner) => owner.startsWith("subagent:worker-"))).toBe(true);
    expect(new Set(owners).size).toBe(owners.length);
    expect(listTasks(db, project.alias).find((item) => item.alias === task.alias)?.status).toBe("blocked");
  } finally {
    db.close();
  }
});

async function dbFixture() {
  const root = await tempRoot();
  const projectPath = join(root, "project");
  await mkdir(projectPath);
  const paths = getArdexPaths(join(root, "ardex"));
  await initializeStorage(paths);
  const db = openDatabase(paths);
  const project = await addProject(db, projectPath);
  return { paths, db, project };
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
  const root = await mkdtemp(join(tmpdir(), "ardex-test-"));
  tempRoots.push(root);
  return root;
}

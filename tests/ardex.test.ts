import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { handleDashboardRequest } from "../src/dashboard.ts";
import { initializeStorage } from "../src/daemon.ts";
import { openDatabase } from "../src/db.ts";
import { initializeArdex } from "../src/init.ts";
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
  deleteTask,
  listEvidence,
  listTaskEvents,
  listTasks,
  latestScaleReport,
  pauseTask,
  resumeTask,
  setTaskOwner,
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
  } finally {
    db.close();
  }
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

  const app = await handleDashboardRequest(new Request("http://127.0.0.1:17373/app.js"), paths);
  const module = await handleDashboardRequest(new Request("http://127.0.0.1:17373/js/render.js"), paths);
  const css = await handleDashboardRequest(new Request("http://127.0.0.1:17373/css/forms.css"), paths);

  expect(app?.status).toBe(200);
  expect(app?.headers.get("content-type")).toContain("text/javascript");
  expect(await app?.text()).toContain("from \"./js/render.js\"");
  expect(module?.status).toBe(200);
  expect(await module?.text()).toContain("renderProjectButton");
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
  const taskEnvelope = await postJson(paths, `/api/projects/${project.alias}/tasks`, { title: "dashboard task", qualityGate: "none" });
  const taskId = taskEnvelope.data.task.alias as string;
  await postJson(paths, `/api/projects/${project.alias}/tasks/${taskId}/priority`, { priority: 1 });
  await postJson(paths, `/api/projects/${project.alias}/tasks/${taskId}/progress`, { progress: 1 });
  await postJson(paths, `/api/projects/${project.alias}/tasks/${taskId}/done`, {});
  const dashboard = await getJson(paths, `/api/projects/${project.alias}/dashboard`);

  expect(dashboard.data.tasks[0].title).toBe("dashboard task");
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

import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDashboardSnapshot } from "../src/dashboard-data.ts";
import { initializeStorage } from "../src/daemon.ts";
import { openDatabase } from "../src/db.ts";
import { getArdexPaths } from "../src/paths.ts";
import {
  addEvidence,
  addProject,
  addTask,
  startSession,
  VISUAL_SCENARIO_CONFIRM_KIND,
  VISUAL_SCENARIO_PROMPT_KIND,
} from "../src/repository.ts";

const tempRoots: string[] = [];

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

test("visual scenario prompt evidence is not exposed as a visible output", async () => {
  const { paths, projectAlias } = await visibleOutputFixture(async ({ db, projectAlias, taskAlias }) => {
    addEvidence(db, projectAlias, {
      type: "prototype",
      targetType: "task",
      targetRef: taskAlias,
      status: "accepted",
      summary: "visual scenario prompt",
      payload: {
        kind: VISUAL_SCENARIO_PROMPT_KIND,
        html: "<main>Prompt-only prototype</main>",
        format: "html",
        prompt: "Show the approved dashboard direction.",
      },
    });
  });

  const snapshot = await buildDashboardSnapshot(paths, projectAlias);

  expect(snapshot.outputs).toHaveLength(0);
  expect(snapshot.evidence).toHaveLength(1);
  expect(snapshot.evidence[0]?.media).toBeNull();
});

test("visual scenario confirm remains visible without a duplicate prompt card", async () => {
  const { paths, projectAlias, confirmAlias } = await visibleOutputFixture(async ({ db, projectAlias, taskAlias }) => {
    addEvidence(db, projectAlias, {
      type: "prototype",
      targetType: "task",
      targetRef: taskAlias,
      status: "accepted",
      summary: "visual scenario prompt",
      payload: {
        kind: VISUAL_SCENARIO_PROMPT_KIND,
        html: "<main>Prompt-only prototype</main>",
        format: "html",
        prompt: "Show the approved dashboard direction.",
      },
    });
    await writeFile(join(dbProjectPath(db, projectAlias), "scenario.png"), onePixelPng());
    const confirm = addEvidence(db, projectAlias, {
      type: "generated_image",
      targetType: "task",
      targetRef: taskAlias,
      status: "candidate",
      summary: "visual scenario confirm",
      payload: {
        kind: VISUAL_SCENARIO_CONFIRM_KIND,
        path: "scenario.png",
        prompt: "Show the approved dashboard direction.",
      },
    });
    return confirm.alias;
  });

  const snapshot = await buildDashboardSnapshot(paths, projectAlias);

  expect(snapshot.outputs.map((output) => output.id)).toEqual([confirmAlias]);
  expect(snapshot.outputs[0]?.type).toBe("generated_image");
  expect(snapshot.outputs[0]?.visualScenario).toBe(true);
  expect(snapshot.outputs[0]?.needsApproval).toBe(true);
  expect(snapshot.outputs[0]?.renderableImage).toBe(true);
});

test("prototype visual scenario confirm remains visible and reviewable", async () => {
  const { paths, projectAlias, confirmAlias } = await visibleOutputFixture(({ db, projectAlias, taskAlias }) => {
    const confirm = addEvidence(db, projectAlias, {
      type: "prototype",
      targetType: "task",
      targetRef: taskAlias,
      status: "candidate",
      summary: "visual scenario prototype confirm",
      payload: {
        kind: VISUAL_SCENARIO_CONFIRM_KIND,
        html: "<main>Scenario prototype</main>",
        format: "html",
        prompt: "Show the approved dashboard direction.",
      },
    });
    return confirm.alias;
  });

  const snapshot = await buildDashboardSnapshot(paths, projectAlias);

  expect(snapshot.outputs.map((output) => output.id)).toEqual([confirmAlias]);
  expect(snapshot.outputs[0]?.type).toBe("prototype");
  expect(snapshot.outputs[0]?.kind).toBe("html");
  expect(snapshot.outputs[0]?.needsApproval).toBe(true);
});

async function visibleOutputFixture<T>(
  seed: (input: { db: ReturnType<typeof openDatabase>; projectAlias: string; taskAlias: string }) => T | Promise<T>,
): Promise<{ paths: ReturnType<typeof getArdexPaths>; projectAlias: string; taskAlias: string; confirmAlias: Awaited<T> }> {
  const root = await tempRoot();
  const projectPath = join(root, "project");
  await mkdir(projectPath);
  const paths = getArdexPaths(join(root, "ardex"));
  await initializeStorage(paths);
  const db = openDatabase(paths);
  try {
    const project = await addProject(db, projectPath);
    startSession(db, project.alias, { goal: "visible outputs" });
    const task = addTask(db, project.alias, { title: "confirm visible output", qualityGate: "visual" });
    const confirmAlias = await seed({ db, projectAlias: project.alias, taskAlias: task.alias });
    return { paths, projectAlias: project.alias, taskAlias: task.alias, confirmAlias };
  } finally {
    db.close();
  }
}

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ardex-visible-output-data-test-"));
  tempRoots.push(root);
  return root;
}

function onePixelPng(): Buffer {
  return Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64");
}

function dbProjectPath(db: ReturnType<typeof openDatabase>, projectAlias: string): string {
  const row = db.query("SELECT path FROM projects WHERE alias = ?").get(projectAlias) as { path: string } | null;
  if (row === null) {
    throw new Error(`missing project ${projectAlias}`);
  }
  return row.path;
}

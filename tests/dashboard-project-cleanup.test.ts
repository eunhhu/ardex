import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleDashboardRequest } from "../src/dashboard.ts";
import { initializeStorage } from "../src/daemon.ts";
import { openDatabase } from "../src/db.ts";
import { getArdexPaths } from "../src/paths.ts";
import { addProject } from "../src/repository.ts";

const tempRoots: string[] = [];

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
  delete process.env.ARDEX_CODEX_HOME;
});

test("dashboard project cleanup endpoints rename and archive projects", async () => {
  const { paths, first, second } = await projectFixture();

  const renamed = await postJson(paths, `/api/projects/${first}/rename`, { name: "Renamed Project" });
  expect(renamed.data.project.name).toBe("Renamed Project");

  const archived = await postJson(paths, `/api/projects/${first}/archive`, {});
  expect(archived.data.project.id).toBeDefined();
  expect(typeof archived.data.project.archivedAt).toBe("string");

  const projects = await getJson(paths, "/api/projects");
  expect(projects.data.projects.map((project: any) => project.id)).toEqual([second]);
  expect(projects.data.projects.some((project: any) => project.name === "Renamed Project")).toBe(false);
});

test("dashboard snapshots hide archived projects from project lists", async () => {
  const { paths, first, second } = await projectFixture();

  await postJson(paths, `/api/projects/${first}/archive`, {});

  const visibleDashboard = await getJson(paths, `/api/projects/${second}/dashboard`);
  expect(visibleDashboard.data.project.id).toBe(second);
  expect(visibleDashboard.data.projects.map((project: any) => project.id)).toEqual([second]);

  const archivedDashboard = await getJson(paths, `/api/projects/${first}/dashboard`);
  expect(archivedDashboard.data.project).toBeNull();
  expect(archivedDashboard.data.projects.map((project: any) => project.id)).toEqual([second]);
});

test("dashboard artifact previews allow Codex generated images", async () => {
  const root = await tempRoot();
  process.env.ARDEX_CODEX_HOME = join(root, "codex");
  const generatedRoot = join(process.env.ARDEX_CODEX_HOME, "generated_images", "agent");
  await mkdir(generatedRoot, { recursive: true });
  const imagePath = join(generatedRoot, "scenario.png");
  await writeFile(imagePath, onePixelPng());
  const { paths, first } = await projectFixture();

  const response = await handleDashboardRequest(new Request(`http://127.0.0.1:17373/api/projects/${first}/artifacts?path=${encodeURIComponent(imagePath)}`), paths);

  expect(response?.status).toBe(200);
  expect(response?.headers.get("content-type")).toBe("image/png");
});

async function projectFixture() {
  const root = await tempRoot();
  const firstPath = join(root, "first");
  const secondPath = join(root, "second");
  await mkdir(firstPath);
  await mkdir(secondPath);
  const paths = getArdexPaths(join(root, "ardex"));
  await initializeStorage(paths);
  const db = openDatabase(paths);
  try {
    const first = await addProject(db, firstPath);
    const second = await addProject(db, secondPath);
    return { paths, first: first.alias, second: second.alias };
  } finally {
    db.close();
  }
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
  const root = await mkdtemp(join(tmpdir(), "ardex-dashboard-cleanup-test-"));
  tempRoots.push(root);
  return root;
}

function onePixelPng(): Buffer {
  return Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64");
}

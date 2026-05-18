import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const assetDir = join(dirname(fileURLToPath(import.meta.url)), "..", "web");
const dashboardAssets = new Map([
  ["index.html", "text/html; charset=utf-8"],
  ["styles.css", "text/css; charset=utf-8"],
  ["css/base.css", "text/css; charset=utf-8"],
  ["css/topbar.css", "text/css; charset=utf-8"],
  ["css/command-menu.css", "text/css; charset=utf-8"],
  ["css/layout.css", "text/css; charset=utf-8"],
  ["css/items.css", "text/css; charset=utf-8"],
  ["css/forms.css", "text/css; charset=utf-8"],
  ["css/responsive.css", "text/css; charset=utf-8"],
  ["app.js", "text/javascript; charset=utf-8"],
  ["js/api.js", "text/javascript; charset=utf-8"],
  ["js/dom.js", "text/javascript; charset=utf-8"],
  ["js/format.js", "text/javascript; charset=utf-8"],
  ["js/render.js", "text/javascript; charset=utf-8"],
  ["js/state.js", "text/javascript; charset=utf-8"],
]);

export async function dashboardAssetResponse(pathname: string): Promise<Response | null> {
  const assetPath = pathname === "/" ? "index.html" : pathname.slice(1);
  const contentType = dashboardAssets.get(assetPath);
  if (contentType === undefined) {
    return null;
  }
  const body = await readFile(join(assetDir, assetPath), "utf8");
  return new Response(body, {
    headers: {
      "cache-control": "no-store",
      "content-type": contentType,
    },
  });
}

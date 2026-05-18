import { readFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const assetDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "web-dist");

export async function dashboardAssetResponse(pathname: string): Promise<Response | null> {
  let assetPath: string;
  try {
    assetPath = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  } catch {
    return null;
  }
  const filePath = resolve(assetDir, assetPath);
  if (filePath !== assetDir && !filePath.startsWith(assetDir + sep)) {
    return null;
  }
  try {
    const body = await readFile(filePath);
    return new Response(body, {
      headers: {
        "cache-control": "no-store",
        "content-type": contentTypeFor(filePath),
      },
    });
  } catch {
    return null;
  }
}

function contentTypeFor(path: string): string {
  if (/\.html$/i.test(path)) return "text/html; charset=utf-8";
  if (/\.css$/i.test(path)) return "text/css; charset=utf-8";
  if (/\.[cm]?js$/i.test(path)) return "text/javascript; charset=utf-8";
  if (/\.svg$/i.test(path)) return "image/svg+xml";
  if (/\.png$/i.test(path)) return "image/png";
  if (/\.webp$/i.test(path)) return "image/webp";
  if (/\.ico$/i.test(path)) return "image/x-icon";
  return "application/octet-stream";
}

import { readFile } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { extname, join, normalize, sep } from "node:path";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".map": "application/json",
};

/** Serves a file of the built web bundle; `/` is `index.html`. Anything outside `root` is a 404. */
export async function serveStatic(root: string, urlPath: string, response: ServerResponse) {
  let relative: string;
  try {
    relative = decodeURIComponent(urlPath);
  } catch {
    response.writeHead(400).end();
    return;
  }
  if (relative === "/") relative = "/index.html";
  // Hazard: the request path is untrusted, so the resolved file must stay inside the bundle folder.
  const file = normalize(join(root, relative));
  if (!file.startsWith(root + sep)) {
    response.writeHead(404).end();
    return;
  }
  try {
    const body = await readFile(file);
    response.writeHead(200, {
      "content-type": CONTENT_TYPES[extname(file)] ?? "application/octet-stream",
    });
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
}

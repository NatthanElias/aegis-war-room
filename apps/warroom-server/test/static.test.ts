import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type RunningServer, startServer } from "../src/server.ts";

let root: string;
let server: RunningServer;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "wr-static-"));
  const webDist = join(root, "dist");
  await mkdir(join(webDist, "assets"), { recursive: true });
  await writeFile(join(webDist, "index.html"), "<div id=root>shell page</div>");
  await writeFile(join(webDist, "assets", "app.js"), "export {};");
  await writeFile(join(root, "secret.txt"), "outside the bundle");
  server = await startServer({
    port: 0,
    host: "127.0.0.1",
    incidentId: "test-inc",
    incidentsDir: join(root, "incidents"),
    sandboxUrl: "http://127.0.0.1:1",
    webDist,
  });
});

afterEach(async () => {
  await server.close();
  await rm(root, { recursive: true, force: true });
});

/** A raw request, so the path reaches the server exactly as written (fetch would normalize `..`). */
function get(path: string): Promise<{ status: number; type: string | undefined; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port: server.port, path }, (response) => {
      let body = "";
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () =>
        resolve({ status: response.statusCode ?? 0, type: response.headers["content-type"], body }),
      );
    });
    req.on("error", reject);
    req.end();
  });
}

describe("static files", () => {
  test("serves the bundle at / and under /assets", async () => {
    const page = await get("/?user=alice");
    expect(page.status).toBe(200);
    expect(page.type).toContain("text/html");
    expect(page.body).toBe("<div id=root>shell page</div>");

    const script = await get("/assets/app.js");
    expect(script.status).toBe(200);
    expect(script.type).toContain("text/javascript");
  });

  test("refuses paths that leave the bundle folder", async () => {
    for (const path of [
      "/%2e%2e/secret.txt",
      "/..%2fsecret.txt",
      "/assets/%2e%2e/%2e%2e/secret.txt",
    ]) {
      const response = await get(path);
      expect(response.status).toBe(404);
      expect(response.body).not.toContain("outside the bundle");
    }
  });
});

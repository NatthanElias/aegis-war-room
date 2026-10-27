import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

export interface FakeSandbox {
  readonly url: string;
  /** The status code `GET /healthz` answers from now on. */
  setStatus(status: number): void;
  close(): Promise<void>;
}

export async function startFakeSandbox(): Promise<FakeSandbox> {
  let status = 200;
  const server = createServer((_request, response) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: status === 200 ? "ok" : "starting" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    setStatus(next) {
      status = next;
    },
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

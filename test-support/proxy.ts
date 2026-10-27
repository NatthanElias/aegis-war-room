import type { AddressInfo } from "node:net";
import { connect, createServer, type Server, type Socket } from "node:net";

export interface DatabaseProxy {
  readonly port: number;
  /** TCP connections accepted so far, whether they were refused or forwarded. */
  readonly attempts: number;
  /** Forward new connections to this server from now on. */
  forwardTo(host: string, port: number): void;
  /** Close every new connection at once, like a database that is not accepting clients. */
  refuse(): void;
  close(): Promise<void>;
}

/** A TCP proxy in front of PostgreSQL that starts out refusing connections. */
export async function startProxy(): Promise<DatabaseProxy> {
  let target: { host: string; port: number } | undefined;
  let attempts = 0;
  const sockets = new Set<Socket>();

  const server: Server = createServer((client) => {
    attempts++;
    sockets.add(client);
    client.on("close", () => sockets.delete(client));
    client.on("error", () => undefined);
    if (target === undefined) {
      client.destroy();
      return;
    }
    const upstream = connect(target.port, target.host);
    sockets.add(upstream);
    upstream.on("close", () => {
      sockets.delete(upstream);
      client.destroy();
    });
    upstream.on("error", () => client.destroy());
    client.on("close", () => upstream.destroy());
    client.pipe(upstream);
    upstream.pipe(client);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  return {
    port: (server.address() as AddressInfo).port,
    get attempts() {
      return attempts;
    },
    forwardTo(host, port) {
      target = { host, port };
    },
    refuse() {
      target = undefined;
    },
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

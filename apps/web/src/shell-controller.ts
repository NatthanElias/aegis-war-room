import { connectShell } from "@warroom/contracts";
import { createReconnector } from "./reconnect.ts";
import {
  type ConnectionSnapshot,
  initialConnection,
  isRefusal,
  reduceConnection,
} from "./shell-view.ts";

/** Connects the shell and keeps reconnecting until stopped, except after a refusal. Returns `stop`. */
export function startShell(url: string, onChange: (snapshot: ConnectionSnapshot) => void) {
  let snapshot = initialConnection;
  let current: { close(): void } | undefined;
  let stopped = false;

  const publish = (next: ConnectionSnapshot) => {
    snapshot = next;
    onChange(snapshot);
  };

  const reconnector = createReconnector(() => {
    if (stopped) return;
    publish(reduceConnection(snapshot, { type: "attempt" }));
    open();
  });

  function open() {
    current = connectShell(url, {
      onState: (state) => publish(reduceConnection(snapshot, { type: "state", state })),
      onClose: (close) => {
        publish(reduceConnection(snapshot, { type: "closed", close }));
        // Why: a refused user would otherwise retry every 2 s forever and flicker the error screen.
        if (!isRefusal(snapshot)) reconnector.closed();
      },
    });
  }

  onChange(snapshot);
  open();
  return () => {
    stopped = true;
    reconnector.stop();
    current?.close();
  };
}

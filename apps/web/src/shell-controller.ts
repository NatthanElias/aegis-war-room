import {
  connectWarroom,
  type Phase,
  type Severity,
  type WarroomConnection,
} from "@warroom/contracts";
import {
  type IncidentEvent,
  type IncidentSnapshot,
  initialIncident,
  reduceIncident,
  rejectionCode,
} from "./incident-view.ts";
import { createReconnector } from "./reconnect.ts";
import {
  type ConnectionSnapshot,
  initialConnection,
  isRefusal,
  reduceConnection,
} from "./shell-view.ts";

export interface ShellController {
  stop(): void;
  /** Asks the server to move the phase. Resolves or rejects after the call; the outcome also reaches `onIncident`. */
  setPhase(phase: Phase): Promise<void>;
  setSev(sev: Severity): Promise<void>;
}

/**
 * Connects the shell and the incident over one socket and keeps reconnecting until stopped, except after a refusal.
 * `onChange` gets the connection; `onIncident` gets the incident, its pending call, and the last rejection.
 */
export function startShell(
  url: string,
  onChange: (snapshot: ConnectionSnapshot) => void,
  onIncident: (snapshot: IncidentSnapshot) => void = () => {},
): ShellController {
  let snapshot = initialConnection;
  let incident = initialIncident;
  let current: WarroomConnection | undefined;
  let stopped = false;

  const publish = (next: ConnectionSnapshot) => {
    snapshot = next;
    onChange(snapshot);
  };
  const publishIncident = (event: IncidentEvent) => {
    incident = reduceIncident(incident, event);
    onIncident(incident);
  };

  const reconnector = createReconnector(() => {
    if (stopped) return;
    publish(reduceConnection(snapshot, { type: "attempt" }));
    open();
  });

  function open() {
    current = connectWarroom(url, {
      onShell: (state) => publish(reduceConnection(snapshot, { type: "state", state })),
      onIncident: (state) => publishIncident({ type: "state", state }),
      onClose: (close) => {
        publish(reduceConnection(snapshot, { type: "closed", close }));
        publishIncident({ type: "connection-lost" });
        // Why: a refused user would otherwise retry every 2 s forever and flicker the error screen.
        if (!isRefusal(snapshot)) reconnector.closed();
      },
    });
  }

  async function call(start: (connection: WarroomConnection) => Promise<void>): Promise<void> {
    const connection = current;
    if (connection === undefined) return;
    publishIncident({ type: "call-started" });
    try {
      await start(connection);
      if (connection === current) publishIncident({ type: "call-resolved" });
    } catch (error) {
      // Why: a rejection that arrives after a reconnect belongs to the old socket and must not show on the new one.
      if (connection === current)
        publishIncident({ type: "call-rejected", code: rejectionCode(error) });
    }
  }

  onChange(snapshot);
  onIncident(incident);
  open();
  return {
    stop() {
      stopped = true;
      reconnector.stop();
      current?.close();
    },
    setPhase: (phase) => call((connection) => connection.setPhase(phase)),
    setSev: (sev) => call((connection) => connection.setSev(sev)),
  };
}

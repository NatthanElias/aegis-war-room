import { createHost, type WebSocketLike, webSocketLink } from "@earendil-works/chord";
import { Incident, type IncidentState, type Phase, type Severity } from "./incident.ts";
import { Shell, type ShellState } from "./shell.ts";

export interface ShellClose {
  readonly code: number;
  /** True when the connection had received a state before the socket closed. */
  readonly afterLive: boolean;
}

export interface ShellCallbacks {
  /** Called with every state, the first call being the initial snapshot. */
  onState(state: ShellState): void;
  onClose(close: ShellClose): void;
}

export interface ShellConnection {
  close(): void;
}

export interface WarroomCallbacks {
  /** Holds `warroom.shell` when given. Called with every state, the first call being the initial snapshot. */
  onShell?(state: ShellState): void;
  /** Holds `warroom.incident` on the same socket when given. Same delivery as `onShell`. */
  onIncident?(state: IncidentState): void;
  onClose(close: ShellClose): void;
}

export interface WarroomConnection {
  close(): void;
  /** Resolves after the server committed the move; rejects with the server's Chord error (`forbidden`, `invalid`). */
  setPhase(phase: Phase): Promise<void>;
  setSev(sev: Severity): Promise<void>;
}

/**
 * Opens one WebSocket to the war room server and holds `warroom.shell` and/or `warroom.incident` over it.
 * Used by the browser, the smoke script, and the tests, so all of them exercise the same client path.
 * Context: `afterLive` turns true when the first state of either object arrives.
 */
export function connectWarroom(
  url: string,
  callbacks: WarroomCallbacks,
  WebSocketImpl: typeof WebSocket = WebSocket,
): WarroomConnection {
  const socket = new WebSocketImpl(url);
  const host = createHost({ self: "browser", name: "browser", kind: "client" });
  let live = false;
  let closed = false;

  socket.addEventListener("close", ((event: { code: number }) => {
    if (closed) return;
    closed = true;
    callbacks.onClose({ code: event.code, afterLive: live });
  }) as () => void);

  // Context: the DOM `WebSocket` type and Chord's structural `WebSocketLike` differ only in `send`'s buffer types.
  host.connect(webSocketLink(socket as unknown as WebSocketLike), { principal: "server" });

  const { onShell } = callbacks;
  if (onShell) {
    host
      .get(Shell, {})
      .then((shell) => {
        if (closed) {
          shell.release();
          return;
        }
        live = true;
        const emit = () => {
          onShell({
            incidentId: shell.incidentId.value,
            conversationId: shell.conversationId.value,
            user: shell.user.value,
            sandbox: shell.sandbox.value,
          });
        };
        emit();
        for (const member of [shell.incidentId, shell.conversationId, shell.user, shell.sandbox]) {
          member.subscribe(emit);
        }
      })
      .catch(() => {
        // Context: a refused or dropped socket makes `get` fail; the close event above reports it.
      });
  }

  const { onIncident } = callbacks;
  const incident = onIncident ? host.get(Incident, {}) : undefined;
  incident
    ?.then((ref) => {
      if (closed) {
        ref.release();
        return;
      }
      live = true;
      const emit = () => {
        onIncident?.({ sev: ref.sev.value, phase: ref.phase.value, roster: ref.roster.value });
      };
      // Why: `subscribe` calls back at once with the current value, which would repeat the first state per member.
      let hydrated = false;
      for (const member of [ref.sev, ref.phase, ref.roster]) {
        member.subscribe(() => {
          if (hydrated) emit();
        });
      }
      hydrated = true;
      emit();
    })
    .catch(() => {
      // Context: same as the shell above; the close event reports a refused socket.
    });

  const notLive = () =>
    Promise.reject(new Error("warroom.incident is not held on this connection"));
  return {
    close() {
      if (closed) return;
      closed = true;
      socket.close(1000);
    },
    setPhase: (phase) => (incident ? incident.then((ref) => ref.setPhase({ phase })) : notLive()),
    setSev: (sev) => (incident ? incident.then((ref) => ref.setSev({ sev })) : notLive()),
  };
}

/** Opens one WebSocket and holds `warroom.shell` over it: the walking skeleton's client. */
export function connectShell(
  url: string,
  callbacks: ShellCallbacks,
  WebSocketImpl: typeof WebSocket = WebSocket,
): ShellConnection {
  const { close } = connectWarroom(
    url,
    { onShell: callbacks.onState, onClose: callbacks.onClose },
    WebSocketImpl,
  );
  return { close };
}

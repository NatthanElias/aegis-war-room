import { createHost, type WebSocketLike, webSocketLink } from "@earendil-works/chord";
import { Shell, type ShellState } from "./shell.ts";

export interface ShellClose {
  readonly code: number;
  /** True when the shell had received its state before the socket closed. */
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

/**
 * Opens one WebSocket to the war room server and holds `warroom.shell` over it.
 * Used by the browser, the smoke script, and the tests, so all of them exercise the same client path.
 */
export function connectShell(
  url: string,
  callbacks: ShellCallbacks,
  WebSocketImpl: typeof WebSocket = WebSocket,
): ShellConnection {
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
  host
    .get(Shell, {})
    .then((shell) => {
      if (closed) {
        shell.release();
        return;
      }
      live = true;
      const emit = () => {
        callbacks.onState({
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

  return {
    close() {
      if (closed) return;
      closed = true;
      socket.close(1000);
    },
  };
}

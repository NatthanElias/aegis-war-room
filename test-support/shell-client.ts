import { connectShell, type ShellState } from "@warroom/contracts";

export interface OpenShell {
  readonly states: readonly ShellState[];
  latest(): ShellState;
  /**
   * Resolves with the first state at or after index `from` (now or later) that satisfies `predicate`,
   * or rejects after `timeoutMs`.
   */
  waitFor(
    predicate: (state: ShellState) => boolean,
    timeoutMs: number,
    from?: number,
  ): Promise<ShellState>;
  close(): void;
}

/** Connects like the browser does and resolves once the shell has its first state. */
export function openShell(port: number, user: string, timeoutMs = 5000): Promise<OpenShell> {
  const states: ShellState[] = [];
  const listeners = new Set<() => void>();
  return new Promise((resolve, reject) => {
    const connection = connectShell(`ws://127.0.0.1:${port}/chord?user=${user}`, {
      onState(state) {
        states.push(state);
        for (const listener of [...listeners]) listener();
        if (states.length === 1) resolve(shell);
      },
      onClose({ code }) {
        if (states.length === 0) reject(new Error(`shell closed with ${code} before any state`));
      },
    });
    const timer = setTimeout(() => reject(new Error("shell state did not arrive")), timeoutMs);
    timer.unref();
    const shell: OpenShell = {
      states,
      latest: () => states[states.length - 1] as ShellState,
      waitFor(predicate, ms, from = 0) {
        return new Promise((done, fail) => {
          const check = () => {
            const match = states.slice(from).find(predicate);
            if (match === undefined) return false;
            clearTimeout(deadline);
            listeners.delete(check);
            done(match);
            return true;
          };
          const deadline = setTimeout(() => {
            listeners.delete(check);
            fail(
              new Error(
                `no matching shell state within ${ms} ms; last: ${JSON.stringify(states.at(-1))}`,
              ),
            );
          }, ms);
          if (!check()) listeners.add(check);
        });
      },
      close: () => connection.close(),
    };
  });
}

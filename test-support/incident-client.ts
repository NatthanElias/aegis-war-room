import { connectWarroom, type IncidentState, type Phase, type Severity } from "@warroom/contracts";

export interface OpenIncident {
  /** Every state this connection received, the first being the initial snapshot. */
  readonly states: readonly IncidentState[];
  latest(): IncidentState;
  /**
   * Resolves with the first state at or after index `from` (now or later) that satisfies `predicate`,
   * or rejects after `timeoutMs`.
   */
  waitFor(
    predicate: (state: IncidentState) => boolean,
    timeoutMs: number,
    from?: number,
  ): Promise<IncidentState>;
  setPhase(phase: Phase): Promise<void>;
  setSev(sev: Severity): Promise<void>;
  close(): void;
}

/** Connects like the browser does and resolves once `warroom.incident` has its first state. */
export function openIncident(port: number, user: string, timeoutMs = 5000): Promise<OpenIncident> {
  const states: IncidentState[] = [];
  const listeners = new Set<() => void>();
  return new Promise((resolve, reject) => {
    const connection = connectWarroom(`ws://127.0.0.1:${port}/chord?user=${user}`, {
      onIncident(state) {
        states.push(state);
        for (const listener of [...listeners]) listener();
        if (states.length === 1) resolve(incident);
      },
      onClose({ code }) {
        if (states.length === 0) reject(new Error(`incident closed with ${code} before any state`));
      },
    });
    const timer = setTimeout(() => reject(new Error("incident state did not arrive")), timeoutMs);
    timer.unref();
    const incident: OpenIncident = {
      states,
      latest: () => states[states.length - 1] as IncidentState,
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
                `no matching incident state within ${ms} ms; last: ${JSON.stringify(states.at(-1))}`,
              ),
            );
          }, ms);
          if (!check()) listeners.add(check);
        });
      },
      setPhase: (phase) => connection.setPhase(phase),
      setSev: (sev) => connection.setSev(sev),
      close: () => connection.close(),
    };
  });
}

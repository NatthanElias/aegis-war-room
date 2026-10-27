export const RECONNECT_DELAY_MS = 2000;

export interface Reconnector {
  /** Call after every socket close: asks for a new socket after the delay. */
  closed(): void;
  stop(): void;
}

export function createReconnector(connect: () => void, delayMs = RECONNECT_DELAY_MS): Reconnector {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    closed() {
      clearTimeout(timer);
      timer = setTimeout(connect, delayMs);
    },
    stop() {
      clearTimeout(timer);
      timer = undefined;
    },
  };
}

import type { Telemetry } from "./telemetry.ts";

/** Public test BINs, never real cards: Visa 411111 and 424242, Mastercard 555555, 510510, and 222300. */
export const TEST_BINS = ["411111", "424242", "555555", "510510", "222300"] as const;

/** The generator starts no new authorization while this many are in flight. */
export const MAX_IN_FLIGHT = 50;

const MAX_RATE = 1000;

/** `TRAFFIC_RATE` authorizations per second: 0 when unset or empty; a bad value fails at startup like `MIGRATE_TIMEOUT_MS`. */
export function resolveTrafficRate(env: Record<string, string | undefined>): number {
  const raw = env.TRAFFIC_RATE;
  if (raw === undefined || raw === "") return 0;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > MAX_RATE) {
    throw new Error(`TRAFFIC_RATE must be an integer from 0 to ${MAX_RATE}, got "${raw}"`);
  }
  return value;
}

/** The Luhn check digit that makes `partial` plus that digit a valid card number. */
export function luhnCheckDigit(partial: string): number {
  let sum = 0;
  for (let i = 0; i < partial.length; i++) {
    let digit = Number(partial[partial.length - 1 - i]);
    // The check digit will sit to the right, so the rightmost digit of `partial` is doubled first.
    if (i % 2 === 0) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return (10 - (sum % 10)) % 10;
}

/** A 16-digit Luhn-valid card number that starts with `bin`. */
export function syntheticPan(bin: string, random: () => number = Math.random): string {
  let digits = bin;
  while (digits.length < 15) digits += Math.floor(random() * 10);
  return digits + luhnCheckDigit(digits);
}

export interface TrafficOptions {
  readonly ratePerSec: number;
  readonly authorize: (pan: string, amountCents: number) => Promise<unknown>;
  readonly telemetry: Telemetry;
  readonly random?: () => number;
}

/**
 * Starts synthetic traffic: one authorization per tick without waiting for it, cycling through `TEST_BINS`,
 * with amounts from 500 to 20,000 cents. A tick is skipped and counted as dropped while `MAX_IN_FLIGHT`
 * authorizations are in flight. A rate of 0 starts nothing.
 */
export function startTraffic(options: TrafficOptions): { stop(): void } {
  if (options.ratePerSec === 0) return { stop() {} };
  const random = options.random ?? Math.random;
  let next = 0;
  const timer = setInterval(() => {
    if (options.telemetry.inFlight >= MAX_IN_FLIGHT) {
      options.telemetry.recordDropped();
      return;
    }
    const bin = TEST_BINS[next++ % TEST_BINS.length] as string;
    const amountCents = 500 + Math.floor(random() * 19_501);
    // A failed authorization is already recorded as ERROR in telemetry; nothing else needs it.
    options.authorize(syntheticPan(bin, random), amountCents).catch(() => undefined);
  }, 1000 / options.ratePerSec);
  return {
    stop() {
      clearInterval(timer);
    },
  };
}

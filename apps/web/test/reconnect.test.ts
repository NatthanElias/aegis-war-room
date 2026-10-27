import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createReconnector } from "../src/reconnect.ts";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("reconnect scheduler", () => {
  test("reconnects after 2000 ms from every close", () => {
    const connect = vi.fn();
    const reconnector = createReconnector(connect);

    reconnector.closed();
    vi.advanceTimersByTime(1999);
    expect(connect).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(connect).toHaveBeenCalledTimes(1);

    reconnector.closed();
    vi.advanceTimersByTime(1999);
    expect(connect).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(connect).toHaveBeenCalledTimes(2);
  });

  test("a stopped scheduler asks for no new socket", () => {
    const connect = vi.fn();
    const reconnector = createReconnector(connect);

    reconnector.closed();
    reconnector.stop();
    vi.advanceTimersByTime(10_000);

    expect(connect).not.toHaveBeenCalled();
  });
});

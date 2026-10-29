import type { AlertInput } from "@warroom/contracts";
import { type Static, type TSchema, Type } from "typebox";
import Value from "typebox/value";

/** A body that an adapter cannot turn into alerts. `detail` names the failing JSON pointer and why. */
export class InvalidAlertError extends Error {
  readonly code = "invalid_alert";
  readonly detail: string;

  constructor(detail: string) {
    super(`invalid_alert: ${detail}`);
    this.detail = detail;
  }
}

/** One monitoring source: reads that tool's own webhook body into internal alerts. */
export interface Adapter {
  /** Throws `InvalidAlertError` when `body` is not what the tool sends. */
  parse(body: unknown): AlertInput[];
}

/**
 * Checks `value` against `schema` and throws `InvalidAlertError` naming the first failing field.
 * Context: a missing property is reported at the property (`/alerts/0/fingerprint`), not at its parent object.
 */
export function assertShape<T extends TSchema>(
  schema: T,
  value: unknown,
): asserts value is Static<T> {
  if (Value.Check(schema, value)) return;
  const [first] = Value.Errors(schema, value);
  if (first === undefined) throw new InvalidAlertError("/ does not match the schema");
  const missing = first.keyword === "required" ? first.params.requiredProperties : undefined;
  if (Array.isArray(missing) && typeof missing[0] === "string") {
    throw new InvalidAlertError(`${first.instancePath}/${missing[0]} is required`);
  }
  throw new InvalidAlertError(`${first.instancePath || "/"} ${first.message}`);
}

/** A string-to-string map, the shape of labels in monitoring bodies. */
export const StringMapSchema = Type.Record(Type.String(), Type.String());

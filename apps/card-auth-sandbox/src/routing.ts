export type Brand = "visa" | "mastercard";
export type AcquirerName = "acquirer-alpha" | "acquirer-beta";

export interface Route {
  readonly brand: Brand;
  readonly acquirer: AcquirerName;
}

export const UNSUPPORTED_BIN = "unsupported_bin";

/**
 * Routes a card number, or a leading part of one, by its BIN: first digit `4` is Visa on `acquirer-alpha`;
 * `51`-`55` and `2221`-`2720` are Mastercard on `acquirer-beta`. Anything else is `unsupported_bin`.
 * Context: the table is code, not data, until Scenario B (US-15) decides how routing configuration rolls out.
 */
export function routeBin(prefix: string): Route | typeof UNSUPPORTED_BIN {
  if (!/^\d+$/.test(prefix)) return UNSUPPORTED_BIN;
  if (prefix.startsWith("4")) return { brand: "visa", acquirer: "acquirer-alpha" };
  const two = prefix.length >= 2 ? Number(prefix.slice(0, 2)) : Number.NaN;
  if (two >= 51 && two <= 55) return { brand: "mastercard", acquirer: "acquirer-beta" };
  const four = prefix.length >= 4 ? Number(prefix.slice(0, 4)) : Number.NaN;
  if (four >= 2221 && four <= 2720) return { brand: "mastercard", acquirer: "acquirer-beta" };
  return UNSUPPORTED_BIN;
}

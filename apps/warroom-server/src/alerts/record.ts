import type { Draft } from "@earendil-works/chord";
import type { Alert, AlertInput } from "@warroom/contracts";
import type { IncidentDoc } from "../incident-store.ts";

/** One answer per alert in the request body, in body order. */
export type AlertEntry =
  | { alertId: string; fingerprint: string; status: "accepted" | "duplicate" | "resolved" }
  | { fingerprint: string; status: "ignored" };

export interface AppliedAlerts {
  readonly entries: AlertEntry[];
  /** Alerts that got a new ID; only these count against the rate limit. */
  readonly newCount: number;
}

const idNumber = (id: string) => Number(id.slice("AL-".length));
const formatId = (n: number) => `AL-${String(n).padStart(2, "0")}`;

/**
 * Matches `alerts` against the document in body order and writes the result into `doc`.
 * A firing alert is new unless a firing alert with the same source and fingerprint exists; a resolution marks
 * that firing alert resolved, or is ignored when there is none.
 * Hazard: call it only inside `commitIncident`, so matching and ID allocation see one serialized document.
 * IDs are one above the highest stored ID and alerts are never deleted, so an ID is never reused.
 */
export function applyAlerts(
  doc: Draft<IncidentDoc>,
  alerts: readonly AlertInput[],
  receivedAt: string,
): AppliedAlerts {
  const entries: AlertEntry[] = [];
  let newCount = 0;
  let next = Math.max(0, ...Object.keys(doc.alerts).map(idNumber)) + 1;
  const findFiring = (alert: AlertInput) =>
    Object.values(doc.alerts).find(
      (stored) =>
        stored.status === "firing" &&
        stored.source === alert.source &&
        stored.fingerprint === alert.fingerprint,
    );
  for (const alert of alerts) {
    const firing = findFiring(alert);
    if (alert.status === "resolved") {
      if (firing === undefined) {
        entries.push({ fingerprint: alert.fingerprint, status: "ignored" });
      } else {
        firing.status = "resolved";
        firing.resolvedAt = receivedAt;
        entries.push({ alertId: firing.id, fingerprint: alert.fingerprint, status: "resolved" });
      }
    } else if (firing !== undefined) {
      entries.push({ alertId: firing.id, fingerprint: alert.fingerprint, status: "duplicate" });
    } else {
      const id = formatId(next++);
      const record: Alert = {
        id,
        source: alert.source,
        fingerprint: alert.fingerprint,
        status: "firing",
        title: alert.title,
        labels: alert.labels ?? {},
        startedAt: alert.startedAt,
        receivedAt,
      };
      if (alert.severity !== undefined) record.severity = alert.severity;
      if (alert.summary !== undefined) record.summary = alert.summary;
      if (alert.url !== undefined) record.url = alert.url;
      doc.alerts[id] = record;
      newCount++;
      entries.push({ alertId: id, fingerprint: alert.fingerprint, status: "accepted" });
    }
  }
  return { entries, newCount };
}

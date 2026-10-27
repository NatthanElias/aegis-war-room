import type { Phase, Severity } from "@warroom/contracts";
import type { IncidentPanel as IncidentPanelView } from "./incident-view.ts";

interface Props {
  readonly panel: IncidentPanelView;
  readonly onSetPhase: (phase: Phase) => void;
  readonly onSetSev: (sev: Severity) => void;
}

/** Plain incident panel: severity, phase stepper, roster, and the Incident Commander's controls. */
export function IncidentPanel({ panel, onSetPhase, onSetSev }: Props) {
  if (panel.kind === "hidden") return null;
  const { controls } = panel;
  return (
    <section aria-labelledby="incident-heading">
      <h2 id="incident-heading">Incident</h2>
      <p>
        Severity: <strong data-testid="severity">{panel.sev}</strong>
      </p>
      <ol aria-label="Phases">
        {panel.phases.map(({ phase, current }) => (
          <li key={phase} aria-current={current ? "step" : undefined}>
            {phase}
            {current ? " (current)" : ""}
          </li>
        ))}
      </ol>
      <ul aria-label="Roster">
        {panel.roster.map(({ id, role }) => (
          <li key={id}>
            {id}: {role}
          </li>
        ))}
      </ul>
      {controls && (
        <div>
          <label>
            Set severity{" "}
            <select
              value={controls.severity.value}
              disabled={controls.severity.disabled}
              onChange={(event) => onSetSev(event.target.value as Severity)}
            >
              {controls.severity.options.map((sev) => (
                <option key={sev} value={sev}>
                  {sev}
                </option>
              ))}
            </select>
          </label>
          {controls.phases.map(({ to, disabled }) => (
            <button key={to} type="button" disabled={disabled} onClick={() => onSetPhase(to)}>
              Move to {to}
            </button>
          ))}
        </div>
      )}
      {panel.error && <p role="alert">The server rejected the change: {panel.error}</p>}
    </section>
  );
}

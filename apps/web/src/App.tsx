import { useEffect, useRef, useState } from "react";
import { IncidentPanel } from "./IncidentPanel.tsx";
import { type IncidentSnapshot, incidentPanel, initialIncident } from "./incident-view.ts";
import { type ShellController, startShell } from "./shell-controller.ts";
import { type ConnectionSnapshot, initialConnection, shellScreen } from "./shell-view.ts";

function chordUrl(): string {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  const user = new URLSearchParams(location.search).get("user");
  const query = user === null ? "" : `?user=${encodeURIComponent(user)}`;
  return `${scheme}://${location.host}/chord${query}`;
}

export function App() {
  const [snapshot, setSnapshot] = useState<ConnectionSnapshot>(initialConnection);
  const [incident, setIncident] = useState<IncidentSnapshot>(initialIncident);
  const controller = useRef<ShellController | undefined>(undefined);
  useEffect(() => {
    const started = startShell(chordUrl(), setSnapshot, setIncident);
    controller.current = started;
    return started.stop;
  }, []);
  const screen = shellScreen(snapshot);

  return (
    <main>
      <h1>War room</h1>
      {screen.kind === "connecting" && <p role="status">Connecting</p>}
      {screen.kind === "reconnecting" && <p role="status">Reconnecting</p>}
      {screen.kind === "unknown-user" && (
        <section>
          <p role="alert">Unknown user</p>
          <ul>
            {screen.links.map((link) => (
              <li key={link.user}>
                <a href={link.href}>{link.user}</a>
              </li>
            ))}
          </ul>
        </section>
      )}
      {screen.kind === "connected" && (
        <dl>
          <dt>User</dt>
          <dd>{screen.state.user.id}</dd>
          <dt>Role</dt>
          <dd>{screen.state.user.role}</dd>
          <dt>Incident</dt>
          <dd>{screen.state.incidentId}</dd>
          <dt>Conversation</dt>
          <dd>{screen.state.conversationId}</dd>
          <dt>Sandbox</dt>
          <dd>{screen.state.sandbox}</dd>
        </dl>
      )}
      <IncidentPanel
        panel={incidentPanel(screen, incident)}
        onSetPhase={(phase) => void controller.current?.setPhase(phase)}
        onSetSev={(sev) => void controller.current?.setSev(sev)}
      />
    </main>
  );
}

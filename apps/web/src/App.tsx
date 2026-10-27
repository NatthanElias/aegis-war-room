import { useEffect, useState } from "react";
import { startShell } from "./shell-controller.ts";
import { type ConnectionSnapshot, initialConnection, shellScreen } from "./shell-view.ts";

function chordUrl(): string {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  const user = new URLSearchParams(location.search).get("user");
  const query = user === null ? "" : `?user=${encodeURIComponent(user)}`;
  return `${scheme}://${location.host}/chord${query}`;
}

export function App() {
  const [snapshot, setSnapshot] = useState<ConnectionSnapshot>(initialConnection);
  useEffect(() => startShell(chordUrl(), setSnapshot), []);
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
    </main>
  );
}

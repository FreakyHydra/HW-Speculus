import { useState } from 'react';
import type { DiagnosticsSnapshot } from '../runtime/schema/types';
import type { SimulatorSession } from '../simulator/session';

const tabs = ['CONTEXT', 'PERCEPTION', 'CAST', 'RELATIONSHIP', 'PROVIDER', 'RAW'] as const;
type Tab = (typeof tabs)[number];

function contentFor(tab: Tab, snapshot: DiagnosticsSnapshot | undefined, session: SimulatorSession): unknown {
  if (!snapshot) return { status: 'No generated turn has produced diagnostics yet.' };
  if (tab === 'CONTEXT') return { prompt: snapshot.compiledContext.prompt, manifest: snapshot.compiledContext.manifest };
  if (tab === 'PERCEPTION') return snapshot.perception;
  if (tab === 'CAST') return snapshot.activeCast;
  if (tab === 'RELATIONSHIP') return { before: snapshot.relationshipBefore, event: snapshot.relationshipEvent, after: snapshot.relationshipAfter };
  if (tab === 'PROVIDER') return snapshot.provider;
  return session;
}

export function DiagnosticsPanel({ session }: { session: SimulatorSession }) {
  const [tab, setTab] = useState<Tab>('CONTEXT');
  const [selectedTurn, setSelectedTurn] = useState('');
  const snapshot = session.diagnostics.find((entry) => entry.turnId === selectedTurn) ?? session.diagnostics.at(-1);
  const output = JSON.stringify(contentFor(tab, snapshot, session), null, 2);
  return <section className="panel diagnostics-panel">
    <header className="panel-header"><span>DIAGNOSTICS</span><span className="lamp lamp-amber" /></header>
    <select aria-label="Diagnostic turn" value={snapshot?.turnId ?? ''} onChange={(event) => setSelectedTurn(event.target.value)}>
      {session.diagnostics.length === 0 && <option value="">NO TURN DATA</option>}
      {session.diagnostics.map((entry) => <option key={entry.turnId} value={entry.turnId}>{entry.turnId}</option>)}
    </select>
    <nav className="diagnostic-tabs" aria-label="Diagnostic views">
      {tabs.map((name) => <button className={tab === name ? 'active' : ''} key={name} onClick={() => setTab(name)}>{name}</button>)}
    </nav>
    <pre tabIndex={0}>{output}</pre>
    <button className="terminal-button copy-button" onClick={() => void navigator.clipboard?.writeText(output)}>COPY BUFFER</button>
  </section>;
}

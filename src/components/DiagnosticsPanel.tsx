import { useMemo, useState } from 'react';
import type { DiagnosticsSnapshot } from '../runtime/schema/types';
import type { SimulatorSession } from '../simulator/session';

const tabs = ['CONTEXT', 'PERCEPTION', 'CAST', 'RELATIONSHIP', 'PROVIDER', 'TURNS', 'RAW'] as const;
type Tab = (typeof tabs)[number];

type TurnGroup = {
  turnId: string;
  messages: SimulatorSession['transcript'];
};

function contentFor(tab: Exclude<Tab, 'TURNS'>, snapshot: DiagnosticsSnapshot | undefined, session: SimulatorSession): unknown {
  if (tab === 'RAW') return session;
  if (!snapshot) return { status: 'No generated turn has produced diagnostics yet.' };
  if (tab === 'CONTEXT') return { prompt: snapshot.compiledContext.prompt, manifest: snapshot.compiledContext.manifest };
  if (tab === 'PERCEPTION') return snapshot.perception;
  if (tab === 'CAST') return snapshot.activeCast;
  if (tab === 'RELATIONSHIP') return { before: snapshot.relationshipBefore, event: snapshot.relationshipEvent, after: snapshot.relationshipAfter };
  return snapshot.provider;
}

function groupTranscript(session: SimulatorSession): TurnGroup[] {
  const groups = new Map<string, TurnGroup>();
  for (const message of session.transcript) {
    const existing = groups.get(message.turnId);
    if (existing) existing.messages.push(message);
    else groups.set(message.turnId, { turnId: message.turnId, messages: [message] });
  }
  return [...groups.values()];
}

function printableTurns(groups: TurnGroup[]) {
  return groups.map((group) => {
    const heading = group.turnId.replace('turn:', 'TURN ');
    const messages = group.messages.map((message) =>
      `${message.sender.toUpperCase()} · ${message.speaker}\n${message.text}`,
    ).join('\n\n');
    return `${heading}\n${messages}`;
  }).join('\n\n========================================\n\n');
}

export function DiagnosticsPanel({ session }: { session: SimulatorSession }) {
  const [tab, setTab] = useState<Tab>('CONTEXT');
  const [selectedTurn, setSelectedTurn] = useState('');
  const snapshot = session.diagnostics.find((entry) => entry.turnId === selectedTurn) ?? session.diagnostics.at(-1);
  const turnGroups = useMemo(() => groupTranscript(session), [session.transcript]);
  const selectedTranscriptTurn = snapshot?.turnId.replace(/:(player|character)$/, '') ?? '';
  const jsonOutput = tab === 'TURNS' ? '' : JSON.stringify(contentFor(tab, snapshot, session), null, 2);
  const copyOutput = tab === 'TURNS' ? printableTurns(turnGroups) : jsonOutput;

  return <section className="panel diagnostics-panel">
    <header className="panel-header"><span>DIAGNOSTICS</span><span className="lamp lamp-amber" /></header>
    <select aria-label="Diagnostic turn" value={snapshot?.turnId ?? ''} onChange={(event) => setSelectedTurn(event.target.value)}>
      {session.diagnostics.length === 0 && <option value="">NO TURN DATA</option>}
      {session.diagnostics.map((entry) => <option key={entry.turnId} value={entry.turnId}>{entry.turnId}</option>)}
    </select>
    <nav className="diagnostic-tabs" aria-label="Diagnostic views">
      {tabs.map((name) => <button className={tab === name ? 'active' : ''} key={name} onClick={() => setTab(name)}>{name}</button>)}
    </nav>
    {tab === 'TURNS' ? <div className="diagnostic-turns" tabIndex={0}>
      {turnGroups.length === 0 && <div className="diagnostic-turns__empty">NO TRANSCRIPT DATA</div>}
      {turnGroups.map((group) => <section className={`diagnostic-turn ${group.turnId === selectedTranscriptTurn ? 'is-selected' : ''}`} key={group.turnId}>
        <header>{group.turnId.replace('turn:', 'TURN ')}</header>
        {group.messages.map((message) => <article className={`diagnostic-turn__message ${message.sender}`} key={message.id}>
          <div className="diagnostic-turn__meta"><strong>{message.speaker}</strong><span>{message.sender.toUpperCase()}</span></div>
          <div className="diagnostic-turn__text">{message.text}</div>
        </article>)}
      </section>)}
    </div> : <pre tabIndex={0}>{jsonOutput}</pre>}
    <button className="terminal-button copy-button" onClick={() => void navigator.clipboard?.writeText(copyOutput)}>COPY BUFFER</button>
  </section>;
}

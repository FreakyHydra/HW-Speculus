import { useMemo, useState } from 'react';
import { stripModelControlTokens } from '../runtime/generation/format';
import type { DiagnosticsSnapshot } from '../runtime/schema/types';
import type { SimulatorSession } from '../simulator/session';

const tabs = [
  { value: 'CONTEXT', label: 'CONTEXT' },
  { value: 'KNOWLEDGE', label: 'KNOWLEDGE' },
  { value: 'PERCEPTION', label: 'PERCEPTION' },
  { value: 'CAST', label: 'CAST' },
  { value: 'RELATIONSHIP', label: 'RELATIONS' },
  { value: 'PROVIDER', label: 'PROVIDER' },
  { value: 'REROLL', label: 'REROLL' },
  { value: 'TURNS', label: 'TURNS' },
  { value: 'RAW', label: 'RAW' },
] as const;
type Tab = (typeof tabs)[number]['value'];

type TurnGroup = {
  turnId: string;
  messages: SimulatorSession['transcript'];
};

type DiagnosticsPanelProps = {
  session: SimulatorSession;
  busy: boolean;
  onExportRaw: () => void;
  onImportRaw: () => void;
  onExitSimulator: () => void;
};

function knowledgeView(snapshot: DiagnosticsSnapshot) {
  return {
    rule: 'Treat only observed, spoken, packaged, or explicitly provided facts as available knowledge. Unknown remains unknown.',
    sceneFacts: snapshot.perception.sceneFacts,
    visibleSubjects: snapshot.perception.visibleSubjects,
    mentionedNames: snapshot.perception.mentionedNames,
    filteredOrUnavailable: snapshot.perception.filtered,
  };
}

function rerollView(snapshot: DiagnosticsSnapshot) {
  if (!snapshot.previousReply) return { status: 'This turn has not been rerolled.' };
  return {
    previousReply: cleanTranscriptText(snapshot.previousReply),
    replacementReply: cleanTranscriptText(snapshot.finalReply),
    note: 'The replacement is canonical for the current simulator state; the previous reply is retained here only for comparison.',
  };
}

function contentFor(tab: Exclude<Tab, 'TURNS'>, snapshot: DiagnosticsSnapshot | undefined, session: SimulatorSession): unknown {
  if (tab === 'RAW') return session;
  if (!snapshot) return { status: 'No generated turn has produced diagnostics yet.' };
  if (tab === 'CONTEXT') return { prompt: snapshot.compiledContext.prompt, manifest: snapshot.compiledContext.manifest };
  if (tab === 'KNOWLEDGE') return knowledgeView(snapshot);
  if (tab === 'PERCEPTION') return snapshot.perception;
  if (tab === 'CAST') return snapshot.activeCast;
  if (tab === 'RELATIONSHIP') return { before: snapshot.relationshipBefore, event: snapshot.relationshipEvent, after: snapshot.relationshipAfter };
  if (tab === 'REROLL') return rerollView(snapshot);
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

function cleanTranscriptText(value: string): string {
  return stripModelControlTokens(value).trim();
}

function printableTurns(groups: TurnGroup[]) {
  return groups.map((group) => {
    const heading = group.turnId.replace('turn:', 'TURN ');
    const messages = group.messages.map((message) =>
      `${message.sender.toUpperCase()} · ${message.speaker}\n${cleanTranscriptText(message.text)}`,
    ).join('\n\n');
    return `${heading}\n${messages}`;
  }).join('\n\n========================================\n\n');
}

export function DiagnosticsPanel({ session, busy, onExportRaw, onImportRaw, onExitSimulator }: DiagnosticsPanelProps) {
  const [tab, setTab] = useState<Tab>('CONTEXT');
  const [selectedTurn, setSelectedTurn] = useState('');
  const snapshot = session.diagnostics.find((entry) => entry.turnId === selectedTurn) ?? session.diagnostics.at(-1);
  const turnGroups = useMemo(() => groupTranscript(session), [session.transcript]);
  const selectedTranscriptTurn = snapshot?.turnId.replace(/:(player|character)$/, '') ?? '';
  const jsonOutput = tab === 'TURNS' ? '' : JSON.stringify(contentFor(tab, snapshot, session), null, 2);
  const copyOutput = tab === 'TURNS' ? printableTurns(turnGroups) : jsonOutput;
  const contextTokens = snapshot?.compiledContext.manifest.estimatedInputTokens;
  const contextSections = snapshot?.compiledContext.manifest.includedSections.length;

  return <section className="panel diagnostics-panel">
    <header className="panel-header"><span>INSPECTOR / DEBUG</span><span><i className="lamp lamp-amber" /> LIVE</span></header>
    <div className="diagnostic-turn-picker">
      <label htmlFor="diagnostic-turn">TURN</label>
      <select id="diagnostic-turn" aria-label="Diagnostic turn" value={snapshot?.turnId ?? ''} onChange={(event) => setSelectedTurn(event.target.value)}>
        {session.diagnostics.length === 0 && <option value="">NO TURN DATA</option>}
        {session.diagnostics.map((entry) => <option key={entry.turnId} value={entry.turnId}>{entry.turnId}</option>)}
      </select>
    </div>
    <div className="diagnostic-stats">
      <span>CTX {typeof contextTokens === 'number' ? `~${contextTokens.toLocaleString()} TOK` : '—'}</span>
      <span>SECTIONS {typeof contextSections === 'number' ? contextSections : '—'}</span>
      <span>MESSAGES {snapshot?.compiledContext.manifest.includedMessages ?? '—'}</span>
    </div>
    <nav className="diagnostic-tabs" aria-label="Diagnostic views">
      {tabs.map(({ value, label }) => <button className={tab === value ? 'active' : ''} key={value} onClick={() => setTab(value)}>{label}</button>)}
    </nav>
    {tab === 'TURNS' ? <div className="diagnostic-turns" tabIndex={0}>
      {turnGroups.length === 0 && <div className="diagnostic-turns__empty">NO TRANSCRIPT DATA</div>}
      {turnGroups.map((group) => <section className={`diagnostic-turn ${group.turnId === selectedTranscriptTurn ? 'is-selected' : ''}`} key={group.turnId}>
        <header>{group.turnId.replace('turn:', 'TURN ')}</header>
        {group.messages.map((message) => <article className={`diagnostic-turn__message ${message.sender}`} key={message.id}>
          <div className="diagnostic-turn__meta"><strong>{message.speaker}</strong><span>{message.sender.toUpperCase()}</span></div>
          <div className="diagnostic-turn__text">{cleanTranscriptText(message.text)}</div>
        </article>)}
      </section>)}
    </div> : <pre tabIndex={0}>{jsonOutput}</pre>}
    <div className="diagnostic-actions">
      <button
        className="terminal-button"
        onClick={() => void navigator.clipboard?.writeText(copyOutput)}
      >COPY BUFFER</button>
      <button className="terminal-button" disabled={busy} onClick={onExportRaw}>EXPORT RAW</button>
      <button className="terminal-button" disabled={busy} onClick={onImportRaw}>IMPORT RAW</button>
      <button
        className="terminal-button exit-button"
        disabled={busy}
        onClick={onExitSimulator}
      >EXIT SIMULATOR</button>
    </div>
  </section>;
}

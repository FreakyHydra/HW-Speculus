import { useState } from 'react';
import type { V2Diagnostics, V2Session } from '../runtime/session';
import { assetsFor, perceptionFor } from '../runtime/world';

export function V2DiagnosticsPanel({ session, rejected }: { session: V2Session; rejected: V2Diagnostics | null }) {
  const [tab, setTab] = useState<'state' | 'context' | 'events'>('state');
  const diagnostic = rejected ?? session.turns.at(-1)?.diagnostics;
  const view = perceptionFor(session.world, session.launch.character?.id ?? session.launch.persona.id);
  const location = assetsFor(session.launch).find((asset) => asset.id === session.world.locationId)?.name;
  return <aside className="v2-panel v2-diagnostics" aria-label="Diagnostics"><h2>Diagnostics</h2>
    <div className="v2-tabs" role="tablist" aria-label="Diagnostics view">{(['state', 'context', 'events'] as const).map((name) => <button type="button" role="tab" id={`v2-tab-${name}`} aria-controls="v2-diagnostic-content" aria-selected={tab === name} key={name} onClick={() => setTab(name)}>{name}</button>)}</div>
    <div role="tabpanel" id="v2-diagnostic-content" aria-labelledby={`v2-tab-${tab}`}>
      {tab === 'state' && <>
        <section className="v2-instrument"><h3>World state</h3><dl><dt>Location</dt><dd>{location ?? 'Not anchored'}</dd><dt>Elapsed world time</dt><dd>{session.world.elapsedSeconds} seconds</dd><dt>State revision</dt><dd>{session.world.revision}</dd><dt>Scene presence</dt><dd>{session.world.locationId ? session.world.actors.filter((actor) => actor.locationId === session.world.locationId).map((actor) => actor.name).join(', ') || 'None' : 'Unknown'}</dd></dl></section>
        <section className="v2-instrument"><h3>Perception</h3><p>{view.presentActors.length ? view.presentActors.map((actor) => actor.name).join(', ') : 'Subject presence is not anchored.'}</p><small>Knowledge is actor-local. Other records do not become present automatically.</small></section>
        <section className="v2-instrument"><h3>Memory</h3><p>{view.knownFacts.length} explicit known facts</p>{view.knownFacts.map((fact, index) => <p key={index}>{fact}</p>)}<small>{session.turns.length} committed exchanges. Only recent exchanges enter the prompt; semantic long-term recall is not implemented.</small></section>
        <section className="v2-instrument"><h3>Validation</h3><p className={rejected ? 'v2-error-text' : ''}>{rejected ? 'Draft rejected / no commit' : diagnostic ? 'Structural checks passed' : 'Awaiting generation'}</p>{diagnostic?.issues.map((issue) => <p key={issue}>{issue}</p>)}<small>Physical state is protected from prose writes. This is not full semantic canon validation.</small></section>
      </>}
      {tab === 'context' && (diagnostic ? <>
        <section className="v2-instrument"><h3>Generation packet</h3><dl><dt>Input tokens (estimate)</dt><dd>~{diagnostic.estimatedInputTokens.toLocaleString()}</dd><dt>Output allowance</dt><dd>{diagnostic.outputBudget} tokens</dd><dt>Model</dt><dd>{diagnostic.model}</dd><dt>Completion</dt><dd>{diagnostic.completionStatus}</dd><dt>Duration</dt><dd>{(diagnostic.durationMs / 1000).toFixed(1)}s</dd></dl></section>
        <details className="v2-instrument" open><summary>Included</summary><ul>{diagnostic.included.map((value, index) => <li key={index}>{value}</li>)}</ul></details>
        <details className="v2-instrument"><summary>Omitted ({diagnostic.omitted.length})</summary><ul>{diagnostic.omitted.map((value, index) => <li key={index}>{value}</li>)}</ul></details>
        <details className="v2-instrument"><summary>Compiled prompt</summary><pre>{diagnostic.prompt}</pre></details>
        {diagnostic.warnings.map((warning) => <p className="v2-note" key={warning}>{warning}</p>)}
      </> : <p className="v2-note">The first generation will record its exact prompt and settings here.</p>)}
      {tab === 'events' && <><p className="v2-note">Operator changes and accepted replies only. Rerolls replace the same turn event.</p>{session.events.length ? <ol className="v2-events">{session.events.slice(-100).reverse().map((event) => <li key={event.id}><strong>{event.label}</strong><small>{event.kind} / state r{event.worldRevision}</small></li>)}</ol> : <p>No committed events.</p>}{session.events.length > 100 && <small>Latest 100 shown. Export contains the full ledger.</small>}</>}
    </div>
  </aside>;
}

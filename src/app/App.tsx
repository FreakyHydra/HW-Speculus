import { useCallback, useEffect, useMemo, useState } from 'react';
import { BootScreen } from '../components/BootScreen';
import { DiagnosticsPanel } from '../components/DiagnosticsPanel';
import { ImportControls } from '../components/ImportControls';
import { Transcript } from '../components/Transcript';
import { BrowserProvider } from '../runtime/providers/browser';
import { MockProvider } from '../runtime/providers/mock';
import type { ProviderAdapter } from '../runtime/providers/types';
import type { CharacterCard, Persona, TranscriptMessage } from '../runtime/schema/types';
import { getRelationship } from '../runtime/relationships/core';
import { deleteCharacterTurn, runTurn } from '../simulator/engine';
import { createSession, withOpeningMessage, type SimulatorSession } from '../simulator/session';
import { loadSession, saveSession } from '../storage/session-storage';

function providerFor(session: SimulatorSession): ProviderAdapter {
  return session.settings.provider.kind === 'mock' ? new MockProvider() : new BrowserProvider(session.settings.provider.kind);
}

export function App() {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState(() => loadSession());
  const [input, setInput] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const skip = (event: KeyboardEvent) => { if (event.key === 'Escape') setBooting(false); };
    window.addEventListener('keydown', skip);
    return () => window.removeEventListener('keydown', skip);
  }, []);
  useEffect(() => saveSession(session), [session]);

  const update = (change: Partial<SimulatorSession>) => setSession((current) => ({ ...current, ...change, updatedAt: Date.now() }));
  const loadCharacter = (character: CharacterCard) => setSession((current) => withOpeningMessage({ ...current, character, scene: current.scene || character.scenario, transcript: [], diagnostics: [], relationships: {}, nextTurnNumber: 1 }));
  const loadPersona = (persona: Persona) => update({ persona });

  const submit = useCallback(async (text: string, reroll?: TranscriptMessage) => {
    setBusy(true); setError('');
    try {
      const next = await runTurn(session, text, providerFor(session), { rerollCharacterId: reroll?.id, apiToken: token || undefined });
      setSession(next);
      setInput('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The simulation turn failed.'); }
    finally { setBusy(false); }
  }, [session, token]);

  const relationship = useMemo(() => session.character && session.persona
    ? getRelationship(session.relationships, session.character.id, session.persona.id)
    : null, [session.character, session.persona, session.relationships]);

  if (booting) return <BootScreen onComplete={() => setBooting(false)} />;

  return <main className={`terminal-frame ${session.settings.crtMotion ? '' : 'motion-off'}`}>
    <div className="screen-noise" aria-hidden="true" />
    <header className="system-header">
      <div><span className="system-mark">SPC-82</span><h1>SPECULUS</h1><p>FIELD TERMINAL / CHARACTER BEHAVIOR LABORATORY</p></div>
      <div className="status-bank"><span><i className="lamp lamp-green" />CORE</span><span><i className={`lamp ${session.settings.provider.kind === 'mock' ? 'lamp-amber' : 'lamp-green'}`} />MODEL</span></div>
    </header>

    <div className="workstation">
      <aside className="panel subject-panel">
        <header className="panel-header"><span>SUBJECT</span><span>01</span></header>
        <dl>
          <dt>DESIGNATION</dt><dd>{session.character?.name ?? 'NOT LOADED'}</dd>
          <dt>PERSONA</dt><dd>{session.persona?.name ?? 'NOT LOADED'}</dd>
          <dt>LOCATION / SCENE</dt><dd>{session.scene || 'UNDEFINED'}</dd>
          <dt>RELATIONSHIP</dt><dd>{relationship ? `${relationship.label} / ${relationship.score}` : 'NO LINK'}</dd>
          <dt>SESSION CLOCK</dt><dd>{new Date(session.startedAt).toISOString().slice(11, 19)}</dd>
        </dl>
        <ImportControls onCharacter={loadCharacter} onPersona={loadPersona} />
        <label className="field-label">SCENE OPENING
          <textarea rows={5} value={session.scene} onChange={(event) => update({ scene: event.target.value })} placeholder="Describe the controlled scene..." />
        </label>
        <section className="control-group">
          <div className="micro-label">MODEL LINK</div>
          <label>PROVIDER<select value={session.settings.provider.kind} onChange={(event) => update({ settings: { ...session.settings, provider: { ...session.settings.provider, kind: event.target.value as 'mock' | 'novelai' | 'ollama' } } })}>
            <option value="mock">MOCK / TEST</option><option value="novelai">NOVELAI COMPATIBLE</option><option value="ollama">OLLAMA / LOCAL</option>
          </select></label>
          <label>MODEL<input value={session.settings.provider.model} onChange={(event) => update({ settings: { ...session.settings, provider: { ...session.settings.provider, model: event.target.value } } })} /></label>
          {session.settings.provider.kind !== 'mock' && <label>BASE URL<input value={session.settings.provider.baseUrl} placeholder={session.settings.provider.kind === 'ollama' ? 'http://127.0.0.1:11434' : 'server default'} onChange={(event) => update({ settings: { ...session.settings, provider: { ...session.settings.provider, baseUrl: event.target.value } } })} /></label>}
          {session.settings.provider.kind === 'novelai' && <label>ACCESS TOKEN<input type="password" autoComplete="off" value={token} placeholder="not persisted" onChange={(event) => setToken(event.target.value)} /></label>}
          <label className="toggle"><input type="checkbox" checked={session.settings.crtMotion} onChange={(event) => update({ settings: { ...session.settings, crtMotion: event.target.checked } })} /> CRT MOTION</label>
        </section>
      </aside>

      <section className="panel terminal-panel">
        <header className="panel-header"><span>TERMINAL</span><span>CHANNEL A</span></header>
        <Transcript messages={session.transcript} busy={busy} onReroll={(message) => {
          const player = session.transcript.slice(0, session.transcript.indexOf(message)).reverse().find((candidate) => candidate.sender === 'player');
          if (player) void submit(player.text, message);
        }} onDelete={(message) => setSession((current) => deleteCharacterTurn(current, message.id))} />
        <form className="composer" onSubmit={(event) => { event.preventDefault(); void submit(input); }}>
          <span aria-hidden="true">&gt;</span>
          <textarea aria-label="Player turn" rows={3} value={input} onChange={(event) => setInput(event.target.value)} placeholder="ENTER PLAYER TURN" />
          <button className="terminal-button send-button" disabled={busy}>TRANSMIT</button>
        </form>
        {error && <div className="error-line" role="alert">FAULT: {error}</div>}
        <footer className="terminal-actions">
          <button className="terminal-button" disabled={busy} onClick={() => setSession((current) => ({ ...createSession(), settings: current.settings }))}>NEW SESSION</button>
          <span>LOCAL AUTOSAVE: ACTIVE</span>
        </footer>
      </section>

      <DiagnosticsPanel session={session} />
    </div>
    <footer className="chassis-footer"><span>HOWLING WHISPERS RESEARCH DIVISION</span><span>UNIT S-001 / 1982</span></footer>
  </main>;
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BootScreen } from '../components/BootScreen';
import { DiagnosticsPanel } from '../components/DiagnosticsPanel';
import { Transcript } from '../components/Transcript';
import { BrowserProvider } from '../runtime/providers/browser';
import { getRelationship } from '../runtime/relationships/core';
import { parseClientLaunchPackage } from '../runtime/schema/launch-package';
import type { ClientLaunchPackage, TranscriptMessage } from '../runtime/schema/types';
import { deleteCharacterTurn, runTurn } from '../simulator/engine';
import { createSession, withOpeningMessage, type SimulatorSession } from '../simulator/session';
import { clearSession, loadSession, saveSession } from '../storage/session-storage';

type BootState = { status: 'receiving' | 'ready' | 'error'; error?: string };

async function claimLaunch(code: string): Promise<ClientLaunchPackage> {
  const response = await fetch(`/api/launch/${encodeURIComponent(code)}`);
  const body = await response.json() as { package?: unknown; error?: string };
  if (!response.ok) throw new Error(body.error || 'The Orbis simulation package could not be claimed.');
  return parseClientLaunchPackage(body.package);
}

export function App() {
  const [session, setSession] = useState<SimulatorSession | null>(null);
  const [boot, setBoot] = useState<BootState>({ status: 'receiving' });
  const [booting, setBooting] = useState(true);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const initialize = async () => {
      const launchCode = new URLSearchParams(window.location.search).get('launch');
      try {
        let next = loadSession();
        if (launchCode) {
          const launchPackage = await claimLaunch(launchCode);
          next = withOpeningMessage(createSession(Date.now(), launchPackage));
          window.history.replaceState({}, '', window.location.pathname);
        }
        if (!next?.launchPackage) throw new Error('NO SUBJECT MEDIUM DETECTED.');
        if (next.launchPackage.expiresAt <= Date.now()) {
          clearSession();
          throw new Error('SIMULATION MEDIUM EXPIRED.');
        }
        if (!cancelled) {
          setSession(next);
          setBoot({ status: 'ready' });
        }
      } catch (reason) {
        if (!cancelled) setBoot({ status: 'error', error: reason instanceof Error ? reason.message : 'NO SUBJECT MEDIUM DETECTED.' });
      }
    };
    void initialize();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const enter = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && boot.status === 'ready') setBooting(false);
    };
    window.addEventListener('keydown', enter);
    return () => window.removeEventListener('keydown', enter);
  }, [boot.status]);
  useEffect(() => { if (session) saveSession(session); }, [session]);

  const submit = useCallback(async (text: string, reroll?: TranscriptMessage) => {
    if (!session) return;
    setBusy(true);
    setError('');
    try {
      const next = await runTurn(session, text, new BrowserProvider(), { rerollCharacterId: reroll?.id });
      setSession(next);
      setInput('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The simulation turn failed.'); }
    finally { setBusy(false); }
  }, [session]);

  const relationship = useMemo(() => session?.character && session.persona
    ? getRelationship(session.relationships, session.character.id, session.persona.id)
    : null, [session]);

  if (booting || !session) {
    return <BootScreen
      status={boot.status}
      assetName={session?.launchPackage?.primaryAsset.name}
      error={boot.error}
      onComplete={() => setBooting(false)}
    />;
  }

  const source = session.launchPackage!.primaryAsset;
  const updateScene = (scene: string) => setSession((current) => current ? { ...current, scene, updatedAt: Date.now() } : current);

  return <main className={`terminal-frame ${session.settings.crtMotion ? '' : 'motion-off'}`}>
    <div className="screen-noise" aria-hidden="true" />
    <header className="system-header">
      <div><span className="system-mark">SPC-82</span><h1>SPECULUS</h1><p>FIELD TERMINAL / ORBIS SIMULATION RECEIVER</p></div>
      <div className="status-bank"><span><i className="lamp lamp-green" />CORE</span><span><i className="lamp lamp-green" />ORBIS</span><span><i className="lamp lamp-green" />MODEL</span></div>
    </header>

    <div className="workstation">
      <aside className="panel subject-panel">
        <header className="panel-header"><span>PACKAGE</span><span>VER. 1</span></header>
        <dl>
          <dt>PRIMARY ASSET</dt><dd>{source.name}</dd>
          <dt>ASSET TYPE</dt><dd>{source.type.toLocaleUpperCase('en-US')}</dd>
          <dt>SOURCE REVISION</dt><dd>{source.revision}</dd>
          <dt>ACTIVE SUBJECT</dt><dd>{session.character?.name ?? 'SIMULATION NARRATOR'}</dd>
          <dt>PERSONA</dt><dd>{session.persona?.name ?? 'PACKAGE FAULT'}</dd>
          <dt>RELATED RECORDS</dt><dd>{session.launchPackage!.relatedAssets.length}</dd>
          <dt>RELATIONSHIP</dt><dd>{relationship ? `${relationship.label} / ${relationship.score}` : 'NO LINK'}</dd>
          <dt>LAUNCH ID</dt><dd>{session.launchPackage!.launchId}</dd>
        </dl>
        <label className="field-label">ACTIVE SCENE
          <textarea rows={7} value={session.scene} onChange={(event) => updateScene(event.target.value)} />
        </label>
        <section className="control-group">
          <div className="micro-label">MODEL BRIDGE</div>
          <div className="data-readout"><span>ROUTE</span><strong>ORBIS SHARED API</strong></div>
          <div className="data-readout"><span>MODEL</span><strong>{session.settings.provider.model}</strong></div>
          <div className="data-readout"><span>CREDENTIAL</span><strong>SERVER SEALED</strong></div>
          <label className="toggle"><input type="checkbox" checked={session.settings.crtMotion} onChange={(event) => setSession({ ...session, settings: { ...session.settings, crtMotion: event.target.checked } })} /> CRT MOTION</label>
        </section>
      </aside>

      <section className="panel terminal-panel">
        <header className="panel-header"><span>TERMINAL</span><span>CHANNEL A</span></header>
        <Transcript messages={session.transcript} busy={busy} onReroll={(message) => {
          const player = session.transcript.slice(0, session.transcript.indexOf(message)).reverse().find((candidate) => candidate.sender === 'player');
          if (player) void submit(player.text, message);
        }} onDelete={(message) => setSession((current) => current ? deleteCharacterTurn(current, message.id) : current)} />
        <form className="composer" onSubmit={(event) => { event.preventDefault(); void submit(input); }}>
          <span aria-hidden="true">&gt;</span>
          <textarea aria-label="Player turn" rows={3} value={input} onChange={(event) => setInput(event.target.value)} placeholder="ENTER PLAYER TURN" />
          <button className="terminal-button send-button" disabled={busy}>TRANSMIT</button>
        </form>
        {error && <div className="error-line" role="alert">FAULT: {error}</div>}
        <footer className="terminal-actions">
          <button className="terminal-button" disabled={busy} onClick={() => {
            clearSession();
            setSession(null);
            setBooting(true);
            setBoot({ status: 'error', error: 'SIMULATION MEDIUM EJECTED.' });
          }}>END SIMULATION</button>
          <span>SESSION MEDIUM: ACTIVE</span>
        </footer>
      </section>

      <DiagnosticsPanel session={session} />
    </div>
    <footer className="chassis-footer"><span>HOWLING WHISPERS RESEARCH DIVISION</span><span>ORBIS LINK / UNIT S-001</span></footer>
  </main>;
}

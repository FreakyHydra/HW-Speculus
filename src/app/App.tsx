import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { BootScreen } from '../components/BootScreen';
import { DiagnosticsPanel } from '../components/DiagnosticsPanel';
import { Transcript } from '../components/Transcript';
import { BrowserProvider } from '../runtime/providers/browser';
import { getRelationship } from '../runtime/relationships/core';
import { parseClientLaunchPackage, resolveCatalogIdentity } from '../runtime/schema/launch-package';
import type { ClientLaunchPackage, TranscriptMessage } from '../runtime/schema/types';
import { deleteCharacterTurn, runTurn } from '../simulator/engine';
import { createSession, withOpeningMessage, type SimulatorSession } from '../simulator/session';
import { exportRawSession, rawSessionFilename, resumeRawSession } from '../storage/session-transfer';
import { clearSession, loadSession, saveSession } from '../storage/session-storage';

type BootState = { status: 'receiving' | 'ready' | 'error'; error?: string };
type ThemeMode = 'dark' | 'light' | 'auto';
type PaletteMode = 'blue' | 'green' | 'amber' | 'violet' | 'mono';
type SplitterSide = 'left' | 'right';
type PanelLayout = { left: number; right: number };

const PANEL_LAYOUT_KEY = 'speculus-panel-layout';
const DIAGNOSTICS_VISIBILITY_KEY = 'speculus-diagnostics-visible';
const PACKAGE_VISIBILITY_KEY = 'speculus-package-visible';
const PALETTE_KEY = 'speculus-palette';
const DEFAULT_PANEL_LAYOUT: PanelLayout = { left: 272, right: 500 };
const MIN_LEFT_PANEL = 220;
const MAX_LEFT_PANEL = 620;
const MIN_RIGHT_PANEL = 300;
const MAX_RIGHT_PANEL = 720;
const MIN_TERMINAL_PANEL = 420;
const SPLITTER_SPACE = 16;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function loadPanelLayout(): PanelLayout {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PANEL_LAYOUT_KEY) ?? '{}') as Partial<PanelLayout>;
    return {
      left: typeof parsed.left === 'number' ? clamp(parsed.left, MIN_LEFT_PANEL, MAX_LEFT_PANEL) : DEFAULT_PANEL_LAYOUT.left,
      right: typeof parsed.right === 'number' ? clamp(parsed.right, MIN_RIGHT_PANEL, MAX_RIGHT_PANEL) : DEFAULT_PANEL_LAYOUT.right,
    };
  } catch {
    return DEFAULT_PANEL_LAYOUT;
  }
}

function loadDiagnosticsVisible() {
  return window.localStorage.getItem(DIAGNOSTICS_VISIBILITY_KEY) === 'true';
}

function loadPackageVisible() {
  return window.localStorage.getItem(PACKAGE_VISIBILITY_KEY) !== 'false';
}

function loadPalette(): PaletteMode {
  const saved = window.localStorage.getItem(PALETTE_KEY);
  return saved === 'green' || saved === 'amber' || saved === 'violet' || saved === 'mono' ? saved : 'blue';
}

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
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = window.localStorage.getItem('speculus-theme');
    return saved === 'light' || saved === 'auto' || saved === 'dark' ? saved : 'dark';
  });
  const [palette, setPalette] = useState<PaletteMode>(loadPalette);
  const [panelLayout, setPanelLayout] = useState<PanelLayout>(loadPanelLayout);
  const [diagnosticsVisible, setDiagnosticsVisible] = useState(loadDiagnosticsVisible);
  const [packageVisible, setPackageVisible] = useState(loadPackageVisible);
  const [dragging, setDragging] = useState<SplitterSide | null>(null);
  const workstationRef = useRef<HTMLDivElement>(null);
  const importSessionRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('speculus-theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.palette = palette;
    window.localStorage.setItem(PALETTE_KEY, palette);
  }, [palette]);

  useEffect(() => {
    window.localStorage.setItem(PANEL_LAYOUT_KEY, JSON.stringify(panelLayout));
  }, [panelLayout]);

  useEffect(() => {
    window.localStorage.setItem(DIAGNOSTICS_VISIBILITY_KEY, String(diagnosticsVisible));
  }, [diagnosticsVisible]);

  useEffect(() => {
    window.localStorage.setItem(PACKAGE_VISIBILITY_KEY, String(packageVisible));
  }, [packageVisible]);

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

  const resizePanel = useCallback((side: SplitterSide, requestedWidth: number) => {
    const workstation = workstationRef.current;
    if (!workstation) return;
    const available = workstation.getBoundingClientRect().width;
    setPanelLayout((current) => {
      if (side === 'left') {
        const reservedRight = diagnosticsVisible ? current.right : 0;
        const reservedSplitters = (diagnosticsVisible ? SPLITTER_SPACE : SPLITTER_SPACE / 2);
        const max = Math.max(MIN_LEFT_PANEL, Math.min(MAX_LEFT_PANEL, available - reservedRight - MIN_TERMINAL_PANEL - reservedSplitters));
        return { ...current, left: clamp(requestedWidth, MIN_LEFT_PANEL, max) };
      }
      const reservedLeft = packageVisible ? current.left : 0;
      const reservedSplitters = packageVisible ? SPLITTER_SPACE : SPLITTER_SPACE / 2;
      const max = Math.max(MIN_RIGHT_PANEL, Math.min(MAX_RIGHT_PANEL, available - reservedLeft - MIN_TERMINAL_PANEL - reservedSplitters));
      return { ...current, right: clamp(requestedWidth, MIN_RIGHT_PANEL, max) };
    });
  }, [diagnosticsVisible, packageVisible]);

  useEffect(() => {
    if (!dragging) return;
    document.body.classList.add('speculus-panel-resizing');
    const move = (event: PointerEvent) => {
      const rect = workstationRef.current?.getBoundingClientRect();
      if (!rect) return;
      resizePanel(dragging, dragging === 'left' ? event.clientX - rect.left : rect.right - event.clientX);
    };
    const stop = () => setDragging(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop, { once: true });
    window.addEventListener('pointercancel', stop, { once: true });
    return () => {
      document.body.classList.remove('speculus-panel-resizing');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, [dragging, resizePanel]);

  const startResize = (side: SplitterSide, event: ReactPointerEvent<HTMLDivElement>) => {
    if (window.matchMedia('(max-width: 1050px)').matches) return;
    event.preventDefault();
    setDragging(side);
  };

  const resetPanel = (side: SplitterSide) => {
    resizePanel(side, DEFAULT_PANEL_LAYOUT[side]);
  };

  const resizeWithKeyboard = (side: SplitterSide, event: ReactKeyboardEvent<HTMLDivElement>) => {
    let delta = 0;
    if (side === 'left') {
      if (event.key === 'ArrowLeft') delta = -20;
      if (event.key === 'ArrowRight') delta = 20;
    } else {
      if (event.key === 'ArrowLeft') delta = 20;
      if (event.key === 'ArrowRight') delta = -20;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      resetPanel(side);
      return;
    }
    if (!delta) return;
    event.preventDefault();
    resizePanel(side, panelLayout[side] + delta);
  };

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
  const catalog = resolveCatalogIdentity(session.launchPackage!);
  const updateScene = (scene: string) => setSession((current) => current ? { ...current, scene, updatedAt: Date.now() } : current);
  const exportSession = () => {
    try {
      const blob = new Blob([exportRawSession(session)], { type: 'application/json' });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = rawSessionFilename(session);
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(href);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The raw session could not be exported.');
    }
  };
  const importSession = async (file: File | undefined) => {
    if (!file) return;
    try {
      const raw = await file.text();
      setSession((current) => current ? resumeRawSession(current, raw) : current);
      setInput('');
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The raw session could not be imported.');
    } finally {
      if (importSessionRef.current) importSessionRef.current.value = '';
    }
  };
  const endSimulation = () => {
    clearSession();
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.assign(`https://lib.thehowlingwhispers.com/asset/${encodeURIComponent(source.id)}`);
  };
  const workstationStyle = {
    '--package-panel-width': `${panelLayout.left}px`,
    '--diagnostics-panel-width': `${panelLayout.right}px`,
  } as CSSProperties;

  return <main className={`terminal-frame ${session.settings.crtMotion ? '' : 'motion-off'}`}>
    <div className="screen-noise" aria-hidden="true" />
    <header className="system-header">
      <div className="system-identity"><span className="system-mark" title={catalog.classification}>{catalog.code}</span><h1>SPECULUS</h1><p>FIELD TERMINAL / ORBIS SIMULATION RECEIVER</p></div>
      <div className="header-controls">
        <div className="status-bank"><span><i className="lamp lamp-green" />CORE</span><span><i className="lamp lamp-green" />ORBIS</span><span><i className="lamp lamp-green" />MODEL</span></div>
        <nav className="view-controls" aria-label="Workstation views">
          <button type="button" className={packageVisible ? 'active' : ''} aria-pressed={packageVisible} onClick={() => { setDragging(null); setPackageVisible((visible) => !visible); }}>PACKAGE</button>
          <button type="button" className={diagnosticsVisible ? 'active debug-active' : ''} aria-pressed={diagnosticsVisible} onClick={() => { setDragging(null); setDiagnosticsVisible((visible) => !visible); }}><i className={`lamp ${diagnosticsVisible ? 'lamp-amber' : ''}`} /> DEBUG</button>
        </nav>
        <details className="display-menu">
          <summary>DISPLAY</summary>
          <section className="display-menu__panel">
            <span className="display-menu__label">PHOSPHOR COLOR</span>
            <div className="palette-grid" role="group" aria-label="Phosphor color">
              {([
                ['blue', 'BLUE MOON'],
                ['green', 'GREEN'],
                ['amber', 'AMBER'],
                ['violet', 'VIOLET'],
                ['mono', 'MONO'],
              ] as const).map(([value, label]) => <button type="button" key={value} className={palette === value ? 'active' : ''} aria-pressed={palette === value} onClick={() => setPalette(value)}><i className={`palette-swatch palette-swatch--${value}`} />{label}</button>)}
            </div>
            <label>BRIGHTNESS
              <select value={theme} onChange={(event) => setTheme(event.target.value as ThemeMode)}>
                <option value="dark">NIGHT</option>
                <option value="light">DAY</option>
                <option value="auto">SYSTEM</option>
              </select>
            </label>
            <label className="toggle"><input type="checkbox" checked={session.settings.crtMotion} onChange={(event) => setSession({ ...session, settings: { ...session.settings, crtMotion: event.target.checked } })} /> CRT MOTION</label>
          </section>
        </details>
      </div>
    </header>

    <div ref={workstationRef} className={`workstation resizable-workstation ${dragging ? 'is-resizing' : ''} ${diagnosticsVisible ? '' : 'diagnostics-hidden'} ${packageVisible ? '' : 'package-hidden'}`} style={workstationStyle}>
      {packageVisible && <aside className="panel subject-panel">
        <header className="panel-header"><span>PACKAGE</span><span>VER. 1</span></header>
        <section className="subject-summary" aria-label="Active simulation summary">
          <div><span>SUBJECT</span><strong>{session.character?.name ?? 'SIMULATION NARRATOR'}</strong></div>
          <div><span>PERSONA</span><strong>{session.persona?.name ?? 'PACKAGE FAULT'}</strong></div>
          <div><span>RELATION</span><strong>{relationship ? `${relationship.label} / ${relationship.score}` : 'NO LINK'}</strong></div>
        </section>
        <label className="field-label">ACTIVE SCENE
          <textarea rows={5} value={session.scene} onChange={(event) => updateScene(event.target.value)} />
        </label>
        <details className="panel-disclosure">
          <summary>PACKAGE MANIFEST <span>{source.type.toLocaleUpperCase('en-US')} / {session.launchPackage!.relatedAssets.length} LINKED</span></summary>
          <dl>
            <dt>SPECULUS ID</dt><dd>{catalog.code}</dd>
            <dt>CLASSIFICATION</dt><dd>{catalog.classification}</dd>
            <dt>PRIMARY ASSET</dt><dd>{source.name}</dd>
            <dt>ASSET TYPE</dt><dd>{source.type.toLocaleUpperCase('en-US')}</dd>
            <dt>SOURCE REVISION</dt><dd>{source.revision}</dd>
            <dt>RELATED RECORDS</dt><dd>{session.launchPackage!.relatedAssets.length}</dd>
            <dt>LAUNCH ID</dt><dd>{session.launchPackage!.launchId}</dd>
          </dl>
        </details>
        <details className="panel-disclosure">
          <summary>CONTROL DECK <span>DISPLAY / RESPONSE</span></summary>
          <section className="control-group">
            <div className="micro-label">MODEL BRIDGE</div>
            <div className="data-readout"><span>ROUTE</span><strong>ORBIS SHARED API</strong></div>
            <div className="data-readout"><span>MODEL</span><strong>{session.settings.provider.model}</strong></div>
            <div className="data-readout"><span>CREDENTIAL</span><strong>SERVER SEALED</strong></div>
            <div className="data-readout"><span>DISPLAY</span><strong>{palette.toLocaleUpperCase('en-US')} / {theme.toLocaleUpperCase('en-US')}</strong></div>
          </section>
        </details>
      </aside>}

      {packageVisible && <div
        className="panel-splitter panel-splitter--left"
        role="separator"
        aria-label="Resize package and terminal panels"
        aria-orientation="vertical"
        aria-valuemin={MIN_LEFT_PANEL}
        aria-valuemax={MAX_LEFT_PANEL}
        aria-valuenow={Math.round(panelLayout.left)}
        tabIndex={0}
        title="Drag to resize. Double-click or press Home to reset."
        onPointerDown={(event) => startResize('left', event)}
        onDoubleClick={() => resetPanel('left')}
        onKeyDown={(event) => resizeWithKeyboard('left', event)}
      ><span aria-hidden="true" /></div>}

      <section className="panel terminal-panel">
        <header className="panel-header">
          <span>TERMINAL</span>
          <span className="panel-header-actions">
            <span>CHANNEL A</span>
            <button
              type="button"
              className="panel-visibility-button"
              aria-expanded={diagnosticsVisible}
              aria-controls="diagnostics-panel"
              onClick={() => {
                setDragging(null);
                setDiagnosticsVisible((visible) => !visible);
              }}
            >{diagnosticsVisible ? 'CLOSE DEBUG' : 'OPEN DEBUG'}</button>
          </span>
        </header>
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
          <input ref={importSessionRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(event) => void importSession(event.target.files?.[0])} />
          <span><i className="lamp lamp-green" /> SESSION ACTIVE</span>
          <span className="terminal-actions-hint">COMPOSER TOOLS BELOW INPUT</span>
        </footer>
      </section>

      {diagnosticsVisible && <aside className="debug-drawer" aria-label="Debug inspector" style={{ '--diagnostics-panel-width': `${panelLayout.right}px` } as CSSProperties}>
        <div
          className="panel-splitter panel-splitter--right"
          role="separator"
          aria-label="Resize terminal and diagnostics panels"
          aria-orientation="vertical"
          aria-valuemin={MIN_RIGHT_PANEL}
          aria-valuemax={MAX_RIGHT_PANEL}
          aria-valuenow={Math.round(panelLayout.right)}
          tabIndex={0}
          title="Drag to resize. Double-click or press Home to reset."
          onPointerDown={(event) => startResize('right', event)}
          onDoubleClick={() => resetPanel('right')}
          onKeyDown={(event) => resizeWithKeyboard('right', event)}
        ><span aria-hidden="true" /></div>

        <div id="diagnostics-panel">
          <DiagnosticsPanel
            session={session}
            busy={busy}
            onExportRaw={exportSession}
            onImportRaw={() => importSessionRef.current?.click()}
            onExitSimulator={endSimulation}
          />
        </div>
      </aside>}
    </div>
    <footer className="chassis-footer"><span>HOWLING WHISPERS RESEARCH DIVISION</span><span>ORBIS LINK / UNIT S-001</span></footer>
  </main>;
}

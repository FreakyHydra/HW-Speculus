import { useEffect, useMemo, useState } from 'react';

type BootStatus = 'receiving' | 'ready' | 'error';

export function BootScreen(props: { status: BootStatus; assetName?: string; error?: string; onComplete: () => void }) {
  const lines = useMemo(() => {
    const systemDate = new Date().toISOString().slice(0, 10);
    const head = ['SPECULUS FIELD TERMINAL', `SYSTEM DATE: ${systemDate}`, `SYSTEM VERSION: ${__SPECULUS_UPDATE_DATE__}`, '', 'MEMORY CHECK ........ OK', 'SIMULATION CORE ..... OK'];
    if (props.status === 'receiving') return [...head, 'ORBIS DATA BUS ...... SEARCHING', '', 'AWAITING SYSTEM MEDIUM...'];
    if (props.status === 'error') return [
      ...head,
      'ORBIS DATA BUS ...... NO SIGNAL',
      '',
      'BOOT FAILURE: SIMULATION PACKAGE NOT FOUND',
      '',
      props.error || 'NO SUBJECT MEDIUM DETECTED.',
      'INSERT ORBIS DATA CARTRIDGE AND RESTART.',
      '',
      'SYSTEM HALTED.',
    ];
    return [
      ...head,
      'ORBIS DATA BUS ...... CONNECTED',
      'PACKAGE INTEGRITY ... VERIFIED',
      `SUBJECT DATA ........ ${props.assetName?.toLocaleUpperCase('en-US') || 'LOADED'}`,
      'PERSONA LINK ........ LOADED',
      'MODEL BRIDGE ........ READY',
      '',
      'READY.',
    ];
  }, [props.status, props.assetName, props.error]);
  const [visible, setVisible] = useState(1);
  useEffect(() => setVisible(1), [lines]);
  useEffect(() => {
    if (visible < lines.length) {
      const timer = window.setTimeout(() => setVisible((count) => count + 1), 90);
      return () => window.clearTimeout(timer);
    }
    if (props.status === 'ready') {
      const done = window.setTimeout(props.onComplete, 350);
      return () => window.clearTimeout(done);
    }
  }, [visible, lines.length, props]);
  return (
    <main className={`boot-screen boot-${props.status}`} aria-label="Speculus startup sequence">
      <div className="boot-copy">
        {lines.slice(0, visible).map((line, index) => <div className={line.startsWith('BOOT FAILURE') || line === 'SYSTEM HALTED.' ? 'boot-fault' : ''} key={`${line}-${index}`}>{line || '\u00a0'}</div>)}
        <span className="cursor" aria-hidden="true">█</span>
      </div>
      {props.status === 'ready' && <button className="terminal-button boot-skip" onClick={props.onComplete}>ENTER TERMINAL [ESC]</button>}
    </main>
  );
}

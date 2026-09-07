import { useEffect, useState } from 'react';

const bootLines = [
  'SPECULUS FIELD TERMINAL',
  'SYSTEM DATE: 1982',
  'MEMORY CHECK ........ OK',
  'SIMULATION CORE ..... OK',
  'PERSONA BUS ......... STANDBY',
  'MODEL LINK .......... OFFLINE',
  '',
  'READY.',
];

export function BootScreen({ onComplete }: { onComplete: () => void }) {
  const [visible, setVisible] = useState(1);
  useEffect(() => {
    if (visible >= bootLines.length) {
      const done = window.setTimeout(onComplete, 350);
      return () => window.clearTimeout(done);
    }
    const timer = window.setTimeout(() => setVisible((count) => count + 1), 115);
    return () => window.clearTimeout(timer);
  }, [visible, onComplete]);
  return (
    <main className="boot-screen" aria-label="Speculus startup sequence">
      <div className="boot-copy">
        {bootLines.slice(0, visible).map((line, index) => <div key={`${line}-${index}`}>{line || '\u00a0'}</div>)}
        <span className="cursor" aria-hidden="true">█</span>
      </div>
      <button className="terminal-button boot-skip" onClick={onComplete}>SKIP BOOT [ESC]</button>
    </main>
  );
}

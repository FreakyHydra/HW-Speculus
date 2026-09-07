import { useRef, useState } from 'react';
import { createTemporaryPersona, importCharacterCard, importPersona } from '../runtime/schema/importers';
import type { CharacterCard, Persona } from '../runtime/schema/types';

async function readFile(file: File): Promise<string> {
  if (file.size > 1_000_000) throw new Error('Import files must be smaller than 1 MB.');
  return file.text();
}

export function ImportControls(props: {
  onCharacter: (value: CharacterCard) => void;
  onPersona: (value: Persona) => void;
}) {
  const characterInput = useRef<HTMLInputElement>(null);
  const personaInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [showPersona, setShowPersona] = useState(false);
  const [name, setName] = useState('Operator');
  const [description, setDescription] = useState('');

  const select = async (file: File | undefined, kind: 'character' | 'persona') => {
    if (!file) return;
    try {
      const raw = await readFile(file);
      if (kind === 'character') props.onCharacter(importCharacterCard(raw));
      else props.onPersona(importPersona(raw));
      setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Import failed.'); }
  };

  return (
    <section className="control-group" aria-label="Subject loading controls">
      <div className="micro-label">DATA BUS</div>
      <input ref={characterInput} hidden type="file" accept="application/json,.json" onChange={(event) => void select(event.target.files?.[0], 'character')} />
      <input ref={personaInput} hidden type="file" accept="application/json,.json" onChange={(event) => void select(event.target.files?.[0], 'persona')} />
      <button className="terminal-button" onClick={() => characterInput.current?.click()}>LOAD SUBJECT</button>
      <button className="terminal-button" onClick={() => personaInput.current?.click()}>LOAD PERSONA</button>
      <button className="terminal-button" onClick={() => setShowPersona((value) => !value)}>TEMP PERSONA</button>
      {showPersona && <div className="inline-editor">
        <label>CALLSIGN<input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>PROFILE<textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <button className="terminal-button" onClick={() => {
          try { props.onPersona(createTemporaryPersona(name, description)); setError(''); setShowPersona(false); }
          catch (reason) { setError(reason instanceof Error ? reason.message : 'Persona could not be created.'); }
        }}>COMMIT PERSONA</button>
      </div>}
      {error && <div className="error-line" role="alert">FAULT: {error}</div>}
    </section>
  );
}

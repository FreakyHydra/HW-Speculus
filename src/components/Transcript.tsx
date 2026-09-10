import { useEffect, useRef, useState } from 'react';
import { stripModelControlTokens } from '../runtime/generation/format';
import type { TranscriptMessage } from '../runtime/schema/types';
import { loadSession, saveSession } from '../storage/session-storage';

const AUTO_SCROLL_KEY = 'speculus-auto-scroll';

function autoScrollEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(AUTO_SCROLL_KEY) !== 'false';
}

function RenderedMessage({ text }: { text: string }) {
  const tokens = stripModelControlTokens(text).trim().split(/(\*[^*]+\*|"[^"]+"|\[[^\]]+\])/g).filter(Boolean);
  return <>{tokens.map((token, index) => {
    if (token.startsWith('*')) return <em key={index}>{token.slice(1, -1)}</em>;
    if (token.startsWith('[')) return <span className="inner-voice" key={index}>{token}</span>;
    return <span key={index}>{token}</span>;
  })}</>;
}

function persistEditedMessage(message: TranscriptMessage, text: string) {
  message.text = text;
  const stored = loadSession();
  if (!stored) return;
  stored.transcript = stored.transcript.map((entry) => entry.id === message.id ? { ...entry, text } : entry);
  stored.diagnostics = stored.diagnostics.map((entry) => entry.turnId === message.id ? { ...entry, finalReply: text } : entry);
  stored.updatedAt = Date.now();
  saveSession(stored);
}

async function copyRawMessage(message: TranscriptMessage): Promise<boolean> {
  const text = stripModelControlTokens(message.text);
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    return copied;
  }
}

export function Transcript(props: {
  messages: TranscriptMessage[];
  busy: boolean;
  onReroll: (message: TranscriptMessage) => void;
  onDelete: (message: TranscriptMessage) => void;
}) {
  const end = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!autoScrollEnabled()) return;
    const node = end.current;
    if (!node || typeof node.scrollIntoView !== 'function') return;
    node.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [props.messages.length]);

  const startEdit = (message: TranscriptMessage) => {
    setEditingId(message.id);
    setEditDraft(message.text);
  };

  const saveEdit = (message: TranscriptMessage) => {
    const text = editDraft.trim();
    if (!text) return;
    persistEditedMessage(message, text);
    setEditingId(null);
    setEditDraft('');
  };

  const copyMessage = async (message: TranscriptMessage) => {
    if (await copyRawMessage(message)) {
      setCopiedId(message.id);
      window.setTimeout(() => setCopiedId((current) => current === message.id ? null : current), 1200);
    }
  };

  return <div className="transcript live-transcript" aria-live="polite">
    {props.messages.length === 0 && <div className="empty-state">NO TRANSCRIPT. LOAD SUBJECT AND PERSONA, THEN BEGIN TEST.</div>}
    {props.messages.map((message) => <article className={`message ${message.sender}`} key={message.id}>
      <div className="message-meta"><span>{message.speaker}</span></div>
      {editingId === message.id
        ? <div className="message-editor">
          <textarea
            aria-label={`Edit ${message.speaker} response`}
            value={editDraft}
            onChange={(event) => setEditDraft(event.target.value)}
            rows={Math.min(14, Math.max(4, editDraft.split('\n').length + 2))}
            style={{ width: '100%', resize: 'vertical' }}
            autoFocus
          />
          <div className="message-actions">
            <button type="button" disabled={props.busy || !editDraft.trim()} onClick={() => saveEdit(message)}>SAVE</button>
            <button type="button" disabled={props.busy} onClick={() => { setEditingId(null); setEditDraft(''); }}>CANCEL</button>
          </div>
        </div>
        : <div className="message-text"><RenderedMessage text={message.text} /></div>}
      {!message.id.startsWith('opening:') && editingId !== message.id && <div className="message-actions">
        {message.sender === 'character' && <button disabled={props.busy} onClick={() => props.onReroll(message)}>REROLL</button>}
        <button type="button" disabled={props.busy} onClick={() => void copyMessage(message)}>{copiedId === message.id ? 'COPIED' : 'COPY'}</button>
        {message.sender === 'character' && <button disabled={props.busy} onClick={() => startEdit(message)}>EDIT</button>}
        {message.sender === 'character' && <button disabled={props.busy} onClick={() => props.onDelete(message)}>DELETE TURN</button>}
      </div>}
    </article>)}
    {props.busy && <div className="working-line">MODEL LINK ACTIVE <span>▮</span></div>}
    <div ref={end} />
  </div>;
}

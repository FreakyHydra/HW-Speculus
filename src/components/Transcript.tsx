import { useEffect, useRef } from 'react';
import type { TranscriptMessage } from '../runtime/schema/types';

function RenderedMessage({ text }: { text: string }) {
  const tokens = text.split(/(\*[^*]+\*|"[^"]+"|\[[^\]]+\])/g).filter(Boolean);
  return <>{tokens.map((token, index) => {
    if (token.startsWith('*')) return <em key={index}>{token.slice(1, -1)}</em>;
    if (token.startsWith('[')) return <span className="inner-voice" key={index}>{token}</span>;
    return <span key={index}>{token}</span>;
  })}</>;
}

export function Transcript(props: {
  messages: TranscriptMessage[];
  busy: boolean;
  onReroll: (message: TranscriptMessage) => void;
  onDelete: (message: TranscriptMessage) => void;
}) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: 'smooth' }), [props.messages.length]);
  return <div className="transcript" aria-live="polite">
    {props.messages.length === 0 && <div className="empty-state">NO TRANSCRIPT. LOAD SUBJECT AND PERSONA, THEN BEGIN TEST.</div>}
    {props.messages.map((message) => <article className={`message ${message.sender}`} key={message.id}>
      <div className="message-meta"><span>{message.speaker}</span><span>{message.id}</span></div>
      <div className="message-text"><RenderedMessage text={message.text} /></div>
      {message.sender === 'character' && !message.id.startsWith('opening:') && <div className="message-actions">
        <button disabled={props.busy} onClick={() => props.onReroll(message)}>REROLL</button>
        <button disabled={props.busy} onClick={() => props.onDelete(message)}>DELETE TURN</button>
      </div>}
    </article>)}
    {props.busy && <div className="working-line">MODEL LINK ACTIVE <span>▮</span></div>}
    <div ref={end} />
  </div>;
}

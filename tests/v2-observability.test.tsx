import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { publicV2Package } from '../src/v2/contracts/launch';
import type { ProviderAdapter } from '../src/runtime/providers/types';
import { generateV2Turn } from '../src/v2/runtime/engine';
import { createV2Session, DEFAULT_TEXT_COLORS } from '../src/v2/runtime/session';
import { V2DiagnosticsPanel } from '../src/v2/ui/Diagnostics';
import { V2Transcript } from '../src/v2/ui/Transcript';
import { v2Package } from './v2-fixtures';

const provider: ProviderAdapter = {
  kind: 'mock',
  generate: vi.fn(async () => ({
    text: '*She looks up.* "Hello." [Careful.]',
    metadata: {
      provider: 'mock', model: 'xialong-v1', endpoint: 'mock://v2', durationMs: 42,
      requestId: 'request-123', inputTokensEstimate: 321, requestedMaxTokens: 512,
      completionStatus: 'completed', finishReason: 'stop',
    },
  })),
};

async function generatedSession() {
  const value = createV2Session(publicV2Package(v2Package()));
  value.draft = '"Hello?"';
  return generateV2Turn(value, provider);
}

describe('V2 observability and display controls', () => {
  it('ships distinct configurable defaults for actions, dialogue and inner voice', () => {
    const value = createV2Session(publicV2Package(v2Package()));
    expect(value.settings).toMatchObject(DEFAULT_TEXT_COLORS);
  });

  it('renders action, dialogue and inner voice as separate styled spans', async () => {
    const value = await generatedSession();
    const { container } = render(<V2Transcript session={value} busy={false} />);
    const generated = container.querySelector('.v2-exchange .v2-message:not(.v2-player)') as HTMLElement;
    expect(generated.querySelector('.v2-action')?.textContent).toBe('She looks up.');
    expect(generated.querySelector('.v2-dialogue')?.textContent).toBe('"Hello."');
    expect(generated.querySelector('.v2-thought')?.textContent).toBe('[Careful.]');
    const transcript = container.querySelector('.v2-transcript') as HTMLElement;
    expect(transcript.style.getPropertyValue('--v2-action-color')).toBe(DEFAULT_TEXT_COLORS.actionColor);
    expect(transcript.style.getPropertyValue('--v2-dialogue-color')).toBe(DEFAULT_TEXT_COLORS.dialogueColor);
    expect(transcript.style.getPropertyValue('--v2-thought-color')).toBe(DEFAULT_TEXT_COLORS.thoughtColor);
  });

  it('records safe provider metadata and exposes the expanded inspector tabs', async () => {
    const value = await generatedSession();
    expect(value.turns[0].diagnostics).toMatchObject({
      providerKind: 'mock', providerEndpoint: 'mock://v2', requestId: 'request-123',
      finishReason: 'stop', requestedMaxTokens: 512, providerInputTokensEstimate: 321,
    });
    expect(value.turns[0].diagnostics.generationSettings).toMatchObject({ output: 'normal', maxTokens: 512 });
    render(<V2DiagnosticsPanel session={value} rejected={null} />);
    for (const name of ['state', 'context', 'knowledge', 'perception', 'cast', 'provider', 'turns', 'events', 'raw']) {
      expect(screen.getByRole('tab', { name })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole('tab', { name: 'provider' }));
    expect(screen.getByText(/request-123/)).toBeInTheDocument();
    expect(screen.getByText(/mock:\/\/v2/)).toBeInTheDocument();
  });
});

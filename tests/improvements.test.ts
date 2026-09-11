import { afterEach, describe, expect, it } from 'vitest';
import { getResponseCalibration, responseTokenLimit } from '../src/runtime/generation/compile-context';
import { normalizeRoleplayReply } from '../src/runtime/generation/format';
import { resolveSimulationSubject } from '../src/runtime/schema/launch-package';
import type { ClientLaunchPackage } from '../src/runtime/schema/types';
import { persona } from './fixtures';

afterEach(() => window.localStorage.removeItem('speculus-response-calibration'));

function placePackage(): ClientLaunchPackage {
  return {
    version: 1,
    launchId: 'launch-place-test',
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    primaryAsset: {
      id: 'place:old-mill',
      revision: '1',
      type: 'place',
      name: 'Old Mill',
      summary: 'A weathered riverside mill.',
      data: { kind: 'building' },
    },
    relatedAssets: [],
    character: null,
    persona,
    scene: 'Outside the mill.',
    contextBlocks: [],
    relationshipState: {},
    model: 'test-model',
  };
}

describe('Speculus usability and rails', () => {
  it('uses a neutral narrator for non-character assets', () => {
    const subject = resolveSimulationSubject(placePackage());
    expect(subject.name).toBe('SIMULATION NARRATOR');
    expect(subject.id).not.toBe('place:old-mill');
    expect(subject.systemPrompt).toMatch(/place, not a character/i);
  });

  it('keeps unmarked narrator output as narration instead of dialogue', () => {
    expect(normalizeRoleplayReply('The mill wheel creaks.', '', 'SIMULATION NARRATOR', '', 'narrator'))
      .toBe('*The mill wheel creaks.*');
  });

  it('applies response calibration limits', () => {
    window.localStorage.setItem('speculus-response-calibration', 'concise');
    expect(getResponseCalibration()).toBe('concise');
    expect(responseTokenLimit(850)).toBe(200);

    window.localStorage.setItem('speculus-response-calibration', 'long');
    expect(responseTokenLimit(850)).toBe(850);
  });
});

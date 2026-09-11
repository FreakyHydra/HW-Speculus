import { z } from 'zod';
import type { SimulatorSession } from '../simulator/session';
import { normalizeBrainConfig } from '../runtime/brain/policies/core';
import { resolveTargetProtocol } from '../runtime/brain/protocols/target';

export const RAW_SESSION_FORMAT = 'speculus-raw-session' as const;
export const RAW_SESSION_VERSION = 1 as const;

const rawSessionSchema = z.object({
  format: z.literal(RAW_SESSION_FORMAT),
  version: z.literal(RAW_SESSION_VERSION),
  exportedAt: z.number(),
  source: z.object({
    assetId: z.string(),
    assetType: z.string(),
    assetName: z.string(),
    assetRevision: z.string(),
  }),
  state: z.object({
    sessionId: z.string(),
    scene: z.string(),
    influence: z.object({
      tags: z.array(z.string()),
      freeform: z.string(),
    }).optional(),
    composerDraft: z.object({
      text: z.string(),
      updatedAt: z.number(),
      submitted: z.literal(false),
    }).optional(),
    transcript: z.array(z.unknown()),
    relationships: z.record(z.string(), z.unknown()),
    brain: z.unknown().optional(),
    diagnostics: z.array(z.unknown()),
    settings: z.object({
      provider: z.object({ kind: z.enum(['mock', 'orbis']), model: z.string(), temperature: z.number(), maxTokens: z.number() }),
      crtMotion: z.boolean(),
    }),
    nextTurnNumber: z.number().int().positive(),
    startedAt: z.number(),
    updatedAt: z.number(),
  }),
});

export type RawSessionExport = z.infer<typeof rawSessionSchema>;

export function exportRawSession(session: SimulatorSession, now = Date.now()): string {
  if (!session.launchPackage) throw new Error('This session has no Orbis launch package to identify its source asset.');
  const source = session.launchPackage.primaryAsset;
  const payload: RawSessionExport = {
    format: RAW_SESSION_FORMAT,
    version: RAW_SESSION_VERSION,
    exportedAt: now,
    source: {
      assetId: source.id,
      assetType: source.type,
      assetName: source.name,
      assetRevision: source.revision,
    },
    state: {
      sessionId: session.id,
      scene: session.scene,
      influence: structuredClone(session.influence ?? { tags: [], freeform: '' }),
      composerDraft: structuredClone(session.composerDraft),
      transcript: structuredClone(session.transcript),
      relationships: structuredClone(session.relationships),
      brain: structuredClone(session.brain),
      diagnostics: structuredClone(session.diagnostics),
      settings: structuredClone(session.settings),
      nextTurnNumber: session.nextTurnNumber,
      startedAt: session.startedAt,
      updatedAt: session.updatedAt,
    },
  };
  return JSON.stringify(payload, null, 2);
}

export function parseRawSession(raw: string): RawSessionExport {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('The selected raw session file is not valid JSON.'); }
  const result = rawSessionSchema.safeParse(parsed);
  if (!result.success) throw new Error('The selected file is not a supported Speculus raw session export.');
  return result.data;
}

export function resumeRawSession(current: SimulatorSession, raw: string, now = Date.now()): SimulatorSession {
  if (!current.launchPackage) throw new Error('Start the target asset from Orbis before importing a raw session.');
  const imported = parseRawSession(raw);
  const currentSource = current.launchPackage.primaryAsset;
  if (imported.source.assetId !== currentSource.id) {
    throw new Error(`This session belongs to ${imported.source.assetName}, not ${currentSource.name}. Open the original asset in Orbis and start Speculus before importing it.`);
  }

  return {
    ...current,
    id: imported.state.sessionId,
    scene: imported.state.scene,
    influence: imported.state.influence ?? { tags: [], freeform: '' },
    composerDraft: imported.state.composerDraft ?? { text: '', updatedAt: now, submitted: false },
    transcript: imported.state.transcript as SimulatorSession['transcript'],
    relationships: imported.state.relationships as SimulatorSession['relationships'],
    brain: normalizeBrainConfig(
      imported.state.brain,
      resolveTargetProtocol(current.launchPackage),
      current.brain.responseMode,
    ),
    diagnostics: imported.state.diagnostics as SimulatorSession['diagnostics'],
    settings: {
      ...imported.state.settings,
      provider: {
        ...imported.state.settings.provider,
        kind: current.settings.provider.kind,
        model: current.settings.provider.model,
      },
    },
    nextTurnNumber: imported.state.nextTurnNumber,
    startedAt: imported.state.startedAt,
    updatedAt: now,
  };
}

export function rawSessionFilename(session: SimulatorSession): string {
  const sourceName = session.launchPackage?.primaryAsset.name ?? 'session';
  const safeName = sourceName.toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'session';
  return `${safeName}-speculus-session.json`;
}

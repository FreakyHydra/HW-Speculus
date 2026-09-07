import { z } from 'zod';
import type { CharacterCard, ClientLaunchPackage, OrbisLaunchPackage } from './types.js';

const assetSchema = z.object({
  id: z.string().trim().min(1).max(200),
  revision: z.string().trim().min(1).max(200),
  type: z.enum(['character', 'world', 'place', 'item', 'faction', 'other']),
  name: z.string().trim().min(1).max(200),
  summary: z.string().max(20_000).default(''),
  data: z.unknown(),
});

const characterSchema = z.object({
  kind: z.literal('character'), id: z.string().min(1), spec: z.literal('chara_card_v2'),
  name: z.string().min(1), description: z.string(), personality: z.string(), scenario: z.string(),
  firstMessage: z.string(), exampleDialogue: z.string(), systemPrompt: z.string(),
  postHistoryInstructions: z.string(), tags: z.array(z.string()),
});

const personaSchema = z.object({
  kind: z.literal('persona'), id: z.string().min(1), name: z.string().min(1), description: z.string(),
});

export const orbisLaunchPackageSchema = z.object({
  version: z.literal(1),
  launchId: z.string().trim().min(8).max(200),
  issuedAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
  primaryAsset: assetSchema,
  relatedAssets: z.array(assetSchema).max(200).default([]),
  character: characterSchema.nullable().default(null),
  persona: personaSchema,
  scene: z.string().max(100_000),
  contextBlocks: z.array(z.object({ id: z.string().min(1).max(200), title: z.string().max(300), content: z.string().max(100_000) })).max(500).default([]),
  relationshipState: z.record(z.string(), z.unknown()).default({}),
  model: z.string().trim().min(1).max(200),
  generationGrant: z.string().min(16).max(8192),
}).superRefine((value, context) => {
  if (value.expiresAt <= Date.now()) context.addIssue({ code: 'custom', message: 'Launch package has expired.' });
  else if (value.expiresAt <= value.issuedAt) context.addIssue({ code: 'custom', message: 'Launch package expiry must be later than its issue time.' });
  if (value.character && value.primaryAsset.type === 'character' && value.character.id !== value.primaryAsset.id) {
    context.addIssue({ code: 'custom', message: 'Primary character identity does not match the packaged character.' });
  }
});

export function parseOrbisLaunchPackage(value: unknown): OrbisLaunchPackage {
  const result = orbisLaunchPackageSchema.safeParse(value);
  if (!result.success) throw new Error(`Orbis package rejected: ${result.error.issues[0]?.message ?? 'invalid package.'}`);
  return result.data as OrbisLaunchPackage;
}

export function clientLaunchPackage(value: OrbisLaunchPackage): ClientLaunchPackage {
  const { generationGrant: _secret, ...safe } = value;
  return safe;
}

export function parseClientLaunchPackage(value: unknown): ClientLaunchPackage {
  if (!value || typeof value !== 'object') throw new Error('Orbis package response is missing.');
  const parsed = parseOrbisLaunchPackage({ ...(value as Record<string, unknown>), generationGrant: 'client-redacted-grant' });
  return clientLaunchPackage(parsed);
}

export function resolveSimulationSubject(value: ClientLaunchPackage): CharacterCard {
  if (value.character) return value.character;
  const asset = value.primaryAsset;
  return {
    kind: 'character',
    id: asset.id,
    spec: 'chara_card_v2',
    name: asset.name,
    description: `${asset.summary}\n\nPackaged ${asset.type} data:\n${JSON.stringify(asset.data, null, 2)}`.trim(),
    personality: '',
    scenario: value.scene,
    firstMessage: '',
    exampleDialogue: '',
    systemPrompt: `Act as the simulation narrator for the packaged ${asset.type} named ${asset.name}. Keep the selected asset central and do not impersonate the player.`,
    postHistoryInstructions: '',
    tags: [asset.type, 'orbis-packaged'],
  };
}

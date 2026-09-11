import {
  SPECULUS_BRAIN_PROFILE,
  SPECULUS_BRAIN_SCHEMA,
  type PolicySnapshot,
  type PolicySnapshotEntry,
  type ResponseMode,
  type SpeculusBrainConfigV1,
  type TargetProtocol,
} from '../contracts';

export const CORE_POLICIES_V2: readonly PolicySnapshotEntry[] = [
  { id: 'speculus.core.player-control', version: '2.0.0', stage: 'validate', status: 'active' },
  { id: 'speculus.core.canon-and-physical-truth', version: '2.0.0', stage: 'resolve', status: 'active' },
  { id: 'speculus.core.target-protocol', version: '2.0.0', stage: 'resolve', status: 'active' },
  { id: 'speculus.core.knowledge-boundaries', version: '2.0.0', stage: 'render', status: 'active' },
  { id: 'speculus.core.turn-scope-and-handoff', version: '2.0.0', stage: 'plan', status: 'active' },
  { id: 'speculus.core.response-calibration', version: '2.0.0', stage: 'plan', status: 'active' },
] as const;

export function createPolicySnapshot(): PolicySnapshot {
  return {
    schemaVersion: 'policy-snapshot/1',
    profileId: SPECULUS_BRAIN_PROFILE,
    core: CORE_POLICIES_V2.map((policy) => ({ ...policy })),
    // Research policies are deliberately empty until a curated pack has passed
    // the regression suite. Derkomor V3 can be registered here without changing
    // the permanent core policy identities.
    research: [],
  };
}

export function createBrainConfig(
  targetProtocol: TargetProtocol,
  responseMode: ResponseMode = 'adaptive',
): SpeculusBrainConfigV1 {
  return {
    schemaVersion: SPECULUS_BRAIN_SCHEMA,
    responseMode,
    targetProtocol,
    policyProfileId: SPECULUS_BRAIN_PROFILE,
    policySnapshot: createPolicySnapshot(),
  };
}

const RESPONSE_MODES: readonly ResponseMode[] = ['concise', 'normal', 'long', 'adaptive'];

export function normalizeBrainConfig(
  value: unknown,
  targetProtocol: TargetProtocol,
  fallbackMode: ResponseMode = 'adaptive',
): SpeculusBrainConfigV1 {
  if (!value || typeof value !== 'object') return createBrainConfig(targetProtocol, fallbackMode);
  const candidate = value as Partial<SpeculusBrainConfigV1>;
  if (
    candidate.schemaVersion !== SPECULUS_BRAIN_SCHEMA
    || candidate.policyProfileId !== SPECULUS_BRAIN_PROFILE
    || !candidate.responseMode
    || !RESPONSE_MODES.includes(candidate.responseMode)
    || candidate.policySnapshot?.schemaVersion !== 'policy-snapshot/1'
    || candidate.policySnapshot.profileId !== SPECULUS_BRAIN_PROFILE
    || !Array.isArray(candidate.policySnapshot.core)
    || !Array.isArray(candidate.policySnapshot.research)
  ) return createBrainConfig(targetProtocol, fallbackMode);
  return { ...candidate, targetProtocol } as SpeculusBrainConfigV1;
}

import type { SimulationAssetType } from '../schema/types.js';

export const SPECULUS_BRAIN_SCHEMA = 'speculus-brain-config/1' as const;
export const SPECULUS_BRAIN_PROFILE = 'speculus-brain-v2-core' as const;
export const SPECULUS_RESPONSE_MODE_EVENT = 'speculus:response-mode' as const;

export type ResponseMode = 'concise' | 'normal' | 'long' | 'adaptive';
export type TargetProtocol = SimulationAssetType;
export type PolicyStage = 'resolve' | 'plan' | 'render' | 'validate' | 'reduce';
export type PolicyStatus = 'draft' | 'test' | 'active' | 'retired';

export type MechanicalAuthorityV1 = {
  schemaVersion: 'mechanical-authority/1';
  playerVoice: 'player_only';
  npcPhysicalAgency: 'world_controlled';
  placeCreation: 'orbis_registry_only';
  improvisedDetailScope: 'session_only';
  moralitySource: 'authored_world_only';
};

export type TurnAuthorityV1 = {
  schemaVersion: 'turn-authority/1';
  playerId: string;
  playerName: string;
  currentPlaceId?: string;
  canonicalPlaces: Array<{ id: string; name: string }>;
  mechanics: MechanicalAuthorityV1;
};

export type PolicySnapshotEntry = {
  id: string;
  version: string;
  stage: PolicyStage;
  status: PolicyStatus;
};

export type PolicySnapshot = {
  schemaVersion: 'policy-snapshot/1';
  profileId: typeof SPECULUS_BRAIN_PROFILE;
  core: PolicySnapshotEntry[];
  research: PolicySnapshotEntry[];
};

export type SpeculusBrainConfigV1 = {
  schemaVersion: typeof SPECULUS_BRAIN_SCHEMA;
  responseMode: ResponseMode;
  targetProtocol: TargetProtocol;
  policyProfileId: typeof SPECULUS_BRAIN_PROFILE;
  policySnapshot: PolicySnapshot;
  mechanics: MechanicalAuthorityV1;
};

export type BeatPlanV1 = {
  schemaVersion: 'beat-plan/1';
  targetProtocol: TargetProtocol;
  responseMode: ResponseMode;
  maximumBeats: number;
  immediateTrigger: string;
  forbiddenAdvances: string[];
  playerHandoff: string;
};

export type DraftValidationIssue = {
  code: 'player_control';
  ruleId: 'PLAYER-VOICE-001' | 'PLAYER-ACTION-001' | 'PLAYER-STATE-001';
  message: string;
};

export type DraftValidationResult = {
  accepted: boolean;
  issues: DraftValidationIssue[];
};

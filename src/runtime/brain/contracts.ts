import type { SimulationAssetType } from '../schema/types.js';

export const SPECULUS_BRAIN_SCHEMA = 'speculus-brain-config/1' as const;
export const SPECULUS_BRAIN_PROFILE = 'speculus-brain-v2-core' as const;
export const SPECULUS_RESPONSE_MODE_EVENT = 'speculus:response-mode' as const;

export type ResponseMode = 'concise' | 'normal' | 'long' | 'adaptive';
export type TargetProtocol = SimulationAssetType;
export type PolicyStage = 'resolve' | 'plan' | 'render' | 'validate' | 'reduce';
export type PolicyStatus = 'draft' | 'test' | 'active' | 'retired';

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
  code: 'player_control' | 'provider_incomplete';
  message: string;
};

export type DraftValidationResult = {
  accepted: boolean;
  issues: DraftValidationIssue[];
};

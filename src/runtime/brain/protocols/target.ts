import type { ClientLaunchPackage } from '../../schema/types';
import type { TargetProtocol } from '../contracts';

export function resolveTargetProtocol(launchPackage: ClientLaunchPackage | null): TargetProtocol {
  return launchPackage?.primaryAsset.type ?? 'character';
}

export function isSentientPrimaryTarget(target: TargetProtocol): boolean {
  return target === 'character';
}

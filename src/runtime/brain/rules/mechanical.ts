import type { ClientLaunchPackage, Persona } from '../../schema/types';
import type { MechanicalAuthorityV1, TurnAuthorityV1 } from '../contracts';

export const MECHANICAL_AUTHORITY_V1: MechanicalAuthorityV1 = {
  schemaVersion: 'mechanical-authority/1',
  playerVoice: 'player_only',
  npcPhysicalAgency: 'world_controlled',
  placeCreation: 'orbis_registry_only',
  improvisedDetailScope: 'session_only',
  moralitySource: 'authored_world_only',
};

export function createTurnAuthority(
  launchPackage: ClientLaunchPackage | null,
  persona: Persona,
): TurnAuthorityV1 {
  const assets = launchPackage
    ? [launchPackage.primaryAsset, ...launchPackage.relatedAssets]
    : [];
  const canonicalPlaces = assets
    .filter((asset) => asset.type === 'place')
    .map((asset) => ({ id: asset.id, name: asset.name }));
  return {
    schemaVersion: 'turn-authority/1',
    playerId: persona.id,
    playerName: persona.name,
    currentPlaceId: launchPackage?.primaryAsset.type === 'place'
      ? launchPackage.primaryAsset.id
      : undefined,
    canonicalPlaces,
    mechanics: { ...MECHANICAL_AUTHORITY_V1 },
  };
}

export function canCommitPlaceId(authority: TurnAuthorityV1, placeId: string): boolean {
  return authority.canonicalPlaces.some((place) => place.id === placeId);
}

export function renderMechanicalAuthority(authority: TurnAuthorityV1): string {
  const places = authority.canonicalPlaces.length
    ? authority.canonicalPlaces.map((place) => `${place.name} [${place.id}]`).join(', ')
    : '(no Place records supplied in this launch package)';
  return [
    'Executable authority contract:',
    `PLAYER-VOICE-001: Only ${authority.playerName} may create new spoken dialogue for ${authority.playerName}. Never supply the player's words.`,
    `PLAYER-ACTION-001: Never invent ${authority.playerName}'s voluntary actions, choices, thoughts, emotions, or bodily responses.`,
    `PLAYER-PHYSICS-001: Other physical actors and forces may affect, restrain, move, injure, carry, or overpower ${authority.playerName}. Describe the external action without inventing the player's response.`,
    `PLAYER-STATE-001: ${authority.playerName}'s inventory, possessions, injuries, and conditions change only through facts already established by canon, the player, or an observable simulated event. Never plant convenient evidence or possessions.`,
    'PLACE-001: New formal Places cannot be created during simulation. Named destinations must resolve to the Orbis Place registry.',
    'DETAIL-001: Ordinary scenery, structures, minor NPCs, and environmental details may be improvised with session-only authority.',
    'CANON-001: Authored canon outranks session improvisation.',
    'WORLD-001: Moral, legal, cultural, and social judgments come from the authored world. Speculus adds no universal morality layer.',
    `Canonical Places available to this turn: ${places}`,
  ].join('\n');
}

import { z } from 'zod';
import type { V2ClientPackage } from '../contracts/launch';

export const actorSchema = z.object({
  id: z.string(), name: z.string(), role: z.enum(['player', 'character']),
  locationId: z.string().nullable(), knowledge: z.array(z.string().max(4000)).max(100),
});
export const worldSchema = z.object({
  revision: z.number().int().nonnegative(), elapsedSeconds: z.number().int().nonnegative().safe(),
  locationId: z.string().nullable(), actors: z.array(actorSchema).max(200),
});
export type WorldState = z.infer<typeof worldSchema>;
export type WorldAction =
  | { type: 'set-scene'; locationId: string; presentActorIds: string[] }
  | { type: 'advance-clock'; seconds: number }
  | { type: 'record-knowledge'; actorId: string; fact: string };

export function assetsFor(launch: V2ClientPackage) {
  return [launch.primaryAsset, ...launch.relatedAssets];
}

export function createWorld(launch: V2ClientPackage): WorldState {
  const locationId = launch.primaryAsset.type === 'place' ? launch.primaryAsset.id : null;
  return {
    revision: 0, elapsedSeconds: 0, locationId,
    actors: [
      { id: launch.persona.id, name: launch.persona.name, role: 'player', locationId, knowledge: [] },
      ...(launch.character ? [{ id: launch.character.id, name: launch.character.name, role: 'character' as const, locationId: null, knowledge: [] }] : []),
    ],
  };
}

// Explicit operator assertions, not inferred travel or generated world patches.
export function applyWorldAction(world: WorldState, action: WorldAction, launch: V2ClientPackage): WorldState {
  const next = structuredClone(world);
  if (action.type === 'set-scene') {
    if (!assetsFor(launch).some((asset) => asset.id === action.locationId && asset.type === 'place')) {
      throw new Error('Scene location must be a canonical place supplied by Orbis.');
    }
    if (!action.presentActorIds.includes(launch.persona.id)
      || action.presentActorIds.some((id) => !next.actors.some((actor) => actor.id === id))) {
      throw new Error('Scene presence must include the player and only packaged actors.');
    }
    next.locationId = action.locationId;
    for (const actor of next.actors) actor.locationId = action.presentActorIds.includes(actor.id) ? action.locationId : null;
  } else if (action.type === 'advance-clock') {
    if (!Number.isSafeInteger(action.seconds) || action.seconds <= 0 || action.seconds > 86400) {
      throw new Error('Advance the clock by 1 to 86400 whole seconds.');
    }
    next.elapsedSeconds += action.seconds;
  } else {
    const actor = next.actors.find((candidate) => candidate.id === action.actorId);
    if (!actor || !action.fact.trim()) throw new Error('An existing actor and an explicit observed fact are required.');
    actor.knowledge = [...new Set([...actor.knowledge, action.fact.trim()])];
  }
  next.revision += 1;
  return worldSchema.parse(next);
}

export function assertWorldCanon(world: WorldState, launch: V2ClientPackage): void {
  const places = new Set(assetsFor(launch).filter((asset) => asset.type === 'place').map((asset) => asset.id));
  const expectedActors = createWorld(launch).actors;
  if (world.locationId && !places.has(world.locationId)) throw new Error('World state references an unpackaged place.');
  if (world.actors.length !== expectedActors.length || new Set(world.actors.map((actor) => actor.id)).size !== world.actors.length
    || world.actors.some((actor) => !expectedActors.some((expected) => expected.id === actor.id && expected.name === actor.name && expected.role === actor.role)
      || (actor.locationId !== null && !places.has(actor.locationId)))) {
    throw new Error('World state does not match the packaged actors and places.');
  }
}

export function perceptionFor(world: WorldState, actorId: string) {
  const actor = world.actors.find((value) => value.id === actorId);
  const anchored = Boolean(actor?.locationId);
  return {
    locationId: actor?.locationId ?? null,
    presentActors: actor?.locationId ? world.actors.filter((value) => value.locationId === actor.locationId).map(({ id, name }) => ({ id, name })) : [],
    knownFacts: actor?.knowledge ?? [],
    limitations: [
      anchored ? 'Presence is limited to actors explicitly anchored at the current location.' : 'Presence is unknown until explicitly anchored.',
      'Related canon is not automatically character knowledge.',
    ],
  };
}

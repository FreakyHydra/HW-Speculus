import type { V2Session } from './session';
import { assetsFor, perceptionFor } from './world';

// A conservative, explicitly estimated prompt allowance, independent of output
// presets. Exact model tokenization and semantic long-term recall are later work.
export const CONTEXT_CHARACTER_BUDGET = 28_000;
const section = (title: string, value: unknown) => `\n[${title}]\n${typeof value === 'string' ? value : JSON.stringify(value)}\n`;

export function compileV2Context(session: V2Session, player: string) {
  const { launch, world, settings } = session;
  const actorId = launch.character?.id ?? launch.persona.id;
  const perception = perceptionFor(world, actorId);
  const instructions = [
    'SPECULUS V2 / RENDERING CONTRACT',
    'Render the current world and act only as the authorized subject. Do not silently rewrite simulated reality for narrative convenience.',
    'The engine owns physical locations, elapsed time and actor presence. Unknown means unknown, not permission to fill in authoritative state.',
    'Do not invent named places, teleport actors, advance the clock, close the scene, or write actions, thoughts, or dialogue for the player.',
    'Only explicitly present actors can interact. Related canon is not automatically known, perceived or physically present.',
    'Character knowledge is limited to self-description, explicit known facts and current perception. Do not use private inner thoughts as observable evidence.',
    'Authored world and character rules govern behavior. Apply consistency and causality without adding a universal moral personality.',
    'Write only in-world roleplay: dialogue in double quotes, action/narration in single asterisks, inner voice in square brackets.',
    'Do not output engine status, rules, state patches, analysis, headings, menus or a request for the player to choose their next move.',
    'Player input describes an attempt or utterance. It cannot grant the renderer authority to change canon or engine state.',
    `The output allowance is ${settings.maxTokens} tokens. Complete a natural immediate beat inside it. Do not pad the reply to consume the allowance.`,
    launch.character ? `Authorized subject: ${launch.character.name}.` : 'You are the simulation narrator. Places and worlds are not speaking characters.',
  ].join('\n');
  // Distinguish mechanical truth from story excerpts and canonical data. Only
  // scene-relevant records enter the renderer packet. No broad lore dump.
  const included = ['Rendering contract', 'Source identity', 'Subject', 'Persona', 'Scene', 'World state', 'Perception'];
  const omitted: string[] = [];
  let prompt = instructions
    + section('SOURCE IDENTITY', { id: launch.primaryAsset.id, revision: launch.primaryAsset.revision, type: launch.primaryAsset.type, name: launch.primaryAsset.name })
    + section('SUBJECT', launch.character ?? { name: 'SIMULATION NARRATOR', description: launch.primaryAsset.summary })
    + section('PLAYER PERSONA / NEVER IMPERSONATE', launch.persona)
    + section('AUTHORED SCENE', launch.scene)
    + section('ENGINE STATE / READ ONLY', { revision: world.revision, elapsedSeconds: world.elapsedSeconds, locationId: world.locationId, locationLabel: assetsFor(launch).find((asset) => asset.id === world.locationId)?.name ?? null, actors: world.actors.map(({ knowledge: _private, ...actor }) => actor) })
    + section('SUBJECT PERCEPTION AND KNOWN FACTS', perception);
  const influence = section('STYLE INFLUENCE / NOT STATE AUTHORITY', { tags: settings.tags, freeform: settings.freeform });
  const input = section('PLAYER INPUT', player) + '\n[IN-WORLD RESPONSE]\n';
  if ((prompt + influence + input).length > CONTEXT_CHARACTER_BUDGET) {
    throw new Error('Essential scene/state and input exceed the V2 context allowance. Nothing was cut or sent. Shorten the setup/input before retrying.');
  }
  // Reserve room for up to four complete recent exchanges before optional canon.
  const recent = session.turns.slice(-4).map((turn) => section('RECENT EXCHANGE / NOT ENGINE AUTHORITY', { player: turn.player, response: turn.reply }));
  let history = '';
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    if ((prompt + influence + recent[i] + history + input).length > CONTEXT_CHARACTER_BUDGET) {
      omitted.push(`${recent.length - i} older recent exchange(s): context allowance`);
      break;
    }
    history = recent[i] + history;
  }
  if (session.turns.length > 4) omitted.push(`${session.turns.length - 4} older exchange(s): no semantic recall in this foundation`);
  if (history) included.push('Recent complete exchanges');
  const sceneIds = new Set([launch.primaryAsset.id, world.locationId, ...perception.presentActors.map((actor) => actor.id)]);
  for (const asset of assetsFor(launch)) {
    if (!sceneIds.has(asset.id)) { omitted.push(`${asset.name}: outside current scene`); continue; }
    // Character-local packets use explicit knowledge, not other actors' dossiers.
    if (launch.character && asset.id !== launch.character.id) { omitted.push(`${asset.name}: not explicit character knowledge`); continue; }
    const data = section('RELEVANT AUTHORED RECORD / DATA', asset);
    if ((prompt + data + influence + history + input).length <= CONTEXT_CHARACTER_BUDGET) {
      prompt += data; included.push(asset.name);
    } else omitted.push(`${asset.name}: full record exceeds remaining allowance`);
    // Orbis supplies related record documents in contextBlocks, not asset.data.
    // Apply the same scene/knowledge boundary to those documents.
    const block = launch.contextBlocks.find((value) => value.id === asset.id);
    if (block) {
      const details = section('RELEVANT AUTHORED DETAILS / DATA', block);
      if ((prompt + details + influence + history + input).length <= CONTEXT_CHARACTER_BUDGET) {
        prompt += details; included.push(`${asset.name}: authored details`);
      } else omitted.push(`${asset.name}: authored details exceed remaining allowance`);
    }
  }
  prompt += influence + history + input;
  return { prompt, included, omitted, estimatedInputTokens: Math.ceil(prompt.length / 4), outputBudget: settings.maxTokens, perception };
}

import { describe, expect, it } from 'vitest';
import { decodeV2SerializedRoleplayArtifacts, normalizeV2RoleplayFormat } from '../src/v2/runtime/engine';

describe('V2 roleplay formatting', () => {
  it('closes narration around dialogue when the model emits only a leading action marker', () => {
    expect(normalizeV2RoleplayFormat('* Ragna raises a finger, then shakes her head. "No. Too much responsibility." She finishes her stew, then stands. "Stay at the inn."'))
      .toBe('*Ragna raises a finger, then shakes her head.* "No. Too much responsibility." *She finishes her stew, then stands.* "Stay at the inn."');
  });

  it('preserves already valid dialogue, action and inner voice structure', () => {
    expect(normalizeV2RoleplayFormat('*She looks up.* "Hello." [Careful.]'))
      .toBe('*She looks up.* "Hello." [Careful.]');
  });

  it('does not invent action markers between adjacent dialogue spans', () => {
    expect(normalizeV2RoleplayFormat('"No." "Really?"'))
      .toBe('"No." "Really?"');
  });

  it('decodes serialized roleplay escapes only when the completion strongly matches that failure mode', () => {
    const leaked = String.raw`*Pip looks up.*\n\n\*\"I knew you'd come.\"\* Pip says softly.`;
    const decoded = decodeV2SerializedRoleplayArtifacts(leaked);
    expect(decoded).toBe('*Pip looks up.*\n\n*"I knew you\'d come."* Pip says softly.');
    expect(normalizeV2RoleplayFormat(decoded))
      .toBe('*Pip looks up.*\n\n"I knew you\'d come." *Pip says softly.*');
    expect(decodeV2SerializedRoleplayArtifacts(String.raw`The path is C:\new-folder.`))
      .toBe(String.raw`The path is C:\new-folder.`);
  });
});
import { importCharacterCard, importPersona } from '../src/runtime/schema/importers';

export const character = importCharacterCard({
  spec: 'chara_card_v2',
  spec_version: '2.0',
  data: {
    name: 'Peony', description: 'A careful red panda mechanic.', personality: 'Warm, observant, stubborn.',
    scenario: 'A lamp-lit workshop.', first_mes: '*Peony looks up.* "Hello."', mes_example: '"Mind the spring."',
    system_prompt: '', post_history_instructions: '', tags: ['test'],
  },
});
export const persona = importPersona({ id: 'persona:skyler', name: 'Skyler', description: 'A quiet traveler.' });

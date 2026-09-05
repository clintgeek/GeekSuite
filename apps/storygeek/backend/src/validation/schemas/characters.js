import { z } from 'zod';
import { storyIdParamsSchema, idParam, boundedName, boundedText } from './common.js';

// Enums mirror the embedded `characterSchema` in models/Story.js exactly —
// this route family reads/writes `story.characters` (the embedded array),
// not the separate standalone models/Character.js model (that model is only
// ever touched by services/characterService.js, which no route calls).
const CHARACTER_STATUSES = ['alive', 'dead', 'missing', 'unknown'];
const LEARNED_VIA = ['witnessed', 'told', 'inference', 'initial'];
const RELATIONSHIP_TYPES = ['friend', 'enemy', 'lover', 'family', 'mentor', 'student', 'rival', 'neutral'];

// Generous bound for nested arrays (knowledge/relationships/inventory/skills)
// per TODO_ORDER #22's "arrays <= 100" guidance — the model itself is unbounded.
const MAX_ARRAY = 100;

const knowledgeItemSchema = z.object({
  factId: boundedName(64), // required — references storyState.establishedFacts[].id
  learnedVia: z.enum(LEARNED_VIA).optional(),
  learnedFrom: boundedText(200).optional(),
  turn: z.coerce.number().int().min(0).optional(),
}).strict();

const relationshipItemSchema = z.object({
  // characterId references another embedded character's Mongoose subdocument
  // _id — checked as a non-empty string, not an ObjectId, same reasoning as
  // storyId params (see common.js).
  characterId: idParam('characterId').optional(),
  characterName: boundedText(200).optional(),
  relationshipType: z.enum(RELATIONSHIP_TYPES).optional(),
  description: boundedText(2000).optional(),
}).strict();

const inventoryItemFields = {
  name: boundedName(200),
  description: boundedText(2000).optional(),
  quantity: z.coerce.number().optional(),
  isEquipped: z.boolean().optional(),
};

const skillItemSchema = z.object({
  name: boundedName(200),
  level: z.coerce.number().optional(),
  description: boundedText(2000).optional(),
}).strict();

// Fields shared by create (POST) and update (PUT) — PUT merges the body into
// the existing character (`{...existing, ...body}`), so nothing here is
// required on update; POST additionally requires name + description, which
// Mongoose already requires at save() (`required: true` on both).
const characterOptionalFields = {
  personality: boundedText(2000).optional(),
  appearance: boundedText(2000).optional(),
  background: boundedText(2000).optional(),
  status: z.enum(CHARACTER_STATUSES).optional(),
  motivation: boundedText(2000).optional(),
  isPlayer: z.boolean().optional(),
  locationName: boundedText(200).optional(),
  knowledge: z.array(knowledgeItemSchema).max(MAX_ARRAY).optional(),
  firstAppearedTurn: z.coerce.number().int().min(0).optional(),
  lastSeenTurn: z.coerce.number().int().min(0).optional(),
  relationships: z.array(relationshipItemSchema).max(MAX_ARRAY).optional(),
  inventory: z.array(z.object(inventoryItemFields).strict()).max(MAX_ARRAY).optional(),
  skills: z.array(skillItemSchema).max(MAX_ARRAY).optional(),
  currentState: boundedText(2000).optional(),
  isActive: z.boolean().optional(),
};

const createCharacterSchema = z.object({
  name: boundedName(200),
  description: boundedText(5000),
  ...characterOptionalFields,
}).strict();

const updateCharacterSchema = z.object({
  name: boundedName(200).optional(),
  description: boundedText(5000).optional(),
  ...characterOptionalFields,
}).strict();

// POST .../inventory body — characterController pushes this straight onto
// character.inventory with only `if (!character.inventory) character.inventory = []`
// guarding it; no field check today.
const addInventoryItemSchema = z.object(inventoryItemFields).strict();

const characterNameParamsSchema = z.object({
  storyId: idParam('storyId'),
  characterName: boundedName(200),
}).strict();

const inventoryItemParamsSchema = z.object({
  storyId: idParam('storyId'),
  characterName: boundedName(200),
  itemName: boundedName(200),
}).strict();

export {
  storyIdParamsSchema,
  characterNameParamsSchema,
  inventoryItemParamsSchema,
  createCharacterSchema,
  updateCharacterSchema,
  addInventoryItemSchema,
};
export default {
  storyIdParamsSchema,
  characterNameParamsSchema,
  inventoryItemParamsSchema,
  createCharacterSchema,
  updateCharacterSchema,
  addInventoryItemSchema,
};

/**
 * gatewayInputObjectParity.test.js
 *
 * The blind spot `tools/gql-arg-audit.mjs` cannot cover, covered here instead.
 *
 * That tool compares a frontend document's variables with the gateway's root
 * *argument* lists. When a mutation takes `input: SomeInput!` that is one
 * argument, and the fields inside it are invisible to a static pass — doubly
 * so when the frontend sends `variables: { input: data }`, a name whose keys
 * are built in another module.
 *
 * That gap cost a whole feature. fitnessgeek's Medications page has always
 * sent `suggested_indications` inside `FitnessMedicationInput`, which declared
 * no such field — readable on `FitnessMedication`, present on the model
 * (`@geeksuite/schemas/fitnessgeek/medication`), missing only from the input
 * type. And this failure mode is not the usual silent one: an unrecognized
 * field on an input-object VARIABLE is a coercion error, so graphql-js refuses
 * the entire operation before any resolver runs — even when the value is `[]`,
 * which it is for most medications. Every Add and every Edit Medication
 * errored.
 *
 * So this suite coerces the real payloads the real frontends build against the
 * real merged schema. Variable coercion happens before execution, so an
 * unknown or mistyped input field shows up as an error with no resolver, no
 * Mongo and no network involved.
 *
 * GENERATED, not hand-picked (BURN_REVIEW #15). The original version of this
 * file covered exactly one input type by hand; the merged gateway declares 23
 * root fields that take an input-object argument, and 21 of them had no
 * fixture at all — a blind spot inside the blind-spot-closer. `ROOT_FIELDS`
 * below is computed from the schema itself, not copied out of it, so a new
 * input-object-taking field is caught by the completeness test the moment it
 * lands, whether or not anyone remembers to add a fixture for it. See
 * `apps/basegeek/DOCS/CONTEXT.md` ("The gatewayInputObjectParity contract")
 * for the rule this test enforces.
 */

import { buildASTSchema, graphql } from 'graphql';
import { typeDefs } from '../graphql/index.js';

const schema = buildASTSchema(typeDefs);

/**
 * Run an operation for its *coercion* only. The schema is built from SDL with
 * no resolver map, so every field resolves to null and nothing is executed
 * that could touch a database — any error here is a schema/payload mismatch.
 *
 * A root field typed to return a non-null object or list (`Task!`,
 * `[CalendarEvent!]!`, …) needs one exception: with no resolver the default
 * value is `undefined`, and GraphQL raises an EXECUTION error — "Cannot
 * return null for a non-nullable field" — before coercion is even the
 * question. That is not what this suite checks, so `rootValue` lets a
 * fixture hand back a minimal, harmless stand-in (`{}` for an object type,
 * `[]` for a list) purely to clear that non-null floor; every fixture then
 * selects a field that requires no further resolution against it (an empty
 * list has no items to resolve; `__typename` needs none either).
 */
async function coercionErrors(source, variableValues, rootValue) {
  const result = await graphql({ schema, source, variableValues, rootValue });
  return (result.errors ?? []).map((e) => e.message);
}

function unwrapNamedType(type) {
  let t = type;
  while (t.kind === 'NonNullType' || t.kind === 'ListType') t = t.type;
  return t;
}

/**
 * Every root Query/Mutation field with at least one argument whose type
 * resolves (through NonNull/List wrappers) to a declared input object. This
 * is exactly `gql-arg-audit`'s blind spot, generated instead of remembered.
 */
function inputObjectRootFields() {
  const inputTypeNames = new Set(
    typeDefs.definitions
      .filter((d) => d.kind === 'InputObjectTypeDefinition')
      .map((d) => d.name.value)
  );
  const roots = typeDefs.definitions.filter(
    (d) =>
      d.kind === 'ObjectTypeDefinition' &&
      (d.name.value === 'Query' || d.name.value === 'Mutation')
  );

  const results = [];
  for (const root of roots) {
    for (const field of root.fields || []) {
      const inputArgNames = (field.arguments || [])
        .filter((arg) => {
          const named = unwrapNamedType(arg.type);
          return named.kind === 'NamedType' && inputTypeNames.has(named.name.value);
        })
        .map((arg) => arg.name.value);
      if (inputArgNames.length > 0) {
        results.push({ key: `${root.name.value}.${field.name.value}`, args: inputArgNames });
      }
    }
  }
  return results.sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * FIXTURES — one entry per input-object-taking root field, keyed
 * `Root.field`. Each fixture is copied field-for-field from the real
 * frontend call site named in its comment, coerced against the real merged
 * schema. Where a builder wraps the payload before sending it (normalizes
 * shape, strips keys, merges sub-objects), the fixture reflects what
 * actually crosses the wire, not the raw form state.
 */
const FIXTURES = {
  // ── fitnessgeek ────────────────────────────────────────────────────────
  'Mutation.addFitnessMedication': {
    // apps/fitnessgeek/frontend/src/pages/Medications.jsx buildPayload()
    source: `
      mutation AddFitnessMedication($input: FitnessMedicationInput!) {
        addFitnessMedication(input: $input) { id }
      }
    `,
    variables: {
      input: {
        display_name: 'Metformin',
        is_supplement: false,
        med_type: 'rx',
        rxcui: '6809',
        ingredient_name: 'metformin',
        strength: '500 mg',
        times_of_day: ['morning', 'evening'],
        suggested_indications: ['Type 2 diabetes mellitus'],
        user_indications: ['blood sugar'],
        supply_start_date: '2026-09-05',
        days_supply: 90,
      },
    },
  },
  'Mutation.updateFitnessMedication': {
    // apps/fitnessgeek/frontend/src/pages/Medications.jsx buildPayload(), same shape on edit
    source: `
      mutation UpdateFitnessMedication($id: ID!, $input: FitnessMedicationInput!) {
        updateFitnessMedication(id: $id, input: $input) { id }
      }
    `,
    variables: {
      id: 'med1',
      input: {
        display_name: 'Metformin',
        is_supplement: false,
        med_type: 'rx',
        rxcui: '6809',
        ingredient_name: 'metformin',
        strength: '500 mg',
        times_of_day: ['morning', 'evening'],
        suggested_indications: ['Type 2 diabetes mellitus'],
        user_indications: ['blood sugar'],
        supply_start_date: '2026-09-05',
        days_supply: 90,
      },
    },
  },
  'Mutation.addBloodPressure': {
    // apps/fitnessgeek/frontend/src/services/bpService.js createBPLog()
    source: `
      mutation AddBp($input: BloodPressureInput!) { addBloodPressure(input: $input) { id } }
    `,
    variables: {
      input: { systolic: 118, diastolic: 76, pulse: 68, log_date: '2026-09-05', notes: 'resting' },
    },
  },
  'Mutation.updateBloodPressure': {
    // apps/fitnessgeek/frontend/src/services/bpService.js updateBPLog()
    source: `
      mutation UpdateBp($id: ID!, $input: BloodPressureInput!) { updateBloodPressure(id: $id, input: $input) { id } }
    `,
    variables: {
      id: 'bp1',
      input: { systolic: 118, diastolic: 76, pulse: 68, log_date: '2026-09-05', notes: 'resting' },
    },
  },
  'Mutation.addFitnessFood': {
    // apps/fitnessgeek/frontend/src/services/apiService.js normalizeFoodInput(),
    // fed by foodService.create()
    source: `
      mutation AddFitnessFood($input: FitnessFoodInput!) { addFitnessFood(input: $input) { id } }
    `,
    variables: {
      input: {
        name: 'Snack Bar',
        brand: 'Acme',
        serving_size: 40,
        serving_unit: 'g',
        barcode: '012345678905',
        nutrition: {
          calories_per_serving: 150,
          protein_grams: 5,
          carbs_grams: 20,
          fat_grams: 6,
          fiber_grams: 2,
          sugar_grams: 8,
          sodium_mg: 120,
        },
        source: 'custom',
      },
    },
  },
  'Mutation.updateFitnessFood': {
    // apps/fitnessgeek/frontend/src/services/apiService.js normalizeFoodUpdateInput(),
    // fed by foodService.update() / MyFoods.jsx. FitnessFoodInput is the same
    // full-object shape on update — name/serving_size/serving_unit/nutrition
    // stay required, which is why MyFoods.jsx always resends the current
    // value for those even when unchanged (see typeDefs.js's own comment).
    source: `
      mutation UpdateFitnessFood($id: ID!, $input: FitnessFoodInput!) { updateFitnessFood(id: $id, input: $input) { id } }
    `,
    variables: {
      id: 'food1',
      input: {
        name: 'Snack Bar',
        brand: 'Acme',
        serving_size: 40,
        serving_unit: 'g',
        nutrition: {
          calories_per_serving: 150,
          protein_grams: 5,
          carbs_grams: 20,
          fat_grams: 6,
          fiber_grams: 2,
          sugar_grams: 8,
          sodium_mg: 120,
        },
      },
    },
  },
  'Mutation.addFitnessMeal': {
    // apps/fitnessgeek/frontend/src/components/FoodLog/SaveMealDialog.jsx handleSave()
    source: `
      mutation AddFitnessMeal($input: FitnessMealInput!) { addFitnessMeal(input: $input) { id } }
    `,
    variables: {
      input: {
        name: 'Breakfast Combo',
        meal_type: 'breakfast',
        food_items: [{ food_item_id: '507f1f77bcf86cd799439011', servings: 1 }],
      },
    },
  },
  'Mutation.updateFitnessMeal': {
    // apps/fitnessgeek/frontend/src/components/Meals/EditMealDialog.jsx (payload, via handleSave)
    source: `
      mutation UpdateFitnessMeal($id: ID!, $input: FitnessMealInput!) { updateFitnessMeal(id: $id, input: $input) { id } }
    `,
    variables: {
      id: 'meal1',
      input: {
        name: 'Breakfast Combo',
        meal_type: 'breakfast',
        food_items: [{ food_item_id: '507f1f77bcf86cd799439011', servings: 1 }],
      },
    },
  },
  'Mutation.addFitnessWeight': {
    // apps/fitnessgeek/frontend/src/services/weightService.js addWeightLog()
    source: `
      mutation AddFitnessWeight($input: WeightInput!) { addFitnessWeight(input: $input) { id } }
    `,
    variables: { input: { weight_value: 172.4, log_date: '2026-09-05', notes: '' } },
  },
  'Mutation.updateFitnessWeight': {
    // apps/fitnessgeek/frontend/src/services/weightService.js updateWeightLog()
    source: `
      mutation UpdateFitnessWeight($id: ID!, $input: WeightInput!) { updateFitnessWeight(id: $id, input: $input) { id } }
    `,
    variables: { id: 'w1', input: { weight_value: 172.4, log_date: '2026-09-05', notes: '' } },
  },
  'Mutation.addFoodLog': {
    // apps/fitnessgeek/frontend/src/services/apiService.js normalizeFoodLogInput(),
    // fed by useFoodLog.js addFoodToLog() -> fitnessGeekService.addFoodToLog()
    source: `
      mutation AddFoodLog($input: FoodLogInput!) { addFoodLog(input: $input) { id } }
    `,
    variables: {
      input: {
        log_date: '2026-09-05',
        meal_type: 'lunch',
        servings: 1.5,
        food_item: {
          name: 'Chicken Breast',
          serving_size: 150,
          serving_unit: 'g',
          nutrition: {
            calories_per_serving: 165,
            protein_grams: 31,
            carbs_grams: 0,
            fat_grams: 3.6,
            fiber_grams: 0,
            sugar_grams: 0,
            sodium_mg: 74,
          },
          source: 'custom',
        },
        notes: 'grilled',
      },
    },
  },
  'Mutation.updateFoodLog': {
    // apps/fitnessgeek/frontend/src/components/FoodLog/EditLogDialog.jsx handleSave(),
    // fed through fitnessGeekService.updateFoodLog() -> normalizeFoodLogUpdateInput()
    source: `
      mutation UpdateFoodLog($id: ID!, $input: FoodLogUpdateInput!) { updateFoodLog(id: $id, input: $input) { id } }
    `,
    variables: {
      id: 'log1',
      input: {
        servings: 2,
        meal_type: 'dinner',
        notes: 'note',
        nutrition: { calories_per_serving: 200, protein_grams: 10, carbs_grams: 15, fat_grams: 5 },
      },
    },
  },
  'Mutation.updateFitnessUserSettings': {
    // apps/fitnessgeek/frontend/src/pages/Settings.jsx saveSettings(),
    // fed through settingsService.updateSettings() -> apiService sanitizeSettingsInput()
    source: `
      mutation UpdateFitnessUserSettings($input: FitnessUserSettingsInput!) {
        updateFitnessUserSettings(input: $input) { id }
      }
    `,
    variables: {
      input: {
        theme: 'dark',
        influxEnabled: false,
        dashboard: { show_current_weight: true, card_order: ['weight', 'food'] },
        garmin: { enabled: false, username: '' },
        notifications: { mealReminders: true },
        nutrition_goal: { calories: 2000 },
        weight_goal: { targetWeight: 165 },
        units: { weight: 'lb' },
        ai: { enabled: true },
        household: { active: false },
      },
    },
  },
  'Mutation.fitnessInsightsChat': {
    // apps/fitnessgeek/frontend/src/services/insightsService.js chat()
    source: `
      mutation AiChat($message: String!, $history: [ChatMessageInput]) {
        fitnessInsightsChat(message: $message, history: $history) { type content }
      }
    `,
    variables: {
      message: 'What should I eat today?',
      history: [
        { role: 'user', content: 'How am I doing on protein this week?' },
        { role: 'assistant', content: 'You are averaging 92g/day.' },
      ],
    },
  },

  // ── bookgeek ───────────────────────────────────────────────────────────
  'Mutation.createBook': {
    // apps/bookgeek/web/src/App.jsx handleCreateBook()
    source: `
      mutation CreateBook($input: CreateBookInput!) { createBook(input: $input) { id } }
    `,
    variables: {
      input: {
        title: 'Dune',
        authors: ['Frank Herbert'],
        isbn: '9780441013593',
        shelf: 'want-to-read',
        owned: false,
      },
    },
  },
  'Mutation.updateBook': {
    // apps/bookgeek/web/src/App.jsx handleSaveEditForSelectedBook() (the main
    // edit dialog); handleUpdateProgress()/handleUpdateShelf() send smaller
    // single-field patches of the same UpdateBookInput.
    source: `
      mutation UpdateBook($id: ID!, $input: UpdateBookInput!) { updateBook(id: $id, input: $input) { id } }
    `,
    variables: {
      id: 'book1',
      input: {
        title: 'Dune',
        language: 'en',
        publisher: 'Ace',
        publishedDate: '1965-08-01',
        isbn: '9780441013593',
        isbn13: '9780441013593',
        goodreadsId: '234225',
        review: 'Great',
        authors: ['Frank Herbert'],
        tags: ['scifi'],
        rating: 5,
      },
    },
  },
  'Mutation.saveBookProfile': {
    // apps/bookgeek/web/src/App.jsx handleSaveProfile()
    source: `
      mutation SaveBookProfile($input: BookProfileInput!) { saveBookProfile(input: $input) { userId } }
    `,
    variables: { input: { kindleEmail: 'reader@kindle.com', deviceWord: 'bramble' } },
  },
  'Mutation.saveLibraryFilter': {
    // apps/bookgeek/web/src/App.jsx handleSaveCurrentFilter()
    //
    // Returns `[BookSavedFilter!]!` — non-null list; same `rootValue` fix as
    // `bulkUpdateFreeTiers` above.
    source: `
      mutation SaveLibraryFilter($input: SaveLibraryFilterInput!) { saveLibraryFilter(input: $input) { id } }
    `,
    rootValue: { saveLibraryFilter: () => [] },
    variables: {
      input: {
        name: 'Unread SciFi',
        sortBy: 'title',
        sortDir: 'asc',
        searchQuery: 'dune',
        authorFilter: 'Herbert',
        tagFilter: 'scifi',
        shelfFilter: 'want-to-read',
      },
    },
  },

  // ── bujogeek ───────────────────────────────────────────────────────────
  'Mutation.savePushSubscription': {
    // apps/bujogeek/frontend/src/hooks/usePushReminders.js (subscription.toJSON())
    //
    // `savePushSubscription` returns `PushSubscription!` — non-null — so with
    // no resolver a bare `null` is an EXECUTION error, not the coercion error
    // this suite checks for. `rootValue` hands back an empty stand-in object
    // to clear that floor; `__typename` needs no further resolution against it.
    source: `
      mutation SavePushSubscription($input: PushSubscriptionInput!) {
        savePushSubscription(input: $input) { __typename }
      }
    `,
    variables: {
      input: {
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
        keys: { p256dh: 'BEl62iUYgUivxIkv69yViEuiBIa40HI', auth: '8Q6Zz1qN9tOa' },
        userAgent: 'Mozilla/5.0',
      },
    },
    rootValue: { savePushSubscription: () => ({}) },
  },
  'Mutation.updateTask': {
    // apps/bujogeek/frontend/src/components/tasks/TaskEditor.jsx buildPayload()
    //
    // `updateTask` returns `Task!` — see the `rootValue` note on
    // `savePushSubscription` above; same reason, same fix.
    source: `
      mutation UpdateTask($id: ID!, $input: UpdateTaskInput!, $editScope: EditScope) {
        updateTask(id: $id, input: $input, editScope: $editScope) { __typename }
      }
    `,
    variables: {
      id: 'task1',
      input: {
        content: 'Write chapter 3',
        signifier: '*',
        status: 'pending',
        priority: 2,
        note: '',
        tags: ['writing'],
        dueDate: '2026-09-10T00:00:00.000Z',
        isBacklog: false,
        recurrenceRule: null,
        collectionId: null,
      },
    },
    rootValue: { updateTask: () => ({}) },
  },

  // ── basegeek (admin console) ───────────────────────────────────────────
  'Mutation.bulkUpdateFreeTiers': {
    // apps/basegeek/packages/ui/src/pages/aigeek/useAIGeek.js saveAllFreeTiers()
    //
    // Returns `[FreeTierUpdate!]!` — non-null list; `rootValue` hands back an
    // empty array to clear that floor (see the `savePushSubscription` note
    // above). An empty list has no items, so the `{ provider modelId isFree }`
    // selection never has to resolve against one.
    source: `
      mutation BulkUpdateFreeTiers($updates: [FreeTierUpdateInput!]!) {
        bulkUpdateFreeTiers(updates: $updates) { provider modelId isFree }
      }
    `,
    rootValue: { bulkUpdateFreeTiers: () => [] },
    variables: {
      updates: [
        {
          provider: 'groq',
          modelId: 'llama-3.1-70b',
          isFree: true,
          freeLimits: {
            requestsPerMinute: 30,
            requestsPerDay: 14400,
            tokensPerMinute: 6000,
            tokensPerDay: 500000,
            audioSecondsPerHour: 0,
            audioSecondsPerDay: 0,
          },
        },
      ],
    },
  },

  // ── glance (StartGeek's calendar widget) ────────────────────────────────
  'Query.calendarEvents': {
    // apps/startgeek/src/components/CalendarModule.jsx (sources) +
    // apps/startgeek/src/hooks/useCalendarEvents.js (from/to)
    //
    // Returns `[CalendarEvent!]!` — non-null list; same `rootValue` fix as
    // `bulkUpdateFreeTiers` above.
    source: `
      query CalendarEvents($sources: [CalendarSourceInput!]!, $from: Date, $to: Date) {
        calendarEvents(sources: $sources, from: $from, to: $to) { id }
      }
    `,
    rootValue: { calendarEvents: () => [] },
    variables: {
      sources: [{ url: 'https://calendar.example.com/family.ics', color: '#4285F4' }],
      from: '2026-09-05',
      to: '2026-09-19',
    },
  },
};

/**
 * Root fields with no live frontend caller today. `setNutritionGoals` is
 * reachable only through `goalsService.saveGoals()`
 * (apps/fitnessgeek/frontend/src/services/goalsService.js), which nothing in
 * the frontend tree calls — `getGoals`/`getDerivedMacros` are the only live
 * callers of that service. There is therefore no real payload to copy a
 * fixture from; it is listed here, explicitly, rather than silently absent,
 * so the completeness test still passes and a future caller shows up as a
 * fixture gap instead of a silent hole. If a caller is ever added, move this
 * entry to FIXTURES with that caller's real payload.
 */
const NO_FRONTEND_CALLER = new Set(['Mutation.setNutritionGoals']);

describe('every input-object-taking root field is enumerated and accounted for', () => {
  test('the coverage lists match the schema exactly', () => {
    const actual = inputObjectRootFields().map((f) => f.key).sort();
    const accounted = [...new Set([...Object.keys(FIXTURES), ...NO_FRONTEND_CALLER])].sort();

    // Fails both directions: a new input-object field with neither a fixture
    // nor a no-frontend-caller entry, AND a fixture/entry left behind for a
    // field the schema no longer declares (renamed, removed, or retyped).
    expect(accounted).toEqual(actual);
  });

  test('the count matches the audit: 23 root fields take an input-object argument', () => {
    expect(inputObjectRootFields()).toHaveLength(23);
  });

  test('FIXTURES and NO_FRONTEND_CALLER never claim the same field', () => {
    const overlap = Object.keys(FIXTURES).filter((k) => NO_FRONTEND_CALLER.has(k));
    expect(overlap).toEqual([]);
  });
});

describe.each(Object.entries(FIXTURES))('%s', (key, fixture) => {
  test('the real frontend payload coerces cleanly against the real schema', async () => {
    const errors = await coercionErrors(fixture.source, fixture.variables, fixture.rootValue);
    expect(errors).toEqual([]);
  });
});

describe('FitnessMedicationInput accepts what Medications.jsx actually sends', () => {
  test('an empty suggested_indications coerces too — the common case', async () => {
    // The value being `[]` is exactly why this went unnoticed as "probably
    // harmless". It is not: the field's presence is what breaks it.
    const errors = await coercionErrors(FIXTURES['Mutation.addFitnessMedication'].source, {
      input: { display_name: 'Vitamin D', suggested_indications: [] },
    });
    expect(errors).toEqual([]);
  });

  test('the guard is armed — a genuinely unknown field is still refused', async () => {
    const errors = await coercionErrors(FIXTURES['Mutation.addFitnessMedication'].source, {
      input: { display_name: 'Metformin', not_a_real_field: 1 },
    });
    expect(errors.join(' ')).toMatch(/not_a_real_field.*is not defined by type/);
  });

  test('suggested_indications is readable as well as writable', () => {
    // Write-only or read-only is the asymmetry that starts this class of bug.
    const output = typeDefs.definitions.find(
      (d) => d.kind === 'ObjectTypeDefinition' && d.name.value === 'FitnessMedication'
    );
    const input = typeDefs.definitions.find(
      (d) => d.kind === 'InputObjectTypeDefinition' && d.name.value === 'FitnessMedicationInput'
    );
    const names = (def) => def.fields.map((f) => f.name.value);
    expect(names(output)).toContain('suggested_indications');
    expect(names(input)).toContain('suggested_indications');
  });
});

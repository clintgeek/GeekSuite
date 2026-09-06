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
 */

import { buildASTSchema, graphql } from 'graphql';
import { typeDefs } from '../graphql/index.js';

const schema = buildASTSchema(typeDefs);

/**
 * Run an operation for its *coercion* only. The schema is built from SDL with
 * no resolver map, so every field resolves to null and nothing is executed
 * that could touch a database — any error here is a schema/payload mismatch.
 */
async function coercionErrors(source, variableValues) {
  const result = await graphql({ schema, source, variableValues });
  return (result.errors ?? []).map((e) => e.message);
}

describe('FitnessMedicationInput accepts what Medications.jsx actually sends', () => {
  // Copied field-for-field from `buildPayload()` in
  // apps/fitnessgeek/frontend/src/pages/Medications.jsx. If that function
  // grows a key the input type does not declare, this fails here rather than
  // in the user's face.
  const payload = {
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
  };

  const ADD = `
    mutation AddFitnessMedication($input: FitnessMedicationInput!) {
      addFitnessMedication(input: $input) { id }
    }
  `;
  const UPDATE = `
    mutation UpdateFitnessMedication($id: ID!, $input: FitnessMedicationInput!) {
      updateFitnessMedication(id: $id, input: $input) { id }
    }
  `;

  test('the add payload coerces cleanly', async () => {
    expect(await coercionErrors(ADD, { input: payload })).toEqual([]);
  });

  test('the update payload coerces cleanly', async () => {
    expect(await coercionErrors(UPDATE, { id: 'abc', input: payload })).toEqual([]);
  });

  test('an empty suggested_indications coerces too — the common case', async () => {
    // The value being `[]` is exactly why this went unnoticed as "probably
    // harmless". It is not: the field's presence is what breaks it.
    const errors = await coercionErrors(ADD, {
      input: { display_name: 'Vitamin D', suggested_indications: [] },
    });
    expect(errors).toEqual([]);
  });

  test('the guard is armed — a genuinely unknown field is still refused', async () => {
    const errors = await coercionErrors(ADD, {
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

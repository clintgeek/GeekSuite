import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { formToInput, thingToForm, validateForm } from '../../views/edit/EditThingDialog';
import AttributeField from '../../views/edit/AttributeField';
import { renderWithProviders } from '../testUtils';
import { TYPES, date, field, makeThing } from '../fixtures';

const boat = TYPES.find((t) => t.id === 'ty-boat');

function wendyWithEverything() {
  return makeThing({
    dates: [date({ id: 'd1', recurEveryMonths: 12 }), date({ id: 'd2', kind: 'warranty', label: 'Motor', recurEveryMonths: null, notes: 'Mercury' })],
    photos: [
      { __typename: 'ThingPhoto', id: 'p1', fileId: 'f1', role: 'overview', caption: 'Port side', url: '/f1', thumbUrl: '/f1t', width: 1, height: 1 },
      { __typename: 'ThingPhoto', id: 'p2', fileId: 'f2', role: 'id-plate', caption: null, url: '/f2', thumbUrl: '/f2t', width: 1, height: 1 },
    ],
    documents: [{ __typename: 'ThingDocument', id: 'doc1', fileId: 'f3', role: 'receipt', title: 'Receipt', url: '/f3', mime: 'application/pdf', size: 10, originalName: 'r.pdf' }],
    relationships: [
      ...makeThing().relationships,
      { __typename: 'ThingRelationship', id: 'r-out', kind: 'accessory-of', direction: 'out', thing: { __typename: 'ThingSummary', id: 't-truck', name: 'Tow truck', coverThumbUrl: null, type: null } },
    ],
  });
}

describe('thing ↔ form', () => {
  it('seeds the form from the thing', () => {
    const f = thingToForm(wendyWithEverything());
    expect(f).toMatchObject({
      name: 'Wendy',
      typeId: 'ty-boat',
      parentId: 'n-garage',
      tags: ['fishing', 'lake'],
      valueAmount: '18500',
      valueAsOf: '2026-01-15',
      acquiredDate: '2021-05-01',
      acquiredFrom: 'Bass Pro Shops',
      acquiredPrice: '21000',
    });
    expect(f.attrs).toMatchObject({ manufacturer: 'Tracker', lengthFt: '18', hullNumber: 'ABC1234567' });
    // Only what THIS thing says: the Garmin's "accessory for Wendy" is derived.
    expect(f.relationships.map((r) => r.thing.name)).toEqual(['Tow truck']);
    expect(f.dates.map((d) => d.id)).toEqual(['d1', 'd2']);
  });

  it('builds a ThingInput: attribute patch, ids kept, removals dropped', () => {
    const thing = wendyWithEverything();
    const f = thingToForm(thing);
    f.attrs = { ...f.attrs, hullNumber: '', lengthFt: '19' };
    f.parentId = null;
    f.dates = [{ ...f.dates[0], recurEveryMonths: 0 }, { key: 'new-1', id: null, kind: 'insurance', label: '', date: '2027-01-01', recurEveryMonths: 12, notes: '' }, { key: 'new-2', id: null, kind: 'other', label: '', date: '', recurEveryMonths: 0, notes: '' }];
    f.photos = f.photos.map((p) => (p.id === 'p2' ? { ...p, removed: true } : p));
    f.documents = [{ ...f.documents[0], title: '  ' }];
    const input = formToInput(f, boat, thing.attributes);
    expect(input.attributes).toEqual({ hullNumber: null, lengthFt: 19 });
    expect(input.parentId).toBeNull();
    expect(input.typeId).toBe('ty-boat');
    expect(input.value).toEqual({ amount: 18500, currency: 'USD', asOf: '2026-01-15T00:00:00.000Z' });
    expect(input.acquired).toEqual({ date: '2021-05-01T00:00:00.000Z', from: 'Bass Pro Shops', price: { amount: 21000, currency: 'USD' } });
    expect(input.dates).toEqual([
      { id: 'd1', kind: 'registration', label: null, date: '2026-10-07T00:00:00.000Z', recurEveryMonths: null, notes: null },
      { kind: 'insurance', label: null, date: '2027-01-01T00:00:00.000Z', recurEveryMonths: 12, notes: null },
    ]);
    expect(input.relationships).toEqual([{ kind: 'accessory-of', thingId: 't-truck' }]);
    expect(input.photos).toEqual([{ id: 'p1', role: 'overview', caption: 'Port side' }]);
    expect(input.documents).toEqual([{ id: 'doc1', role: 'receipt', title: null }]);
  });

  it('sends parentId only when it changed (an unchanged parent in the Trash would block the save)', () => {
    const thing = makeThing();
    const f = thingToForm(thing);
    expect('parentId' in formToInput(f, boat, thing.attributes)).toBe(false);
    f.parentId = 'n-van';
    expect(formToInput(f, boat, thing.attributes).parentId).toBe('n-van');
  });

  it('an untouched form sends no attribute changes', () => {
    const thing = makeThing();
    expect(formToInput(thingToForm(thing), boat, thing.attributes).attributes).toEqual({});
  });

  it('validates name, required fields and money', () => {
    const typeWithRequired = { ...boat, fields: [...boat.fields, field('reg', 'Registration', 'text', { required: true })] };
    const f = { ...thingToForm(makeThing()), name: ' ', valueAmount: 'lots' };
    const errors = validateForm(f, typeWithRequired);
    expect(errors).toEqual({ name: 'A thing needs a name.', 'attr:reg': 'Registration is required for this type.', valueAmount: 'Enter an amount like 1250 or 1,249.99.' });
    expect(validateForm(thingToForm(makeThing()), boat)).toEqual({});
  });
});

describe('AttributeField by kind', () => {
  const render = (f, value = '', onChange = vi.fn()) => {
    renderWithProviders(<AttributeField field={f} value={value} onChange={onChange} />);
    return onChange;
  };

  it('identifier text: mono, with the lock and what happens to it', () => {
    const onChange = render(field('serial', 'Serial number', 'text', { identifier: true }), 'XYZ');
    const input = screen.getByRole('textbox', { name: 'Serial number' });
    expect(input).toHaveAttribute('data-identifier', 'true');
    expect(input).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByText('Masked on screen and never sent to AI.')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'XYZ1' } });
    expect(onChange).toHaveBeenCalledWith('XYZ1');
  });

  it('number with its unit', () => {
    render(field('len', 'Length', 'number', { unit: 'ft' }), '18');
    expect(screen.getByRole('textbox', { name: 'Length' })).toHaveAttribute('inputmode', 'decimal');
    expect(screen.getByText('ft')).toBeInTheDocument();
  });

  it('date is a date input', () => {
    const { container } = renderWithProviders(<AttributeField field={field('d', 'Bought', 'date')} value="2026-03-01" onChange={() => {}} />);
    expect(container.querySelector('input[type="date"]')).toHaveValue('2026-03-01');
  });

  it('choice lists its choices', () => {
    const onChange = render(field('kind', 'Kind', 'choice', { choices: ['Handgun', 'Rifle'] }));
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Kind' }));
    const list = screen.getByRole('listbox');
    expect(within(list).getAllByRole('option').map((o) => o.textContent)).toEqual(['Not set', 'Handgun', 'Rifle']);
    fireEvent.click(within(list).getByRole('option', { name: 'Rifle' }));
    expect(onChange).toHaveBeenCalledWith('Rifle');
  });

  it('money has a $ and decimal keyboard', () => {
    render(field('msrp', 'MSRP', 'money'), '900');
    expect(screen.getByRole('textbox', { name: 'MSRP' })).toHaveAttribute('inputmode', 'decimal');
    expect(screen.getByText('$')).toBeInTheDocument();
  });

  it('url is a url input', () => {
    const { container } = renderWithProviders(<AttributeField field={field('u', 'Manual', 'url')} value="" onChange={() => {}} />);
    expect(container.querySelector('input[type="url"]')).not.toBeNull();
  });

  it('boolean is Yes / No', () => {
    const onChange = render(field('b', 'Trailer included', 'boolean'), '');
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    expect(onChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: 'No' }));
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('required shows a star and its error', () => {
    renderWithProviders(<AttributeField field={field('r', 'Registration', 'text', { required: true })} value="" onChange={() => {}} error="Registration is required for this type." />);
    expect(screen.getByRole('textbox', { name: /Registration \*/ })).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Registration is required for this type.')).toBeInTheDocument();
  });
});

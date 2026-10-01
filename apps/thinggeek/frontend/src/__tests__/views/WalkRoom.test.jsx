import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import WalkRoom from '../../views/walk/WalkRoom';
import { UploadsProvider } from '../../hooks/useUploads';
import { CREATE_THING } from '../../graphql/mutations';
import { GET_THING_TREE, GET_THING_TYPES } from '../../graphql/queries';
import { renderWithProviders } from '../testUtils';
import { NODES, TYPES, field, makeThing } from '../fixtures';
import { GraphQLError } from 'graphql';

const many = (m) => ({ ...m, maxUsageCount: 20 });

const typesMock = (types) => many({ request: { query: GET_THING_TYPES }, result: { data: { thingTypes: types } } });
const treeMock = many({ request: { query: GET_THING_TREE }, result: { data: { thingTree: NODES } } });

function setup({ at = 'n-garage', extraMocks = [], upload, typeMocks = [typesMock(TYPES)] } = {}) {
  const uploadFn = upload ?? vi.fn(async () => ({ file: { id: 'f1' }, entry: { id: 'p1' } }));
  const Wrapper = ({ children }) => <UploadsProvider upload={uploadFn}>{children}</UploadsProvider>;
  renderWithProviders(<WalkRoom />, { initialEntries: [`/walk?at=${at}`], mocks: [...typeMocks, treeMock, ...extraMocks], wrapper: Wrapper });
  return { upload: uploadFn };
}

// A household's own type with a required field (no starter type has one).
const BIKE = (required = true) => ({
  __typename: 'ThingType',
  id: 'ty-bike',
  key: 'bike',
  name: 'Bike',
  icon: 'Inventory2',
  kind: 'item',
  builtIn: false,
  thingCount: 50,
  fields: [field('frameSize', 'Frame size', 'text', { required }), field('colour', 'Colour')],
});

const nameBox = () => screen.getByRole('textbox', { name: /Name/ });
const nextButton = () => screen.getByRole('button', { name: 'Next' });
const pickType = async (name) => fireEvent.click(await screen.findByRole('button', { name, pressed: false }));

const createMock = (input, thing) => ({ request: { query: CREATE_THING, variables: { input } }, result: { data: { createThing: thing } } });

beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    /* no storage */
  }
});

describe('Walk the room (/walk)', () => {
  it('shows the place on its unit tag, with a running count and a Done button', async () => {
    setup();
    expect(await screen.findByTestId('unit-tag')).toHaveTextContent('Garage');
    expect(screen.getByTestId('walk-count')).toHaveTextContent('0 added to Garage');
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });

  it('asks which room when `at` is missing', async () => {
    setup({ at: '' });
    expect(await screen.findByText('Which room are you walking?')).toBeInTheDocument();
  });

  it('saving two items keeps the place and the sticky type; the name resets for the next one', async () => {
    const thing1 = makeThing({ id: 't-new0', name: 'Jumper cables', parentId: 'n-garage', path: [], tags: [], relationships: [], dates: [], nextDue: null });
    const thing2 = makeThing({ id: 't-new1', name: 'Tow strap', parentId: 'n-garage', path: [], tags: [], relationships: [], dates: [], nextDue: null });
    const { upload } = setup({
      extraMocks: [
        createMock({ name: 'Jumper cables', typeId: 'ty-tool', parentId: 'n-garage', tags: [] }, thing1),
        createMock({ name: 'Tow strap', typeId: 'ty-tool', parentId: 'n-garage', tags: [] }, thing2),
      ],
    });

    await pickType('Tool');
    fireEvent.change(nameBox(), { target: { value: 'Jumper cables' } });
    fireEvent.click(nextButton());

    await waitFor(() => expect(screen.getByTestId('walk-count')).toHaveTextContent('1 added to Garage'));
    expect(nameBox()).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Tool' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('walk-item')).toHaveTextContent('Jumper cables');
    expect(screen.getByTestId('walk-item')).toHaveAttribute('data-status', 'saved');

    fireEvent.change(nameBox(), { target: { value: 'Tow strap' } });
    fireEvent.click(nextButton());
    await waitFor(() => expect(screen.getByTestId('walk-count')).toHaveTextContent('2 added to Garage'));
    expect(screen.getAllByTestId('walk-item')).toHaveLength(2);
    expect(upload).not.toHaveBeenCalled();
  });

  it("a failed save is kept, marked didn't save — retry, and Retry saves it", async () => {
    const thing = makeThing({ id: 't-new0', name: 'Drill', parentId: 'n-garage', path: [], tags: [], relationships: [], dates: [], nextDue: null });
    const input = { name: 'Drill', typeId: 'ty-general', parentId: 'n-garage', tags: [] };
    setup({
      extraMocks: [
        { request: { query: CREATE_THING, variables: { input } }, error: new Error('The network dropped.') },
        createMock(input, thing),
      ],
    });

    await screen.findByTestId('unit-tag');
    fireEvent.change(nameBox(), { target: { value: 'Drill' } });
    fireEvent.click(nextButton());

    await waitFor(() => expect(screen.getByTestId('walk-item')).toHaveAttribute('data-status', 'failed'));
    expect(screen.getByTestId('walk-item')).toHaveTextContent("Didn't save — retry");
    expect(screen.getByTestId('walk-count')).toHaveTextContent('0 added to Garage');
    // The name field is already clear again, ready for the next item — the failed one lives in the list.
    expect(nameBox()).toHaveValue('');

    fireEvent.click(within(screen.getByTestId('walk-item')).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByTestId('walk-item')).toHaveAttribute('data-status', 'saved'));
    expect(screen.getByTestId('walk-count')).toHaveTextContent('1 added to Garage');
  });

  it('with a photo: create first, then upload it onto the new thing (overview)', async () => {
    const thing = makeThing({ id: 't-new0', name: 'Rake', parentId: 'n-garage', path: [], tags: [], relationships: [], dates: [], nextDue: null });
    const order = [];
    const upload = vi.fn(async () => {
      order.push('upload');
      return { file: { id: 'f1' }, entry: { id: 'p1' } };
    });
    setup({
      upload,
      extraMocks: [
        {
          request: { query: CREATE_THING, variables: { input: { name: 'Rake', typeId: 'ty-general', parentId: 'n-garage', tags: [] } } },
          result: () => {
            order.push('create');
            return { data: { createThing: thing } };
          },
        },
      ],
    });

    await screen.findByTestId('unit-tag');
    const file = new File(['jpegbytes'], 'rake.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('walk-camera-input'), { target: { files: [file] } });
    expect(await screen.findByTestId('walk-photo-preview')).toBeInTheDocument();

    fireEvent.change(nameBox(), { target: { value: 'Rake' } });
    fireEvent.click(nextButton());

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(upload.mock.calls[0][0]).toBe('t-new0');
    expect(upload.mock.calls[0][1]).toMatchObject({ file, kind: 'photo', role: 'overview' });
    expect(order).toEqual(['create', 'upload']);
    // Reset for the next capture.
    expect(screen.queryByTestId('walk-photo-preview')).toBeNull();
  });

  it('a type with no required fields looks as before: no extra fields, no reason, Next enabled', async () => {
    setup();
    await pickType('Tool');
    expect(screen.queryByTestId('walk-required')).toBeNull();
    expect(screen.queryByTestId('walk-next-reason')).toBeNull();
    expect(nextButton()).toBeEnabled();
  });
});

describe('Walk the room — required fields', () => {
  const bikeThing = (id, name) => makeThing({ id, name, parentId: 'n-garage', path: [], tags: [], relationships: [], dates: [], nextDue: null });

  it('shows the picked type’s required field inline; Next is disabled with the reason until it is filled', async () => {
    setup({
      typeMocks: [typesMock([...TYPES, BIKE()])],
      extraMocks: [createMock({ name: 'Road bike', typeId: 'ty-bike', parentId: 'n-garage', tags: [], attributes: { frameSize: '56 cm' } }, bikeThing('t-bike1', 'Road bike'))],
    });

    await pickType('Bike');
    const section = screen.getByTestId('walk-required');
    // Only the REQUIRED field — Walk stays a quick capture, Colour waits for the thing page.
    expect(within(section).getByRole('textbox', { name: /Frame size/ })).toBeInTheDocument();
    expect(within(section).queryByRole('textbox', { name: /Colour/ })).toBeNull();

    fireEvent.change(nameBox(), { target: { value: 'Road bike' } });
    expect(nextButton()).toBeDisabled();
    expect(screen.getByTestId('walk-next-reason')).toHaveTextContent('Fill in Frame size to save.');
    expect(nextButton()).toHaveAttribute('aria-describedby', 'walk-next-reason');

    fireEvent.change(within(section).getByRole('textbox', { name: /Frame size/ }), { target: { value: '56 cm' } });
    expect(nextButton()).toBeEnabled();
    expect(screen.queryByTestId('walk-next-reason')).toBeNull();
    fireEvent.click(nextButton());

    await waitFor(() => expect(screen.getByTestId('walk-item')).toHaveAttribute('data-status', 'saved'));
    // The value resets with the name; the type sticks, so the next one asks again.
    expect(screen.getByRole('textbox', { name: /Frame size/ })).toHaveValue('');
    expect(nextButton()).toBeDisabled();
  });

  it('Enter in the name field does not slip past a missing required field', async () => {
    setup({ typeMocks: [typesMock([...TYPES, BIKE()])] });
    await pickType('Bike');
    fireEvent.change(nameBox(), { target: { value: 'Road bike' } });
    fireEvent.submit(screen.getByTestId('walk-form'));
    expect(await screen.findByText('Frame size is needed to save it.')).toBeInTheDocument();
    expect(screen.queryByTestId('walk-item')).toBeNull();
  });

  it('a server rejection for a field says which one, and it can be filled in place', async () => {
    // The types loaded before Frame size became required; the refetch after the rejection knows.
    const input = { name: 'Road bike', typeId: 'ty-bike', parentId: 'n-garage', tags: [] };
    setup({
      typeMocks: [
        { request: { query: GET_THING_TYPES }, result: { data: { thingTypes: [...TYPES, BIKE(false)] } } },
        typesMock([...TYPES, BIKE(true)]),
      ],
      extraMocks: [
        {
          request: { query: CREATE_THING, variables: { input } },
          result: {
            errors: [
              new GraphQLError('Invalid input', {
                extensions: { code: 'BAD_USER_INPUT', details: [{ path: 'input.attributes.frameSize', message: 'Frame size is required' }] },
              }),
            ],
          },
        },
        createMock({ ...input, attributes: { frameSize: '56 cm' } }, bikeThing('t-bike1', 'Road bike')),
      ],
    });

    await pickType('Bike');
    expect(screen.queryByTestId('walk-required')).toBeNull();
    fireEvent.change(nameBox(), { target: { value: 'Road bike' } });
    fireEvent.click(nextButton());

    const row = await screen.findByTestId('walk-item');
    await waitFor(() => expect(row).toHaveAttribute('data-status', 'needs'));
    expect(row).toHaveTextContent('Needs Frame size to save');
    // Not a dead-end Retry: the field itself, right there.
    expect(within(row).queryByRole('button', { name: 'Retry' })).toBeNull();
    const save = within(row).getByRole('button', { name: 'Save Road bike' });
    expect(save).toBeDisabled();
    // The capture row now asks for it too.
    await waitFor(() => expect(screen.getByTestId('walk-required')).toBeInTheDocument());

    fireEvent.change(within(row).getByRole('textbox', { name: /Frame size/ }), { target: { value: '56 cm' } });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() => expect(screen.getByTestId('walk-item')).toHaveAttribute('data-status', 'saved'));
    expect(screen.getByTestId('walk-count')).toHaveTextContent('1 added to Garage');
  });
});

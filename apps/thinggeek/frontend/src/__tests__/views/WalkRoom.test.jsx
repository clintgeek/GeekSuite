import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import WalkRoom from '../../views/walk/WalkRoom';
import { UploadsProvider } from '../../hooks/useUploads';
import { CREATE_THING } from '../../graphql/mutations';
import { GET_THING_TREE, GET_THING_TYPES } from '../../graphql/queries';
import { renderWithProviders } from '../testUtils';
import { NODES, TYPES, makeThing } from '../fixtures';

const many = (m) => ({ ...m, maxUsageCount: 20 });

const baseMocks = [
  many({ request: { query: GET_THING_TYPES }, result: { data: { thingTypes: TYPES } } }),
  many({ request: { query: GET_THING_TREE }, result: { data: { thingTree: NODES } } }),
];

function setup({ at = 'n-garage', extraMocks = [], upload } = {}) {
  const uploadFn = upload ?? vi.fn(async () => ({ file: { id: 'f1' }, entry: { id: 'p1' } }));
  const Wrapper = ({ children }) => <UploadsProvider upload={uploadFn}>{children}</UploadsProvider>;
  renderWithProviders(<WalkRoom />, { initialEntries: [`/walk?at=${at}`], mocks: [...baseMocks, ...extraMocks], wrapper: Wrapper });
  return { upload: uploadFn };
}

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

describe('Walk the room', () => {
  it('shows the place as tape, with a running count and a Done button', async () => {
    setup();
    expect(await screen.findByTestId('dymo-tape')).toHaveTextContent('Garage');
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

    await screen.findByTestId('dymo-tape');
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

    await screen.findByTestId('dymo-tape');
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
});

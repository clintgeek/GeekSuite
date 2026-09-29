import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes, useParams } from 'react-router-dom';
import AddThing, { LAST_PLACE_KEY, orderTypes } from '../../views/add/AddThing';
import { UploadsProvider } from '../../hooks/useUploads';
import { CREATE_THING } from '../../graphql/mutations';
import { GET_THING, GET_THINGS, GET_THING_FACETS, GET_THING_TREE, GET_THING_TYPES } from '../../graphql/queries';
import { renderWithProviders } from '../testUtils';
import { NODES, TYPES, makeThing } from '../fixtures';

const many = (m) => ({ ...m, maxUsageCount: 20 });

const facets = {
  __typename: 'ThingFacets', total: 0, types: [], tags: [{ __typename: 'ThingFacetValue', value: 'fishing', count: 1 }], where: [], kinds: [], due: [], missing: [], acquiredYears: [], hasPhotos: 0, hasDocuments: 0,
};

/** `creates`: the create inputs the test expects, in order: [{ name, typeId, parentId }]. */
function setup({ entry = '/add', creates = [{ name: 'Wendy', typeId: 'ty-boat', parentId: null }] } = {}) {
  const made = creates.map((c, i) => makeThing({ id: `t-new${i}`, name: c.name, parentId: c.parentId, path: [], tags: [], relationships: [], dates: [], nextDue: null }));
  const order = [];
  const createResults = made.map((thing) =>
    vi.fn(() => {
      order.push('create');
      return { data: { createThing: thing } };
    })
  );
  const mocks = [
    many({ request: { query: GET_THING_TYPES }, result: { data: { thingTypes: TYPES } } }),
    many({ request: { query: GET_THING_TREE }, result: { data: { thingTree: NODES } } }),
    many({ request: { query: GET_THING_FACETS }, result: { data: { thingFacets: facets } } }),
    ...made.map((thing) => many({ request: { query: GET_THING, variables: { id: thing.id } }, result: { data: { thing } } })),
    // The in-place list refresh after a create (hooks/useLibrary.js refreshLibraryList).
    many({ request: { query: GET_THINGS, variables: { page: 1, limit: 48, sort: 'name', sortDir: 'asc' } }, result: { data: { things: { __typename: 'ThingPage', total: 1, page: 1, pages: 1, things: made } } } }),
    ...creates.map((c, i) => ({ request: { query: CREATE_THING, variables: { input: { ...c, tags: [] } } }, result: createResults[i] })),
  ];
  const upload = vi.fn(async () => {
    order.push('upload');
    return { file: { id: 'f1' }, entry: { id: 'p1' } };
  });

  function Landed() {
    const { id } = useParams();
    return <p>Landed on {id}</p>;
  }
  const Wrapper = ({ children }) => <UploadsProvider upload={upload}>{children}</UploadsProvider>;
  renderWithProviders(
    <Routes>
      <Route path="/add" element={<AddThing />} />
      <Route path="/thing/:id" element={<Landed />} />
    </Routes>,
    { initialEntries: [entry], mocks, wrapper: Wrapper }
  );
  return { createResults, upload, order };
}

const nameBox = () => screen.getByRole('textbox', { name: /Name/ });
const pickType = async (name) => fireEvent.click(await screen.findByRole('button', { name, pressed: false }));

beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    /* no storage */
  }
});

describe('add a thing, on one screen', () => {
  it('photo, name, type and where are all on the first screen — no Skip, no steps', async () => {
    setup();
    expect(await screen.findByTestId('add-photo-slot')).toBeInTheDocument();
    expect(nameBox()).toBeInTheDocument();
    expect(await screen.findByRole('group', { name: 'Type' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /^Where it is:/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Skip/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save & add another' })).toBeInTheDocument();
  });

  it('Save creates it and lands on the new thing', async () => {
    const { createResults, upload } = setup();
    await pickType('Boat');
    fireEvent.change(nameBox(), { target: { value: 'Wendy' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Landed on t-new0')).toBeInTheDocument();
    expect(createResults[0]).toHaveBeenCalledTimes(1);
    expect(upload).not.toHaveBeenCalled();
  });

  it('refuses to save without a name', async () => {
    const { createResults } = setup();
    await pickType('Boat');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('A thing needs a name.')).toBeInTheDocument();
    expect(createResults[0]).not.toHaveBeenCalled();
  });

  it('with a photo: say what it shows; create first, then upload it onto the new thing with its role', async () => {
    const { upload, order } = setup();
    // The role chips belong to a photo: none until there is one.
    expect(screen.queryByRole('group', { name: 'Photo role' })).toBeNull();
    const file = new File(['jpegbytes'], 'wendy.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('add-file-input'), { target: { files: [file] } });
    expect(await screen.findByTestId('add-photo-preview')).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('group', { name: 'Photo role' })).getByRole('button', { name: 'ID plate' }));
    await pickType('Boat');
    fireEvent.change(nameBox(), { target: { value: 'Wendy' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Landed on t-new0')).toBeInTheDocument();
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(upload.mock.calls[0][0]).toBe('t-new0');
    expect(upload.mock.calls[0][1]).toMatchObject({ file, kind: 'photo', role: 'id-plate' });
    expect(order).toEqual(['create', 'upload']);
  });

  it('Save & add another stays here: the same place and type, the photo and name cleared', async () => {
    const { createResults, upload } = setup({
      entry: { pathname: '/add', state: { parentId: 'n-van' } },
      creates: [
        { name: 'Jumper cables', typeId: 'ty-tool', parentId: 'n-van' },
        { name: 'Tow strap', typeId: 'ty-tool', parentId: 'n-van' },
      ],
    });
    await pickType('Tool');
    fireEvent.change(nameBox(), { target: { value: 'Jumper cables' } });
    const file = new File(['jpegbytes'], 'cables.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('add-file-input'), { target: { files: [file] } });
    expect(await screen.findByTestId('add-photo-preview')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save & add another' }));
    await waitFor(() => expect(createResults[0]).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Jumper cables added/)).toBeInTheDocument();
    // Still here, ready for the next one.
    expect(screen.queryByText(/Landed on/)).toBeNull();
    await waitFor(() => expect(nameBox()).toHaveValue(''));
    expect(screen.queryByTestId('add-photo-preview')).toBeNull();
    expect(screen.getByRole('button', { name: 'Tool' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Where it is: House › Garage › Van. Change' })).toBeInTheDocument();
    // The first photo still went up, onto the first thing.
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(upload.mock.calls[0][0]).toBe('t-new0');

    fireEvent.change(nameBox(), { target: { value: 'Tow strap' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Landed on t-new1')).toBeInTheDocument();
    expect(createResults[1]).toHaveBeenCalledTimes(1);
  });

  it('"Add here" arrives with where it is already chosen', async () => {
    const { createResults } = setup({ entry: { pathname: '/add', state: { parentId: 'n-van' } }, creates: [{ name: 'Wendy', typeId: 'ty-boat', parentId: 'n-van' }] });
    expect(await screen.findByRole('button', { name: 'Where it is: House › Garage › Van. Change' })).toBeInTheDocument();
    await pickType('Boat');
    fireEvent.change(nameBox(), { target: { value: 'Wendy' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Landed on t-new0')).toBeInTheDocument();
    expect(createResults[0]).toHaveBeenCalledTimes(1);
  });

  it('where defaults to the last place something was added', async () => {
    window.localStorage.setItem(LAST_PLACE_KEY, JSON.stringify('n-shelf'));
    setup({ creates: [{ name: 'Drill', typeId: 'ty-tool', parentId: 'n-shelf' }] });
    expect(await screen.findByRole('button', { name: 'Where it is: House › Garage › Shelf 2. Change' })).toBeInTheDocument();
    await pickType('Tool');
    fireEvent.change(nameBox(), { target: { value: 'Drill' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Landed on t-new0')).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(LAST_PLACE_KEY))).toBe('n-shelf');
  });
});

describe('the type chips', () => {
  it('most-used first; General and locations last', () => {
    const types = [
      { id: 'a', key: 'location', kind: 'location', thingCount: 40 },
      { id: 'b', key: 'general', kind: 'item', thingCount: 30 },
      { id: 'c', key: 'tool', kind: 'item', thingCount: 2 },
      { id: 'd', key: 'boat', kind: 'container', thingCount: 9 },
      { id: 'e', key: 'camera', kind: 'item', thingCount: 2 },
    ];
    expect(orderTypes(types).map((t) => t.key)).toEqual(['boat', 'tool', 'camera', 'general', 'location']);
  });

  it('"More types" brings in the rest', async () => {
    setup();
    await screen.findByRole('button', { name: 'Boat' });
    expect(screen.queryByRole('button', { name: 'Location' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'More types' }));
    expect(screen.getByRole('button', { name: 'Location' })).toBeInTheDocument();
  });
});

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes, useParams } from 'react-router-dom';
import AddThing from '../../views/add/AddThing';
import { UploadsProvider } from '../../hooks/useUploads';
import { CREATE_THING } from '../../graphql/mutations';
import { GET_PLACES, GET_THING, GET_THINGS, GET_THING_FACETS, GET_THING_TYPES } from '../../graphql/queries';
import { renderWithProviders } from '../testUtils';
import { PLACES, TYPES, makeThing } from '../fixtures';

const many = (m) => ({ ...m, maxUsageCount: 20 });

const facets = {
  __typename: 'ThingFacets', total: 0, types: [], tags: [{ __typename: 'ThingFacetValue', value: 'fishing', count: 1 }], places: [], due: [], missing: [], acquiredYears: [], hasPhotos: 0, hasDocuments: 0,
};

function setup() {
  const created = makeThing({ id: 't-new', name: 'Wendy', place: null, tags: [], relationships: [], dates: [], nextDue: null });
  const createResult = vi.fn(() => ({ data: { createThing: created } }));
  const mocks = [
    many({ request: { query: GET_THING_TYPES }, result: { data: { thingTypes: TYPES } } }),
    many({ request: { query: GET_PLACES }, result: { data: { places: PLACES } } }),
    many({ request: { query: GET_THING_FACETS }, result: { data: { thingFacets: facets } } }),
    many({ request: { query: GET_THING, variables: { id: 't-new' } }, result: { data: { thing: created } } }),
    // The in-place list refresh after a create (hooks/useLibrary.js refreshLibraryList).
    many({ request: { query: GET_THINGS, variables: { page: 1, limit: 48, sort: 'name', sortDir: 'asc' } }, result: { data: { things: { __typename: 'ThingPage', total: 1, page: 1, pages: 1, things: [created] } } } }),
    { request: { query: CREATE_THING, variables: { input: { name: 'Wendy', typeId: 'ty-boat', placeId: null, tags: [] } } }, result: createResult },
  ];
  const upload = vi.fn(async () => ({ file: { id: 'f1' }, entry: { id: 'p1' } }));
  const order = [];
  createResult.mockImplementation(() => {
    order.push('create');
    return { data: { createThing: created } };
  });
  upload.mockImplementation(async () => {
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
    { initialEntries: ['/add'], mocks, wrapper: Wrapper }
  );
  return { createResult, upload, order };
}

async function toNameStep() {
  fireEvent.click(await screen.findByRole('radio', { name: /Boat/ }));
  return screen.findByRole('textbox', { name: /Name/ });
}

describe('add a thing', () => {
  it('the photo is optional: skip → type → name → Create lands on the new thing', async () => {
    const { createResult, upload } = setup();
    expect(screen.getByTestId('add-step-0')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Skip — no photo yet' }));
    expect(await screen.findByTestId('add-step-1')).toBeInTheDocument();
    const name = await toNameStep();
    expect(screen.getByTestId('add-step-2')).toBeInTheDocument();
    expect(screen.getByText('Name this boat')).toBeInTheDocument();
    fireEvent.change(name, { target: { value: 'Wendy' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByText('Landed on t-new')).toBeInTheDocument();
    expect(createResult).toHaveBeenCalledTimes(1);
    expect(upload).not.toHaveBeenCalled();
  });

  it('refuses to create without a name', async () => {
    const { createResult } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Skip — no photo yet' }));
    await toNameStep();
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByText('A thing needs a name.')).toBeInTheDocument();
    expect(createResult).not.toHaveBeenCalled();
  });

  it('with a photo: create first, then upload it onto the new thing with its role', async () => {
    const { upload, order } = setup();
    const file = new File(['jpegbytes'], 'wendy.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('add-file-input'), { target: { files: [file] } });
    expect(await screen.findByTestId('add-photo-preview')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ID plate' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    const name = await toNameStep();
    fireEvent.change(name, { target: { value: 'Wendy' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByText('Landed on t-new')).toBeInTheDocument();
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(upload.mock.calls[0][0]).toBe('t-new');
    expect(upload.mock.calls[0][1]).toMatchObject({ file, kind: 'photo', role: 'id-plate' });
    expect(order).toEqual(['create', 'upload']);
  });
});

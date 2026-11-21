// Runs in America/Chicago (vitest.config.js).
import React from 'react';
import { GraphQLError } from 'graphql';
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConfirmTaskDialog, { readErrorMessage } from '../../components/ConfirmTaskDialog.jsx';
import { READ_CIRCLED_INK } from '../../graphql/documents.js';
import { renderDay } from '../helpers.jsx';

const TODAY = '2026-11-20';
const NOW = new Date(2026, 10, 20, 9, 0, 0);
const CROP = { shapeIds: ['shape:a'], image: { base64: 'iVBORw0KGgo=', mediaType: 'image/png' } };
const request = { query: READ_CIRCLED_INK, variables: { image: CROP.image.base64, mediaType: 'image/png' } };
const reads = (text) => ({ request, result: { data: { transcribeSketch: { __typename: 'SketchTranscript', text } } } });

function setup(mocks, handlers = {}) {
  const props = { crop: CROP, dayKey: TODAY, now: NOW, onClose: vi.fn(), onCreate: vi.fn().mockResolvedValue({}), ...handlers };
  renderDay(<ConfirmTaskDialog {...props} />, { mocks });
  return props;
}

describe('ConfirmTaskDialog (circle to task)', () => {
  it('sends only the crop to be read: no note id, so the page’s own transcript is never replaced', () => {
    const variables = READ_CIRCLED_INK.definitions[0].variableDefinitions.map((v) => v.variable.name.value);
    expect(variables).toEqual(['image', 'mediaType']);
  });

  it('shows the reading and its date and time before anything is created (spec reqs 9, 10)', async () => {
    const props = setup([reads('* call vet fri 2pm')]);
    expect(screen.getByTestId('confirm-reading')).toBeInTheDocument();
    const field = await screen.findByRole('textbox', { name: 'Task' });
    expect(field).toHaveValue('call vet fri 2pm');
    expect(screen.getByTestId('confirm-task-summary')).toHaveTextContent(/Fri, Nov 27/);
    expect(screen.getByTestId('confirm-task-summary')).toHaveTextContent(/2:00\sPM/);
    expect(screen.getByRole('img', { name: 'The handwriting you circled' })).toBeInTheDocument();
    expect(props.onCreate).not.toHaveBeenCalled();
  });

  it('creates the task only on Create, with the corrected text and one idempotency key', async () => {
    const props = setup([reads('call vel fri 2pm')]);
    const field = await screen.findByRole('textbox', { name: 'Task' });
    await userEvent.clear(field);
    await userEvent.type(field, 'call vet friday 3pm');
    await userEvent.click(screen.getByRole('button', { name: 'Create task' }));
    expect(props.onCreate).toHaveBeenCalledTimes(1);
    const [reading, clientId] = props.onCreate.mock.calls[0];
    expect(reading.input.content).toBe('call vet');
    expect(new Date(reading.input.dueDate).getHours()).toBe(15);
    expect(clientId).toMatch(/^gd:/);
  });

  it('cancelling creates nothing (spec req 10)', async () => {
    const props = setup([reads('buy feed')]);
    await screen.findByRole('textbox', { name: 'Task' });
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(props.onClose).toHaveBeenCalled();
    expect(props.onCreate).not.toHaveBeenCalled();
  });

  it('says so and creates no task when the reading fails (spec req 11)', async () => {
    const props = setup([{ request, error: new Error('network down') }]);
    const alert = await screen.findByTestId('confirm-failed');
    expect(alert).toHaveTextContent('Couldn’t read that handwriting.');
    expect(alert).toHaveTextContent('No task was created.');
    expect(screen.queryByRole('button', { name: 'Create task' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Task' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(props.onCreate).not.toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
  });

  it('treats "no writing" as a failed reading, not an empty task', async () => {
    setup([reads('[no writing]')]);
    expect(await screen.findByTestId('confirm-failed')).toHaveTextContent('No writing was found');
  });

  it('can try the reading again', async () => {
    setup([{ request, error: new Error('timeout') }, reads('buy feed')]);
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('textbox', { name: 'Task' })).toHaveValue('buy feed');
  });

  it('stays open with the text when the create fails, and retries with the same key', async () => {
    const onCreate = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({});
    setup([reads('buy feed')], { onCreate });
    await screen.findByRole('textbox', { name: 'Task' });
    await userEvent.click(screen.getByRole('button', { name: 'Create task' }));
    expect(await screen.findByTestId('confirm-create-error')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Task' })).toHaveValue('buy feed');
    await userEvent.click(screen.getByRole('button', { name: 'Create task' }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(2));
    expect(onCreate.mock.calls[1][1]).toBe(onCreate.mock.calls[0][1]);
  });

  it('will not create a task with no words', async () => {
    setup([reads('buy feed')]);
    const field = await screen.findByRole('textbox', { name: 'Task' });
    await userEvent.clear(field);
    expect(screen.getByRole('button', { name: 'Create task' })).toBeDisabled();
  });

  it('renders nothing without a crop', () => {
    setup([], { crop: null });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('words the daily cap and an oversized crop for the user', () => {
    const coded = (code) => ({ graphQLErrors: [new GraphQLError('x', { extensions: { code } })] });
    expect(readErrorMessage(coded('AI_CAP'))).toMatch(/used up/);
    expect(readErrorMessage(coded('AI_EMPTY'))).toMatch(/No writing/);
    expect(readErrorMessage({ networkError: { statusCode: 413 } })).toMatch(/smaller part/);
    expect(readErrorMessage(coded('AI_UNAVAILABLE'))).toMatch(/Couldn’t read/);
  });
});

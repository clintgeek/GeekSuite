/**
 * "Take a photo / Choose a file" is one design on every screen that offers it:
 * the camera orange, the file outlined beside it.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import AddFileSheet from '../../views/detail/AddFileSheet';
import { CaptureSlot } from '../../views/attic/CardCapture';
import { renderWithProviders } from '../testUtils';

const pairIn = (root = document.body) => within(root).getByTestId('photo-pair');

describe('one photo pair', () => {
  it("a thing's Add photo sheet: camera first and orange, file outlined", () => {
    renderWithProviders(<AddFileSheet open kind="photo" roles={['overview']} thingName="Wendy" onClose={() => {}} onFile={vi.fn()} />);
    const pair = pairIn();
    const [first, second] = within(pair).getAllByRole('button');
    expect(first).toHaveTextContent('Take a photo');
    expect(first.className).toMatch(/MuiButton-contained/);
    expect(second).toHaveTextContent('Choose a file');
    expect(second.className).toMatch(/MuiButton-outlined/);
  });

  it('a document has no camera: Choose a file takes the orange', () => {
    renderWithProviders(<AddFileSheet open kind="document" roles={['receipt']} thingName="Wendy" onClose={() => {}} onFile={vi.fn()} />);
    const buttons = within(pairIn()).getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveTextContent('Choose a file');
    expect(buttons[0].className).toMatch(/MuiButton-contained/);
  });

  it('the Attic capture slot uses the same pair', () => {
    renderWithProviders(<CaptureSlot label="Front" card value={null} onChange={() => {}} testId="capture-front" />);
    const [first, second] = within(pairIn()).getAllByRole('button');
    expect(first).toHaveTextContent('Take a photo');
    expect(first.className).toMatch(/MuiButton-contained/);
    expect(second.className).toMatch(/MuiButton-outlined/);
  });
});

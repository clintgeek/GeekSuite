import React from 'react';
import { describe, expect, it } from 'vitest';
import { act, render } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';
import { UploadsProvider, useUploads } from '../../hooks/useUploads';

function setup(upload) {
  let api;
  function Grab() {
    api = useUploads();
    return null;
  }
  render(
    <MockedProvider mocks={[]}>
      <UploadsProvider upload={upload}>
        <Grab />
      </UploadsProvider>
    </MockedProvider>
  );
  return () => api;
}

const unloadPrevented = () => {
  const e = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
};

describe('uploads — leaving the tab mid-upload (finding 5)', () => {
  it('the browser warns while a photo is still uploading, and not otherwise', async () => {
    let finish;
    const upload = () => new Promise((resolve, reject) => { finish = { resolve, reject }; });
    const api = setup(upload);
    expect(unloadPrevented()).toBe(false);

    act(() => {
      api().enqueue('t1', { file: new File(['x'], 'p.jpg', { type: 'image/jpeg' }) });
    });
    expect(unloadPrevented()).toBe(true);

    await act(async () => {
      finish.reject(new Error('dropped'));
    });
    expect(api().items[0].status).toBe('failed');
    expect(unloadPrevented()).toBe(false);
  });
});

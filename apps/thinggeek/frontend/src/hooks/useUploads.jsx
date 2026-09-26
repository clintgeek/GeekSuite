/**
 * Uploads outlive the screen that started them. A photo taken in the Add
 * flow keeps uploading while the person lands on the new thing's page, opens
 * another, or goes back to the library — so the queue lives at the app root,
 * and any screen reads the uploads for its thing (progress, a preview of the
 * bytes still in flight, Retry on failure).
 *
 * On success the thing is re-read from the gateway (its photos, documents,
 * cover and `missing` all change), which updates `Thing:<id>` everywhere.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useApolloClient } from '@apollo/client';
import { uploadThingFile } from '../api/rest';
import { GET_THING } from '../graphql/queries';
import { resetCounts } from '../graphql/cachePolicies';

const UploadsContext = createContext(null);

let seq = 0;

export function UploadsProvider({ children, upload = uploadThingFile }) {
  const client = useApolloClient();
  const [items, setItems] = useState([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const patch = useCallback((key, next) => setItems((list) => list.map((it) => (it.key === key ? { ...it, ...next } : it))), []);

  const run = useCallback(
    async (item) => {
      patch(item.key, { status: 'uploading', progress: 0, error: null });
      try {
        await upload(
          item.thingId,
          { file: item.file, kind: item.kind, role: item.role, caption: item.caption, title: item.title },
          { onProgress: (p) => patch(item.key, { progress: p }) }
        );
        patch(item.key, { status: 'done', progress: 1 });
        try {
          await client.query({ query: GET_THING, variables: { id: item.thingId }, fetchPolicy: 'network-only' });
        } catch {
          /* the page re-reads on its own next time */
        }
        resetCounts(client);
        // The real photo is in the thing now; drop the in-flight preview.
        setItems((list) => {
          const done = list.find((it) => it.key === item.key);
          if (done?.previewUrl) URL.revokeObjectURL?.(done.previewUrl);
          return list.filter((it) => it.key !== item.key);
        });
      } catch (err) {
        patch(item.key, { status: 'failed', error: err?.message || 'The upload failed.' });
      }
    },
    [client, patch, upload]
  );

  const enqueue = useCallback(
    (thingId, { file, kind = 'photo', role, caption, title }) => {
      seq += 1;
      let previewUrl = null;
      try {
        if (kind === 'photo' && file && typeof URL !== 'undefined' && URL.createObjectURL) previewUrl = URL.createObjectURL(file);
      } catch {
        previewUrl = null;
      }
      const item = {
        key: `u${seq}`,
        thingId,
        file,
        kind,
        role: role || (kind === 'photo' ? 'overview' : 'other'),
        caption,
        title,
        name: file?.name || (kind === 'photo' ? 'Photo' : 'Document'),
        previewUrl,
        progress: 0,
        status: 'uploading',
        error: null,
      };
      setItems((list) => [...list, item]);
      run(item);
      return item.key;
    },
    [run]
  );

  const retry = useCallback(
    (key) => {
      const item = itemsRef.current.find((it) => it.key === key);
      if (item) run(item);
    },
    [run]
  );

  const dismiss = useCallback((key) => {
    setItems((list) => {
      const it = list.find((x) => x.key === key);
      if (it?.previewUrl) URL.revokeObjectURL?.(it.previewUrl);
      return list.filter((x) => x.key !== key);
    });
  }, []);

  useEffect(
    () => () => {
      itemsRef.current.forEach((it) => it.previewUrl && URL.revokeObjectURL?.(it.previewUrl));
    },
    []
  );

  const value = useMemo(() => ({ items, enqueue, retry, dismiss }), [items, enqueue, retry, dismiss]);
  return <UploadsContext.Provider value={value}>{children}</UploadsContext.Provider>;
}

const NO_UPLOADS = { items: [], enqueue: () => null, retry: () => {}, dismiss: () => {} };

/** The queue, optionally narrowed to one thing's uploads. */
export function useUploads(thingId) {
  const ctx = useContext(UploadsContext) ?? NO_UPLOADS;
  const items = useMemo(() => (thingId ? ctx.items.filter((it) => it.thingId === thingId) : ctx.items), [ctx.items, thingId]);
  return { ...ctx, items };
}

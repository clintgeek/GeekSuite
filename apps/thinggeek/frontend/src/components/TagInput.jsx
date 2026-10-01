/**
 * Tags: type and press Enter (or comma) to add; the household's existing
 * tags are offered as you type so "fishing" doesn't become "Fishing" and
 * "fish" on three different boats.
 *
 * Tags are spelled in the suite standard (`@geeksuite/tags`, 2026-10-01):
 * lowercase kebab-case, `/` for nesting. A tag is normalized when it is
 * ADDED (Enter, comma, blur, pick) — `Fly Rods` becomes the chip
 * `fly-rods` — not while it is being typed, which would eat the space
 * before the second word arrived.
 */
import React, { useMemo, useState } from 'react';
import { Autocomplete, Chip, TextField } from '@mui/material';
import { useQuery } from '@apollo/client';
import { normalizeTag as standardTag } from '@geeksuite/tags';
import { GET_THING_FACETS } from '../graphql/queries';

const MAX_TAGS = 50;
const MAX_LEN = 60;

/** One typed tag → the standard spelling, inside ThingGeek's 60-character cap. */
export function normalizeTag(raw) {
  const tag = standardTag(String(raw || ''));
  return tag.length <= MAX_LEN ? tag : tag.slice(0, MAX_LEN).replace(/[-/]+$/, '');
}

export function addTags(current, raw) {
  const next = current.map(normalizeTag).filter(Boolean);
  String(raw || '')
    .split(',')
    .map(normalizeTag)
    .filter(Boolean)
    .forEach((t) => {
      if (!next.includes(t)) next.push(t);
    });
  return [...new Set(next)].slice(0, MAX_TAGS);
}

export default function TagInput({ value = [], onChange, label = 'Tags', id }) {
  const { data } = useQuery(GET_THING_FACETS, { fetchPolicy: 'cache-first' });
  const known = useMemo(() => (data?.thingFacets?.tags ?? []).map((t) => t.value), [data]);
  const [input, setInput] = useState('');

  return (
    <Autocomplete
      multiple
      freeSolo
      id={id}
      options={known}
      value={value}
      inputValue={input}
      onInputChange={(_e, v, reason) => {
        if (reason === 'reset') return setInput('');
        if (v.includes(',')) {
          onChange(addTags(value, v));
          setInput('');
          return undefined;
        }
        return setInput(v);
      }}
      onChange={(_e, next) => onChange(addTags([], next.join(',')))}
      filterSelectedOptions
      renderTags={(tags, getTagProps) =>
        tags.map((tag, index) => {
          const { key, ...rest } = getTagProps({ index });
          return <Chip key={key} {...rest} label={tag} size="small" variant="outlined" sx={{ height: 28, color: 'text.primary', borderColor: 'border' }} />;
        })
      }
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={value.length ? '' : 'fishing, shop, hunting'}
          onBlur={(e) => {
            if (input.trim()) {
              onChange(addTags(value, input));
              setInput('');
            }
            params.inputProps?.onBlur?.(e);
          }}
          helperText="Press Enter or comma to add a tag."
        />
      )}
    />
  );
}

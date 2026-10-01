import { describe, expect, it } from 'vitest';
import { attributeErrorsFrom, fieldList, missingRequired } from '../../utils/attributes';

const details = [
  { path: 'input.attributes.frameSize', message: 'Frame size is required' },
  { path: 'input.name', message: 'name is required' },
];

describe('attributeErrorsFrom', () => {
  it('reads BAD_USER_INPUT details off graphQLErrors', () => {
    expect(attributeErrorsFrom({ graphQLErrors: [{ extensions: { code: 'BAD_USER_INPUT', details } }] })).toEqual([{ key: 'frameSize', message: 'Frame size is required' }]);
  });

  it('reads them off an HTTP 400 network error too (how the gateway actually answers)', () => {
    const err = { graphQLErrors: [], networkError: { statusCode: 400, result: { errors: [{ message: 'Invalid input', extensions: { code: 'BAD_USER_INPUT', details } }] } } };
    expect(attributeErrorsFrom(err)).toEqual([{ key: 'frameSize', message: 'Frame size is required' }]);
  });

  it('is empty for a plain failure', () => {
    expect(attributeErrorsFrom(new Error('The network dropped.'))).toEqual([]);
    expect(attributeErrorsFrom(null)).toEqual([]);
  });
});

describe('missingRequired / fieldList', () => {
  const fields = [
    { key: 'a', label: 'Frame size', kind: 'text', required: true },
    { key: 'b', label: 'Tubeless', kind: 'boolean', required: true },
    { key: 'c', label: 'Colour', kind: 'text', required: false },
  ];

  it('lists the required fields still empty; a boolean No counts as an answer', () => {
    expect(missingRequired(fields, {}).map((f) => f.key)).toEqual(['a', 'b']);
    expect(missingRequired(fields, { a: '  ', b: false }).map((f) => f.key)).toEqual(['a']);
    expect(missingRequired(fields, { a: '56', b: false })).toEqual([]);
  });

  it('names them in a sentence', () => {
    expect(fieldList([{ label: 'A' }])).toBe('A');
    expect(fieldList([{ label: 'A' }, { label: 'B' }])).toBe('A and B');
    expect(fieldList([{ label: 'A' }, { label: 'B' }, { label: 'C' }])).toBe('A, B and C');
  });
});

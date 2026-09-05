// Unit coverage for the shared BURN_REVIEW #4/#18 fix: every
// create/update controller routes req.body through withoutOwnerFields
// before merging it into a Mongoose create/findOneAndUpdate call, so a
// caller can never set or reassign a record's owner via the body.

import { withoutOwnerFields } from '../../utils/ownerFields.js';

describe('withoutOwnerFields', () => {
  test('strips ownerId', () => {
    expect(withoutOwnerFields({ ownerId: 'victim', name: 'Henrietta' }))
      .toEqual({ name: 'Henrietta' });
  });

  test('strips common owner aliases (owner_id, owner, userId, user_id)', () => {
    expect(withoutOwnerFields({
      owner_id: 'victim',
      owner: 'victim',
      userId: 'victim',
      user_id: 'victim',
      name: 'Henrietta',
    })).toEqual({ name: 'Henrietta' });
  });

  test('strips _id so a caller cannot smuggle a document-replace via id reassignment', () => {
    expect(withoutOwnerFields({ _id: 'someone-elses-doc', name: 'Henrietta' }))
      .toEqual({ name: 'Henrietta' });
  });

  test('leaves every other field untouched', () => {
    const body = { name: 'Henrietta', tagId: 'T-001', sex: 'hen' };
    expect(withoutOwnerFields(body)).toEqual(body);
  });

  test('does not mutate the original body', () => {
    const body = { ownerId: 'victim', name: 'Henrietta' };
    withoutOwnerFields(body);
    expect(body).toEqual({ ownerId: 'victim', name: 'Henrietta' });
  });

  test('is safe against undefined/null', () => {
    expect(withoutOwnerFields(undefined)).toEqual({});
    expect(withoutOwnerFields(null)).toEqual({});
  });
});

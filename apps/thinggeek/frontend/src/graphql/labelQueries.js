/**
 * The label page's own, deliberately light query: a sticker needs a name and
 * a breadcrumb, not photos, dates or attributes. Reuses the shared
 * `ThingCardFields` fragment (src/graphql/queries.js) rather than a new one,
 * so a label and a library card never drift on what "the same thing" means.
 */
import { gql } from '@apollo/client';
import { THING_CARD_FIELDS } from './queries';

export const GET_LABEL_THING = gql`
  query GetLabelThing($id: ID!) {
    thing(id: $id) {
      ...ThingCardFields
    }
  }
  ${THING_CARD_FIELDS}
`;

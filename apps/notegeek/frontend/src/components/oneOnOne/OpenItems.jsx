import React, { useId, useState } from 'react';
import { Box, ButtonBase, Checkbox, Collapse, Typography, useTheme } from '@mui/material';
import ExpandMore from '@mui/icons-material/ExpandMore';
import { gql, useMutation, useQuery } from '@apollo/client';
import { graphiteTokens } from '../../theme/tokens';

/** TodoGeek's open tasks carrying one person's tag. */
export const GET_OPEN_ITEMS = gql`
  query GetOneOnOneOpenItems($tags: [String]) {
    tasks(status: "pending", tags: $tags) {
      id
      content
      status
      dueDate
    }
  }
`;

export const COMPLETE_OPEN_ITEM = gql`
  mutation CompleteOneOnOneItem($id: ID!) {
    updateTaskStatus(id: $id, status: "completed") {
      id
      status
    }
  }
`;

const dueLabel = (value) => {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

/**
 * OpenItems — what is still open with one person (DOCS/ONE_ON_ONE_SPEC.md
 * req 3, 4): TodoGeek's pending tasks tagged with the person. A row's box
 * marks the task done in TodoGeek.
 *
 * `strip`: the compact form above a 1:1 page. It draws nothing when there is
 * nothing open (or TodoGeek cannot be read), so a note never gains an empty
 * bar. Without it (the person's page) an empty list says so.
 */
export default function OpenItems({ tag, name, strip = false, defaultOpen = true }) {
  const theme = useTheme();
  const g = graphiteTokens(theme);
  const listId = useId();
  const [open, setOpen] = useState(defaultOpen);
  const [failed, setFailed] = useState(null);
  const { data, error } = useQuery(GET_OPEN_ITEMS, { variables: { tags: [tag] }, fetchPolicy: 'cache-and-network', skip: !tag });
  const [complete, { loading: completing }] = useMutation(COMPLETE_OPEN_ITEM, {
    refetchQueries: [{ query: GET_OPEN_ITEMS, variables: { tags: [tag] } }],
    awaitRefetchQueries: true,
  });

  const items = (data?.tasks || []).filter((t) => t.status === 'pending');
  if (strip && (error || items.length === 0)) return null;

  const done = async (id) => {
    setFailed(null);
    try {
      await complete({ variables: { id } });
    } catch {
      setFailed(id);
    }
  };

  const heading = `Open with ${name}`;
  return (
    <Box
      component="section"
      aria-label={heading}
      data-testid="one-on-one-open"
      data-open-count={items.length}
      sx={{
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: '8px',
        bgcolor: 'background.paper',
        mb: '8px',
        overflow: 'hidden',
      }}
    >
      <ButtonBase
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={listId}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          minHeight: 44,
          px: '12px',
          textAlign: 'left',
          '&:focus-visible': { outline: `2px solid ${g.ink}`, outlineOffset: -2 },
        }}
      >
        <Typography component="span" sx={{ fontSize: '0.8125rem', fontWeight: 650, color: 'text.primary' }}>
          {heading}
          <Box component="span" sx={{ ml: '8px', fontFamily: theme.typography.fontFamilyMono, fontWeight: 500, color: 'text.secondary' }}>
            {items.length}
          </Box>
        </Typography>
        <ExpandMore aria-hidden sx={{ fontSize: 20, color: 'text.secondary', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 120ms' }} />
      </ButtonBase>
      <Collapse in={open} id={listId} unmountOnExit>
        {error ? (
          <Typography role="status" sx={{ px: '12px', pb: '12px', fontSize: '0.8125rem', color: 'text.secondary' }}>
            Could not read TodoGeek just now.
          </Typography>
        ) : items.length === 0 ? (
          <Typography sx={{ px: '12px', pb: '12px', fontSize: '0.8125rem', color: 'text.secondary' }}>
            Nothing open.
          </Typography>
        ) : (
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, pb: '4px', maxHeight: strip ? 220 : 'none', overflowY: 'auto' }}>
            {items.map((item) => (
              <Box component="li" key={item.id} data-open-item={item.id} sx={{ display: 'flex', alignItems: 'center', gap: '4px', pl: '2px', pr: '12px', minHeight: 44 }}>
                <Checkbox
                  checked={false}
                  disabled={completing}
                  onChange={() => done(item.id)}
                  inputProps={{ 'aria-label': `Done — ${item.content}` }}
                  sx={{ width: 44, height: 44 }}
                />
                <Typography sx={{ flex: 1, minWidth: 0, fontSize: '0.875rem', color: 'text.primary', overflowWrap: 'anywhere' }}>
                  {item.content}
                  {failed === item.id ? (
                    <Box component="span" role="alert" sx={{ ml: '8px', color: 'error.main', fontSize: '0.8125rem' }}>Not saved. Try again.</Box>
                  ) : null}
                </Typography>
                {item.dueDate ? (
                  <Typography component="span" sx={{ flexShrink: 0, fontFamily: theme.typography.fontFamilyMono, fontSize: '0.75rem', color: 'text.secondary' }}>
                    {dueLabel(item.dueDate)}
                  </Typography>
                ) : null}
              </Box>
            ))}
          </Box>
        )}
      </Collapse>
    </Box>
  );
}

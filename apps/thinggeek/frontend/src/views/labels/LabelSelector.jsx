/**
 * `/labels` with no `?ids=` — pick what to label. Locations and containers
 * by default (what "the Where tree" shows); a toggle brings items in too.
 * Deliberately its own small picker rather than reusing the Where page or
 * its tree component, to stay out of the redesign work happening on those
 * files in parallel.
 */
import React, { useMemo, useState } from 'react';
import { Box, Button, Checkbox, CircularProgress, FormControlLabel, Switch, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@apollo/client';
import { GET_THING_TREE } from '../../graphql/queries';
import { buildTree, flattenTree, isParentKind, kindOf } from '../../utils/where';
import { labelsPath } from '../../utils/labelUrl';
import { DISPLAY_FONT } from '../../theme/theme';

export default function LabelSelector() {
  const navigate = useNavigate();
  const { data, loading, error } = useQuery(GET_THING_TREE);
  const [includeItems, setIncludeItems] = useState(false);
  const [selected, setSelected] = useState(() => new Set());

  const rows = useMemo(() => {
    const nodes = data?.thingTree ?? [];
    const include = includeItems ? () => true : (n) => isParentKind(kindOf(n));
    return flattenTree(buildTree(nodes, include));
  }, [data, includeItems]);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const preview = () => {
    if (!selected.size) return;
    navigate(labelsPath([...selected]));
  };

  if (loading) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
        <CircularProgress size={24} aria-label="Loading" />
      </Box>
    );
  }
  if (error) {
    return <Typography sx={{ color: 'error.main' }}>The household's things didn't load. Try again in a moment.</Typography>;
  }

  return (
    <Box>
      <Typography component="h1" sx={{ fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: '1.625rem', color: 'text.primary', mb: 0.5 }}>Print labels</Typography>
      <Typography sx={{ color: 'text.secondary', mb: 2 }}>
        Pick what to label. Each gets a label with a QR code that opens straight into ThingGeek — stick it on the bin, the shelf, the tote.
      </Typography>
      <FormControlLabel
        control={<Switch checked={includeItems} onChange={(e) => setIncludeItems(e.target.checked)} />}
        label="Also list items, not just locations and containers"
        sx={{ mb: 1.5, color: 'text.primary', minHeight: 44 }}
      />
      <Box
        component="ul"
        aria-label="Things to label"
        sx={{ listStyle: 'none', m: 0, p: 0, border: 1, borderColor: 'border', borderTop: '4px solid', borderTopColor: 'rule.main', borderRadius: '3px', overflow: 'hidden', bgcolor: 'background.paper' }}
      >
        {rows.map(({ node, depth }) => (
          <Box
            component="li"
            key={node.id}
            sx={{ display: 'flex', alignItems: 'center', borderBottom: 1, borderColor: 'divider', minHeight: 44, '&:last-of-type': { borderBottom: 0 } }}
          >
            <FormControlLabel
              sx={{ flex: 1, m: 0, pl: depth * 2, minHeight: 44 }}
              control={<Checkbox checked={selected.has(node.id)} onChange={() => toggle(node.id)} />}
              label={<Typography sx={{ color: 'text.primary' }}>{node.name}</Typography>}
            />
          </Box>
        ))}
        {!rows.length ? (
          <Box sx={{ p: 3, color: 'text.secondary' }}>Nothing here yet — add a location or a container first.</Box>
        ) : null}
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
        <Button variant="contained" disabled={!selected.size} onClick={preview} sx={{ minHeight: 44 }}>
          {selected.size ? `Preview (${selected.size})` : 'Preview'}
        </Button>
      </Box>
    </Box>
  );
}

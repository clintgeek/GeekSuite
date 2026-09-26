/**
 * Saved views in the sidebar. A row applies the view (it is a link to the
 * list with the view's filter and sort in the URL — `hrefFor(view)`);
 * the ⋯ beside it holds "Delete view" (`onDelete(view)` → Promise; a rejection
 * says so inline). The row lights up when the list is showing exactly that
 * view (the app works out which — `codec.canonicalSearch` — as `activeId`).
 *
 * Rendered as GeekSidebar `extras` (the sidebar's rows have no secondary
 * action slot), so it closes the phone drawer itself on navigate. The sidebar
 * sits outside the toast provider (the shell owns both), so a failed delete
 * says so inline, under the list.
 */
import React, { useState } from 'react';
import { Box, IconButton, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Menu, MenuItem, Typography } from '@mui/material';
import { DeleteOutline as DeleteIcon, MoreHoriz as MoreIcon, SavedSearchOutlined as ViewIcon } from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import { useGeekShell } from '@geeksuite/ui';

export default function SavedViews({ views = [], activeId = null, hrefFor, onDelete: deleteView, itemSx, title = 'Saved views' }) {
  const { closeNav } = useGeekShell();
  const [menu, setMenu] = useState(null); // { anchor, view }
  const [failed, setFailed] = useState('');

  if (!views.length) return null;

  const onDelete = async () => {
    const view = menu?.view;
    setMenu(null);
    if (!view) return;
    setFailed('');
    try {
      await deleteView(view);
    } catch {
      setFailed(`“${view.name}” was not deleted. Try again in a moment.`);
    }
  };

  return (
    <Box component="section" aria-labelledby="saved-views-label" sx={{ pt: 0.5 }}>
      <Typography
        id="saved-views-label"
        variant="caption"
        data-geek-sidebar="section-label"
        sx={{ display: 'block', px: 1.5, pb: 0.5, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}
      >
        {title}
      </Typography>
      <List disablePadding>
        {views.map((view) => {
          const active = view.id === activeId;
          return (
            <ListItem
              key={view.id}
              disablePadding
              secondaryAction={
                <IconButton
                  edge="end"
                  aria-label={`Options for ${view.name}`}
                  aria-haspopup="menu"
                  onClick={(e) => setMenu({ anchor: e.currentTarget, view })}
                  sx={{ width: 44, height: 44, mr: -0.5, color: 'text.secondary' }}
                >
                  <MoreIcon sx={{ fontSize: 18 }} />
                </IconButton>
              }
              sx={{ '& .MuiListItemSecondaryAction-root': { right: 4 } }}
            >
              <ListItemButton
                component={RouterLink}
                to={hrefFor(view)}
                selected={active}
                aria-current={active ? 'page' : undefined}
                onClick={closeNav}
                data-geek-nav-item={`view:${view.id}`}
                sx={{ minHeight: 44, borderRadius: '8px', px: 1.5, ...itemSx, pr: '44px !important' }}
              >
                <ListItemIcon sx={{ minWidth: 32, color: 'inherit' }}>
                  <ViewIcon />
                </ListItemIcon>
                <ListItemText primary={view.name} primaryTypographyProps={{ noWrap: true, variant: 'body2' }} />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
      {failed ? (
        <Typography role="alert" sx={{ px: 1.5, pt: 0.5, fontSize: '0.75rem', color: 'text.primary' }}>
          {failed}
        </Typography>
      ) : null}
      <Menu
        anchorEl={menu?.anchor}
        open={Boolean(menu)}
        onClose={() => setMenu(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem onClick={onDelete} sx={{ minHeight: 44, fontSize: '0.875rem' }}>
          <ListItemIcon>
            <DeleteIcon sx={{ fontSize: 18 }} />
          </ListItemIcon>
          Delete view
        </MenuItem>
      </Menu>
    </Box>
  );
}

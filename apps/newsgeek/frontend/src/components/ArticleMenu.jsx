/**
 * The ⋯ on a story: "Open at publisher" first, then the reader's own
 * "Open with…" links in their order (NewsPrefs.readerLinks). With none set,
 * "Add open-with links…" goes to Settings. The headline itself always opens
 * the publisher — reader links live only here.
 */
import React, { useState } from 'react';
import { Divider, IconButton, ListItemText, Menu, MenuItem } from '@mui/material';
import { MoreHoriz as MoreIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { GOTHIC } from '../theme/theme';
import { buildReaderUrl } from '../utils/readerLinks';

const openOut = (url) => window.open(url, '_blank', 'noopener,noreferrer');

export default function ArticleMenu({ article, readerLinks = [] }) {
  const [anchor, setAnchor] = useState(null);
  const navigate = useNavigate();
  const close = () => setAnchor(null);
  const itemSx = { minHeight: 44, '& .MuiListItemText-primary': { fontFamily: GOTHIC, fontSize: '0.9375rem' } };
  return (
    <>
      <IconButton
        aria-label={`More ways to open “${article.title}”`}
        aria-haspopup="menu"
        aria-expanded={anchor ? 'true' : undefined}
        onClick={(e) => setAnchor(e.currentTarget)}
        data-testid="article-menu-button"
        sx={{ width: 44, height: 44, color: 'text.secondary', flexShrink: 0 }}
      >
        <MoreIcon />
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={close} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <MenuItem
          sx={itemSx}
          onClick={() => {
            close();
            openOut(article.url);
          }}
        >
          <ListItemText primary="Open at publisher" />
        </MenuItem>
        {readerLinks.length ? <Divider /> : null}
        {readerLinks.map((link, i) => {
          const url = buildReaderUrl(link.template, { url: article.url, title: article.title });
          return (
            <MenuItem
              key={`${i}-${link.label}`}
              sx={itemSx}
              disabled={!url}
              onClick={() => {
                close();
                if (url) openOut(url);
              }}
            >
              <ListItemText primary={link.label} />
            </MenuItem>
          );
        })}
        {readerLinks.length ? null : (
          <MenuItem
            sx={itemSx}
            onClick={() => {
              close();
              navigate('/settings');
            }}
          >
            <ListItemText primary="Add open-with links…" />
          </MenuItem>
        )}
      </Menu>
    </>
  );
}

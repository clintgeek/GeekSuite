/**
 * The ⋯ on a story: "Open at publisher" first — ALWAYS the original URL,
 * even when the reader chose another opener for this publisher (plan
 * "Opening", 2026-10-11) — then the reader's own "Open with…" links in their
 * order (NewsPrefs.readerLinks). With none set, "Add open-with links…" goes
 * to Settings. Each item opens in a new tab or in this window, as the
 * reader's `openInNewTab` says.
 *
 * Last, after a rule: "Source settings" opens the Source sheet for the story's
 * source or publisher (subscribe, hide, in my paper…), when the page passes
 * onOpenSource.
 */
import React, { useState } from 'react';
import { Divider, IconButton, ListItemText, Menu, MenuItem } from '@mui/material';
import { MoreHoriz as MoreIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { GOTHIC } from '../theme/theme';
import { openOutbound } from '../utils/openUrl';
import { buildReaderUrl } from '../utils/readerLinks';

export default function ArticleMenu({ article, readerLinks = [], openInNewTab = true, onOpenSource }) {
  const openOut = (url) => openOutbound(url, openInNewTab);
  const [anchor, setAnchor] = useState(null);
  const navigate = useNavigate();
  const close = () => setAnchor(null);
  const itemSx = { minHeight: 44, '& .MuiListItemText-primary': { fontFamily: GOTHIC, fontSize: '0.9375rem' } };
  return (
    <>
      <IconButton
        aria-label={`More for “${article.title}”`}
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
              key={`${i}-${link.id ?? link.label}`}
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
        {onOpenSource ? <Divider /> : null}
        {onOpenSource ? (
          <MenuItem
            sx={itemSx}
            aria-haspopup="dialog"
            onClick={() => {
              close();
              onOpenSource(article);
            }}
          >
            <ListItemText primary="Source settings" />
          </MenuItem>
        ) : null}
      </Menu>
    </>
  );
}

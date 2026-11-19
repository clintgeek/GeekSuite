/**
 * The ⋯ on a story: "Open at publisher" first — ALWAYS the original URL,
 * even when the reader chose another opener for this publisher (plan
 * "Opening", 2026-10-11) — then the reader's own "Open with…" links in their
 * order (NewsPrefs.readerLinks). With none set, "Add open-with links…" goes
 * to Settings. Each item opens in a new tab or in this window, as the
 * reader's `openInNewTab` says.
 *
 * Second, "Share…" (UX review 2026-11-18, finding 6): the phone's share sheet
 * (Web Share API) with the ORIGINAL publisher URL — never an open-with URL.
 * Where there is no share sheet (most desktops) it reads "Copy link" and says
 * "Link copied." in a toast. Dismissing the share sheet is not an error.
 *
 * Last, after a rule: "Source settings" opens the Source sheet for the story's
 * source or publisher (subscribe, hide, in my paper…), when the page passes
 * onOpenSource.
 */
import React, { useState } from 'react';
import { Divider, IconButton, ListItemText, Menu, MenuItem } from '@mui/material';
import { MoreHoriz as MoreIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@geeksuite/ui';
import { GOTHIC } from '../theme/theme';
import { openOutbound } from '../utils/openUrl';
import { buildReaderUrl } from '../utils/readerLinks';

export const canShare = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function';

/** Share the story's original link, or copy it. Resolves to what happened: 'shared' | 'copied' | 'cancelled' | 'failed'. */
export async function shareStory(article) {
  if (canShare()) {
    try {
      await navigator.share({ title: article.title, url: article.url });
      return 'shared';
    } catch (err) {
      return err?.name === 'AbortError' ? 'cancelled' : 'failed';
    }
  }
  try {
    await navigator.clipboard.writeText(article.url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

export default function ArticleMenu({ article, readerLinks = [], openInNewTab = true, onOpenSource }) {
  const openOut = (url) => openOutbound(url, openInNewTab);
  const [anchor, setAnchor] = useState(null);
  const navigate = useNavigate();
  const { notify } = useToast();
  const close = () => setAnchor(null);
  const share = async () => {
    close();
    const done = await shareStory(article);
    if (done === 'copied') notify('Link copied.', { tone: 'success' });
    else if (done === 'failed') notify(canShare() ? 'Couldn’t share this story. Try again.' : 'Couldn’t copy the link.', { tone: 'error' });
  };
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
        <MenuItem sx={itemSx} onClick={share}>
          <ListItemText primary={canShare() ? 'Share…' : 'Copy link'} />
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

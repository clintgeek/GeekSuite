import React, { useCallback, useMemo, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import AmbientCard from './AmbientCard';
import MessageDialog from './dialogs/MessageDialog';
import useInterval from '../../hooks/useInterval';

const DOMAIN = 'notegeek';
const POLL_MS = 120 * 1000; // 120 s
const MAX_ROWS = 4;

/**
 * Group a list of messages by sender — preserves order, so
 * consecutive messages from the same sender collapse into
 * one row with an "(n)" count.
 */
function groupBySender(messages) {
  const groups = [];
  for (const msg of messages) {
    const last = groups[groups.length - 1];
    const key = msg.from_email || msg.from_name;
    const lastKey = last && (last[0].from_email || last[0].from_name);
    if (last && lastKey === key) {
      last.push(msg);
    } else {
      groups.push([msg]);
    }
  }
  return groups;
}

export default function Gmail() {
  const theme = useTheme();
  const domainColor = theme.palette.domains?.[DOMAIN];
  const [messages, setMessages] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expired, setExpired] = useState(null);
  const [openId, setOpenId] = useState(null);

  const fetchMail = useCallback(async () => {
    try {
      const res = await fetch('/api/ambient/gmail/messages', { credentials: 'include' });
      if (res.status === 409) {
        const body = await res.json().catch(() => ({}));
        setExpired(body.provider ?? 'google');
        setLoading(false);
        return;
      }
      if (!res.ok) { setLoading(false); return; }
      const json = await res.json();
      setMessages(json.messages ?? []);
      setExpired(null);
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, []);

  useInterval(fetchMail, POLL_MS);

  const groups = useMemo(
    () => groupBySender(messages ?? []).slice(0, MAX_ROWS),
    [messages],
  );

  const isEmpty = !loading && !expired && messages && messages.length === 0;
  const hasMessages = messages && messages.length > 0;

  // First-message click opens the dialog for whole-card taps.
  const firstMessageId = hasMessages ? messages[0].id : null;

  return (
    <>
      <AmbientCard
        domain={DOMAIN}
        title="INBOX"
        loading={loading && !messages}
        empty={isEmpty || (!loading && !expired && !messages)}
        emptyLabel="Inbox clear"
        expiredProvider={expired}
        onClick={hasMessages ? () => setOpenId(firstMessageId) : undefined}
      >
        {hasMessages && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, minWidth: 0 }}>
            {groups.map((group) => {
              const msg = group[0];
              const count = group.length;
              const anyUnread = group.some(m => m.unread);

              return (
                <Box
                  key={msg.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenId(msg.id);
                  }}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    minWidth: 0,
                    cursor: 'pointer',
                  }}
                >
                  {/* Pip — oxblood (notegeek domain) */}
                  <Box
                    aria-hidden="true"
                    sx={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      flexShrink: 0,
                      backgroundColor: anyUnread
                        ? domainColor ?? theme.palette.error.main
                        : 'transparent',
                      border: anyUnread
                        ? 'none'
                        : `1px solid ${theme.palette.divider}`,
                    }}
                  />
                  <Typography
                    variant="body2"
                    sx={{
                      color: anyUnread ? 'text.primary' : 'text.secondary',
                      fontWeight: anyUnread ? 500 : 400,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      maxWidth: '40%',
                    }}
                  >
                    {msg.from_name || msg.from_email}
                    {count > 1 && (
                      <Box component="span" sx={{ color: 'text.disabled', ml: 0.5, fontWeight: 400 }}>
                        ({count})
                      </Box>
                    )}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      color: 'text.disabled',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    {msg.subject}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        )}
      </AmbientCard>

      <MessageDialog
        open={openId != null}
        onClose={() => setOpenId(null)}
        messageId={openId}
      />
    </>
  );
}

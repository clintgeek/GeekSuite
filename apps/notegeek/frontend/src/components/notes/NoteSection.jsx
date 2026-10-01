import React, { useId } from 'react';
import { Link } from 'react-router-dom';
import { Box, ButtonBase, Typography, useTheme } from '@mui/material';
import { border, graphiteTokens } from '../../theme/tokens';
import TypeIcon from './TypeIcon';

/**
 * NoteSection — a quiet list of other notes at the foot of a note: "Related
 * notes" (by meaning) and "Linked from" (backlinks). Graphite: a hairline
 * rule, a small sentence-case heading, then plain rows — title, one line of
 * context, the type glyph. Rows are links with a 44px floor, so a thumb on
 * a phone hits them one-handed.
 *
 * Props:
 *  - title:      the heading ("Related notes")
 *  - hint:       a few words after the heading, quieter still ("similar in meaning")
 *  - icon:       optional glyph before the heading, so the two sections read
 *                differently at a glance
 *  - items:      [{ id, title, type, snippet }]
 *  - renderSnippet: optional (item) => node, for a snippet with marks in it
 *  - dataAttr:   a data-* name for tests and the harness
 */
function NoteSection({ title, hint, icon = null, items, renderSnippet, dataAttr }) {
    const theme = useTheme();
    const g = graphiteTokens(theme);
    const headingId = useId();
    if (!items?.length) return null;

    return (
        <Box
            component="section"
            aria-labelledby={headingId}
            {...(dataAttr ? { [`data-${dataAttr}`]: '' } : {})}
            sx={{
                mt: '32px',
                pt: '12px',
                borderTop: `1px solid ${border(theme)}`,
                '@media print': { display: 'none' },
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '8px', px: '8px', mb: '4px' }}>
                {icon}
                <Typography
                    id={headingId}
                    component="h2"
                    sx={{ fontSize: '0.8125rem', fontWeight: 600, color: 'text.secondary', lineHeight: 1.4 }}
                >
                    {title}
                </Typography>
                {hint ? (
                    <Typography component="span" sx={{ fontSize: '0.75rem', color: 'text.secondary', lineHeight: 1.4 }}>
                        {hint}
                    </Typography>
                ) : null}
            </Box>
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                {items.map((item) => (
                    <Box component="li" key={item.id}>
                        <ButtonBase
                            component={Link}
                            to={`/notes/${item.id}`}
                            sx={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '10px',
                                width: '100%',
                                minHeight: 44,
                                textAlign: 'left',
                                py: '8px',
                                px: '8px',
                                borderRadius: '4px',
                                color: 'inherit',
                                textDecoration: 'none',
                                '&:hover': { bgcolor: g.paper },
                                '&:focus-visible': { outline: `2px solid ${g.ink}`, outlineOffset: -2 },
                            }}
                        >
                            <TypeIcon type={item.type} size={15} sx={{ mt: '3px' }} />
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography
                                    component="div"
                                    sx={{
                                        fontSize: '0.875rem',
                                        fontWeight: 500,
                                        color: 'text.primary',
                                        lineHeight: 1.4,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {item.title || 'Untitled'}
                                </Typography>
                                {item.snippet ? (
                                    <Typography
                                        component="div"
                                        sx={{
                                            fontSize: '0.8125rem',
                                            color: 'text.secondary',
                                            lineHeight: 1.45,
                                            overflow: 'hidden',
                                            display: '-webkit-box',
                                            WebkitLineClamp: 2,
                                            WebkitBoxOrient: 'vertical',
                                            wordBreak: 'break-word',
                                        }}
                                    >
                                        {renderSnippet ? renderSnippet(item) : item.snippet}
                                    </Typography>
                                ) : null}
                            </Box>
                        </ButtonBase>
                    </Box>
                ))}
            </Box>
        </Box>
    );
}

export default NoteSection;

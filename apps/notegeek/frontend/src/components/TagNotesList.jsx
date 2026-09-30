import React, { useMemo } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import {
    Typography,
    Breadcrumbs,
    Link,
    Box,
    ButtonBase,
    useTheme,
    alpha,
} from '@mui/material';
import { gql, useQuery } from '@apollo/client';
import { GeekErrorState } from '@geeksuite/ui';
import NoteList from './NoteList';
import { graphiteTokens, layout, tapTarget44 } from '../theme/tokens';
import { buildTagTree } from '../utils/tagTree';
import { tagHref } from '../utils/tagPath';

// The same documents the sidebar's tag tree reads (Sidebar.jsx), so the
// sub-tag counts here come out of the same cache entry and always agree with
// the tree's.
const GET_TAGS = gql`
  query GetNoteTags {
    noteTags
  }
`;
const GET_TAG_COUNTS = gql`
  query GetNoteTagCounts {
    notes {
      id
      tags
    }
  }
`;

function findNode(nodes, path) {
    for (const node of nodes) {
        if (node.path === path) return node;
        if (path.startsWith(`${node.path}/`)) return findNode(node.children, path);
    }
    return null;
}

/**
 * The direct sub-tags of the tag being viewed, as a row of quiet links —
 * Bear's "notebook inside a notebook": the parent lists everything beneath
 * it, and one tap goes down a level. The count on each is the tree's count
 * (distinct notes under that sub-tag), so it matches the sidebar.
 */
function SubTagRow({ node }) {
    const theme = useTheme();
    const g = graphiteTokens(theme);
    if (!node || node.children.length === 0) return null;
    return (
        <Box
            component="nav"
            aria-label={`Sub-tags of ${node.path}`}
            sx={{
                display: 'flex',
                flexWrap: 'nowrap',
                gap: '4px',
                overflowX: 'auto',
                scrollbarWidth: 'none',
                '&::-webkit-scrollbar': { display: 'none' },
                maxWidth: layout.contentWidth,
                mx: 'auto',
                px: '2px',
                mb: '4px',
            }}
        >
            {node.children.map((child) => (
                <ButtonBase
                    key={child.path}
                    component={RouterLink}
                    to={tagHref(child.path)}
                    data-subtag={child.path}
                    sx={{
                        flexShrink: 0,
                        borderRadius: '999px',
                        [theme.breakpoints.down('md')]: { ...tapTarget44 },
                        '&:focus-visible': { outline: `2px solid ${g.ink}`, outlineOffset: 2 },
                        '&:hover .ng-subtag': { bgcolor: alpha(g.ink, 0.05), color: 'text.primary' },
                    }}
                >
                    <Box
                        component="span"
                        className="ng-subtag"
                        sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            height: 30,
                            px: '12px',
                            borderRadius: '999px',
                            border: `1px solid ${theme.palette.divider}`,
                            color: 'text.secondary',
                            fontSize: '0.8125rem',
                            fontWeight: 500,
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {child.name}
                        {child.count !== null && (
                            <Box
                                component="span"
                                sx={{
                                    fontFamily: theme.typography.fontFamilyMono,
                                    fontSize: '0.75rem',
                                    fontVariantNumeric: 'tabular-nums',
                                }}
                            >
                                {child.count}
                            </Box>
                        )}
                    </Box>
                </ButtonBase>
            ))}
        </Box>
    );
}

/**
 * A tag's page. Nested tags: `house` lists `house` AND everything beneath it
 * (`notes(under:)`), each row naming the sub-tag it sits in; the breadcrumb
 * walks back up; the sub-tag row walks down.
 */
const TagNotesList = () => {
    const { tag } = useParams();
    const theme = useTheme();
    const decodedTag = tag ? decodeURIComponent(tag) : '';

    const { data: tagData } = useQuery(GET_TAGS, { fetchPolicy: 'cache-first', skip: !tag });
    const { data: countData } = useQuery(GET_TAG_COUNTS, { fetchPolicy: 'cache-first', skip: !tag });
    const node = useMemo(() => {
        if (!decodedTag || !tagData?.noteTags) return null;
        return findNode(buildTagTree(tagData.noteTags, countData?.notes || null), decodedTag);
    }, [decodedTag, tagData, countData]);

    if (!tag) {
        return (
            <Box sx={{ p: 2 }}>
                <GeekErrorState
                    compact
                    title="Invalid tag link"
                    description="No tag parameter found in URL"
                />
            </Box>
        );
    }

    const parts = decodedTag.split('/');
    const crumbs = [
        { title: 'All notes', href: '/notes' },
        ...parts.map((part, index) => ({
            title: part,
            href: tagHref(parts.slice(0, index + 1).join('/')),
        })),
    ];

    // 44px targets on a phone (MOBILE_UI_PLAN §2): a breadcrumb is how you
    // go back UP a level there, so it has to be a real target, not 20px of text.
    const crumbLinkSx = {
        display: 'inline-flex',
        alignItems: 'center',
        [theme.breakpoints.down('md')]: { minHeight: 44, minWidth: 44 },
    };

    return (
        <Box sx={{ p: 2, [theme.breakpoints.down('md')]: { px: 1, pt: 1 } }}>
            {/* On the list's own column, so the path sits over the notes it names. */}
            <Breadcrumbs
                aria-label="Tag path"
                sx={{
                    mb: '4px',
                    maxWidth: layout.contentWidth,
                    mx: 'auto',
                    px: '4px',
                    '& .MuiBreadcrumbs-ol': { flexWrap: 'wrap', rowGap: 0 },
                    '& .MuiBreadcrumbs-separator': { mx: '4px' },
                }}
            >
                {crumbs.map((item, index) => (
                    index === crumbs.length - 1 ? (
                        <Typography
                            key={item.href}
                            component="h1"
                            variant="h6"
                            aria-current="page"
                            sx={{ ...crumbLinkSx, color: 'text.primary', m: 0, wordBreak: 'break-word' }}
                        >
                            {item.title}
                        </Typography>
                    ) : (
                        <Link
                            key={item.href}
                            component={RouterLink}
                            to={item.href}
                            underline="hover"
                            color="text.secondary"
                            variant="h6"
                            sx={crumbLinkSx}
                        >
                            {item.title}
                        </Link>
                    )
                ))}
            </Breadcrumbs>

            <SubTagRow node={node} />

            <NoteList under={decodedTag} />
        </Box>
    );
};

export default TagNotesList;

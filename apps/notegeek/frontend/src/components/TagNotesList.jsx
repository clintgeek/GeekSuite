import React from 'react';
import { useParams } from 'react-router-dom';
import {
    Typography,
    Breadcrumbs,
    Link,
    Box,
} from '@mui/material';
import { GeekErrorState } from '@geeksuite/ui';
import { Link as RouterLink } from 'react-router-dom';
import NoteList from './NoteList';
import { layout } from '../theme/tokens';

const TagNotesList = () => {
    const { tag } = useParams();

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

    const decodedTag = decodeURIComponent(tag);
    const parts = decodedTag.split('/');

    const items = [
        { title: 'Home', href: '/' },
        ...parts.map((part, index) => {
            const path = parts.slice(0, index + 1).join('/');
            return {
                title: part,
                href: `/tags/${encodeURIComponent(path)}`
            };
        })
    ];

    return (
        <Box sx={{ p: 2 }}>
            {/* On the list's own column, so the path sits over the notes it names. */}
            <Breadcrumbs sx={{ mb: 1, maxWidth: layout.contentWidth, mx: 'auto', px: '4px' }}>
                {items.map((item, index) => (
                    index === items.length - 1 ? (
                        <Typography key={index} color="text.primary" variant="h6">
                            {item.title}
                        </Typography>
                    ) : (
                        <Link
                            key={index}
                            component={RouterLink}
                            to={item.href}
                            underline="hover"
                            color="inherit"
                            variant="h6"
                        >
                            {item.title}
                        </Link>
                    )
                ))}
            </Breadcrumbs>

            <NoteList tag={decodedTag} />
        </Box>
    );
};

export default TagNotesList;

import React from 'react';
import { useParams } from 'react-router-dom';
import {
    Typography,
    Breadcrumbs,
    Link,
    Box,
    Alert
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import NoteList from './NoteList';

const TagNotesList = () => {
    const { tag } = useParams();

    if (!tag) {
        return (
            <Box sx={{ p: 2 }}>
                <Alert severity="error">No tag parameter found in URL</Alert>
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
            <Breadcrumbs sx={{ mb: 2 }}>
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

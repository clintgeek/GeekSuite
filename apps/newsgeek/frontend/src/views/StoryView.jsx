/**
 * One story (`/story/:id`, 2026-11-27; plan "Screens": Story): the headline
 * Today would show, how many outlets told it and since when, then every
 * telling the reader can see, newest first — publisher, their headline,
 * their excerpt, a link out. Copies of one headline are folded into "Also
 * in". We still never reproduce an article: each telling opens at its
 * publisher (or the reader's opener for it), as everywhere else.
 *
 * Reached from "All coverage →" at the end of a story's Also-in list. A story
 * that has aged out of the paper, or that none of the reader's sources told,
 * says so and offers the way back.
 */
import React, { useState } from 'react';
import { Box, CircularProgress, Link, Typography } from '@mui/material';
import { useQuery } from '@apollo/client';
import { GeekLoadError, geekLoadStatus } from '@geeksuite/ui';
import { Link as RouterLink, useParams } from 'react-router-dom';
import ArticleItem from '../components/ArticleItem';
import Column from '../components/Column';
import Masthead from '../components/Masthead';
import SourceSheet from '../components/SourceSheet';
import TimeAgo from '../components/TimeAgo';
import { GET_NEWS_PREFS, GET_NEWS_STORY } from '../graphql/queries';
import { GOTHIC, SERIF, flagSx } from '../theme/theme';
import { openingPrefs } from '../utils/openUrl';
import { SECTION_LABEL } from '../utils/vocab';

export const GONE_LINE = 'This story has left the paper.';
export const GONE_HELP = 'Stories are kept for 90 days, and only as your sources told them.';
export const BACK_LINK = '← Today’s paper';

/** "12 sources" / "1 source". */
export const sourcesLine = (n) => `${n} ${n === 1 ? 'source' : 'sources'}`;

const backSx = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 44,
  fontFamily: GOTHIC,
  fontSize: '0.875rem',
  fontWeight: 700,
  color: 'text.primary',
  textDecorationColor: 'currentColor',
  textUnderlineOffset: '0.25em',
  '&:focus-visible': { outline: '2px solid', outlineOffset: 2 },
};

export default function StoryView() {
  const { id } = useParams();
  const [sheetArticle, setSheetArticle] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const prefsQ = useQuery(GET_NEWS_PREFS, { fetchPolicy: 'cache-first' });
  const opening = openingPrefs(prefsQ.data?.newsPrefs);
  const { data, error, loading, refetch } = useQuery(GET_NEWS_STORY, { variables: { id }, fetchPolicy: 'cache-and-network' });

  const story = data?.newsStory ?? null;
  const status = geekLoadStatus({ loading, error, data, isEmpty: (d) => !d });
  const gone = Boolean(data) && !story;

  return (
    <Column>
      <Masthead compact title="Story" />
      <Box sx={{ pt: 1 }}>
        <Link component={RouterLink} to="/" sx={backSx}>
          {BACK_LINK}
        </Link>
      </Box>

      {status === 'loading' ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 12 }}>
          <CircularProgress size={24} aria-label="Loading the story" sx={{ color: 'text.secondary' }} />
        </Box>
      ) : null}

      {status === 'error' ? (
        <GeekLoadError
          data-testid="story-error"
          title="The story didn’t arrive."
          description="We couldn’t reach the news desk. Your connection or the gateway may be down."
          error={error}
          showDetail={false}
          retryLabel="Try again"
          onRetry={() => refetch().catch(() => {})}
          sx={{ py: 10 }}
        />
      ) : null}

      {gone ? (
        <Box data-testid="story-gone" sx={{ py: 12, textAlign: 'center' }}>
          <Typography sx={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: '1.125rem' }}>{GONE_LINE}</Typography>
          <Typography sx={{ mt: 1, color: 'text.secondary', maxWidth: 420, mx: 'auto' }}>{GONE_HELP}</Typography>
        </Box>
      ) : null}

      {story ? (
        <Box component="section" aria-labelledby="story-title" data-testid="story">
          <Box sx={{ borderTop: 3, borderColor: 'text.primary', mt: 2, pt: 1.5 }}>
            <Typography component="p" data-testid="story-meta" sx={{ ...flagSx, fontSize: '0.875rem', letterSpacing: '0.12em', color: 'text.primary' }}>
              {[sourcesLine(story.sourceCount), SECTION_LABEL[story.section] || story.section].filter(Boolean).join(' · ')}
            </Typography>
          </Box>
          <Typography
            id="story-title"
            component="h2"
            sx={{ mt: 2, fontFamily: SERIF, fontSize: { xs: '1.75rem', sm: '2.125rem' }, lineHeight: 1.12, color: 'text.primary' }}
          >
            {story.title}
          </Typography>
          <Typography component="p" sx={{ mt: 1.5, mb: 2, fontFamily: GOTHIC, fontSize: '0.8125rem', color: 'text.secondary' }}>
            First told <TimeAgo value={story.firstAt} />
            {story.lastAt !== story.firstAt ? (
              <>
                {' · latest '}
                <TimeAgo value={story.lastAt} />
              </>
            ) : null}
          </Typography>
          <Box sx={{ borderTop: 1, borderColor: 'divider' }}>
            {story.articles.map((a) => (
              <ArticleItem
                key={a.id}
                article={a}
                headingLevel="h3"
                storyLink={false}
                {...opening}
                onOpenSource={(article) => {
                  setSheetArticle(article);
                  setSheetOpen(true);
                }}
              />
            ))}
          </Box>
        </Box>
      ) : null}

      <SourceSheet article={sheetArticle} open={sheetOpen} onClose={() => setSheetOpen(false)} onChanged={() => refetch().catch(() => {})} />
    </Column>
  );
}

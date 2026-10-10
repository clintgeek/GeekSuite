/**
 * Article — one feed item (title, the feed's own excerpt, link, metadata). Written by the ingest worker only; the gateway reads it.
 * Collection `articles` in the `newsgeek` database (DOCS/NEWSGEEK_PLAN.md "Data model").
 */
import mongoose from 'mongoose';
import articleModule from '@geeksuite/schemas/newsgeek/article';
import constants from '@geeksuite/schemas/newsgeek/constants';

const { createArticleSchema } = articleModule;
const { COLLECTIONS } = constants;

export default mongoose.models.NewsArticle || mongoose.model('NewsArticle', createArticleSchema(mongoose), COLLECTIONS.articles);

import mongoose from 'mongoose';
import { getAppConnection } from '../../shared/appConnections.js';
import articleModule from '@geeksuite/schemas/newsgeek/article';
import constantsModule from '@geeksuite/schemas/newsgeek/constants';

const { createArticleSchema } = articleModule;
const conn = getAppConnection('newsgeek');

export const NewsArticle = conn.models.NewsArticle
  || conn.model('NewsArticle', createArticleSchema(mongoose), constantsModule.COLLECTIONS.articles);

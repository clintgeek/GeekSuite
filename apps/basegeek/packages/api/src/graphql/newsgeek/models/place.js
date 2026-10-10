import mongoose from 'mongoose';
import { getAppConnection } from '../../shared/appConnections.js';
import placeModule from '@geeksuite/schemas/newsgeek/place';
import constantsModule from '@geeksuite/schemas/newsgeek/constants';

const { createPlaceSchema } = placeModule;
const conn = getAppConnection('newsgeek');

export const NewsPlace = conn.models.NewsPlace
  || conn.model('NewsPlace', createPlaceSchema(mongoose), constantsModule.COLLECTIONS.places);

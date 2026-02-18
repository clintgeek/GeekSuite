import User from '../models/User.js';
import { attachUser } from '@geeksuite/user/server';

const protect = attachUser({ model: User });

export { protect };
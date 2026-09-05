import { attachUser, optionalUser } from '@geeksuite/user/server';

const authenticateToken = attachUser();
const optionalAuth = optionalUser();

export { authenticateToken, optionalAuth };
export default { authenticateToken, optionalAuth };
import { attachUser, optionalUser } from "@geeksuite/user/server";

export const authenticateToken = attachUser();
export const optionalAuth = optionalUser();

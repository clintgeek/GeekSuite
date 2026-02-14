export interface BaseGeekUser {
  id: string;
  username?: string;
  email?: string;
  app: string;
  profile?: Record<string, any>;
}

export interface BaseGeekAuthResponse {
  token: string;
  refreshToken: string;
  user: BaseGeekUser;
}

export interface BaseGeekProfileResponse {
  user: BaseGeekUser & {
    profile: Record<string, any>;
    lastLogin: string;
    createdAt: string;
    updatedAt: string;
  };
}

export interface BaseGeekRefreshResponse {
  token: string;
  newRefreshToken: string;
  user: BaseGeekUser;
}

export interface BaseGeekErrorResponse {
  message: string;
  code?: string;
  valid?: boolean;
}
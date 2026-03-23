import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

const ACCESS_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || "15m";
const REFRESH_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || "7d";

export const issueTokenPair = (payload) => {
  const token = jwt.sign(payload, env.jwtSecret, { expiresIn: ACCESS_EXPIRY });
  const refreshToken = jwt.sign(payload, env.jwtRefreshSecret || env.jwtSecret, {
    expiresIn: REFRESH_EXPIRY
  });

  return { token, refreshToken };
};

export const refreshAccessToken = (refreshToken) => {
  try {
    const decoded = jwt.verify(refreshToken, env.jwtRefreshSecret || env.jwtSecret);

    // Only include safe claims in new tokens
    const payload = {
      ...decoded
    };

    return issueTokenPair(payload);
  } catch (err) {
    throw new Error("Invalid refresh token");
  }
};

export const verifyRefreshToken = (refreshToken) => {
  try {
    const decoded = jwt.verify(refreshToken, env.jwtRefreshSecret || env.jwtSecret);
    return decoded;
  } catch (err) {
    throw new Error("Invalid refresh token");
  }
};

export const verifyToken = (token) => jwt.verify(token, env.jwtSecret);

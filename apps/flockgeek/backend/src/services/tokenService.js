import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export const issueToken = (payload, options = {}) =>
  jwt.sign(payload, env.jwtSecret, { expiresIn: "1h", ...options });

export const verifyToken = (token) => jwt.verify(token, env.jwtSecret);

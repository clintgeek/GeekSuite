import axios from "axios";
import { env } from "../config/env.js";

const SSO_ACCESS_COOKIE = "geek_token";

function getTokenFromRequest(req) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.replace("Bearer ", "");
  }

  const cookieToken = req.cookies?.[SSO_ACCESS_COOKIE];
  if (cookieToken) return cookieToken;

  return null;
}

async function fetchUserFromBaseGeek(token) {
  const response = await axios.get(`${env.baseGeekUrl}/api/users/me`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  const user = response.data?.user || response.data?.data?.user || response.data;
  if (!user) return null;

  // Normalize for existing controllers: they expect req.user.userId
  const id = user.id || user._id || user.userId;
  if (id && !user.userId) {
    user.userId = id;
  }

  return user;
}

export const requireAuth = (req, res, next) => {
  const token = getTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ message: "Authentication token required" });
  }

  fetchUserFromBaseGeek(token)
    .then((user) => {
      if (!user) {
        return res.status(401).json({ message: "Invalid or expired token" });
      }

      req.user = user;
      return next();
    })
    .catch((error) => {
      const status = error.response?.status;
      if (status === 401 || status === 403) {
        return res.status(401).json({ message: "Invalid or expired token" });
      }
      return res.status(502).json({ message: "Authentication service unavailable" });
    });
};

import axios from "axios";
import { env } from "../config/env.js";
import { sendError, sendSuccess } from "../utils/responses.js";

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

async function proxyBaseGeek(req, res, { method, path }) {
  const token = getTokenFromRequest(req);
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(req.headers.cookie ? { Cookie: req.headers.cookie } : {})
  };

  const response = await axios({
    method,
    url: `${env.baseGeekUrl}${path}`,
    data: req.body,
    headers,
    validateStatus: () => true
  });

  const setCookie = response.headers?.["set-cookie"];
  if (setCookie) {
    res.setHeader("set-cookie", setCookie);
  }

  return res.status(response.status).json(response.data);
}

export const register = async (req, res) => proxyBaseGeek(req, res, { method: "post", path: "/api/auth/register" });

export const login = async (req, res) => proxyBaseGeek(req, res, { method: "post", path: "/api/auth/login" });

export const refresh = async (req, res) => proxyBaseGeek(req, res, { method: "post", path: "/api/auth/refresh" });

export const logout = async (req, res) => proxyBaseGeek(req, res, { method: "post", path: "/api/auth/logout" });

export const me = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (req.user) {
    return sendSuccess(res, { user: req.user });
  }

  const token = getTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ message: "Authentication token required" });
  }

  try {
    const response = await axios.get(`${env.baseGeekUrl}/api/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
      validateStatus: () => true
    });

    if (response.status === 401 || response.status === 403) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }
    if (response.status < 200 || response.status >= 300) {
      return sendError(res, { message: "Authentication service unavailable" }, 502);
    }

    const user = response.data?.user || response.data?.data?.user || response.data;
    return sendSuccess(res, { user });
  } catch (error) {
    return sendError(res, { message: "Authentication service unavailable" }, 502);
  }
};

export const validateSSO = async (req, res) => proxyBaseGeek(req, res, { method: "post", path: "/api/auth/validate-sso" });

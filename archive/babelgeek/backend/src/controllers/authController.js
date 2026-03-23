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

async function proxyBaseGeek(req, res, { method, path }) {
  const token = getTokenFromRequest(req);
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${ token }` } : {}),
    ...(req.headers.cookie ? { Cookie: req.headers.cookie } : {})
  };

  const response = await axios({
    method,
    url: `${ env.baseGeekUrl }${ path }`,
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

export const refresh = async (req, res) => {
  // BaseGeek handles token from cookie or body
  // if (!req.body?.refreshToken) return 400;
  return proxyBaseGeek(req, res, { method: "post", path: "/api/auth/refresh" });
};

export const logout = async (req, res) => proxyBaseGeek(req, res, { method: "post", path: "/api/auth/logout" });

export const validateSSO = async (req, res) => proxyBaseGeek(req, res, { method: "post", path: "/api/auth/validate-sso" });

import { env } from "../config/env.js";

export const healthcheck = (req, res) => {
  return res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
  service: "FlockGeek API",
    environment: env.nodeEnv
  });
};

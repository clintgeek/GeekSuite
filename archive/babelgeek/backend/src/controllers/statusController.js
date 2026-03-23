import { env } from "../config/env.js";
import { sendSuccess } from "../utils/responses.js";

export const healthcheck = (req, res) => {
  return sendSuccess(res, {
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "BabelGeek API",
    environment: env.nodeEnv
  });
};

import axios from "axios";

function getApiBase() {
  if (import.meta.env.DEV) return "/api";
  return import.meta.env.VITE_API_BASE || "/api";
}

const client = axios.create({
  baseURL: getApiBase(),
  withCredentials: true
});

export default client;

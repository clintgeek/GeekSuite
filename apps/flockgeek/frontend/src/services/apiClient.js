import axios from "axios";
import { setupAxiosInterceptors } from "@geeksuite/auth";

function getApiBase() {
  return "/api";
}

const client = axios.create({
  baseURL: getApiBase(),
  withCredentials: true
});

setupAxiosInterceptors(client);

export default client;

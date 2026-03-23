import axios from "axios";
import { setupAxiosInterceptors } from "@geeksuite/auth";

const client = axios.create({
  baseURL: "/api",
  withCredentials: true
});

setupAxiosInterceptors(client);

export default client;

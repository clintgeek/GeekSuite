import axios from "axios";

function getApiBase() {
  return "/api";
}

const client = axios.create({
  baseURL: getApiBase(),
  withCredentials: true
});

export default client;

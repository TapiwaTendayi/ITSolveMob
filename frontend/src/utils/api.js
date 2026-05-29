import axios from "axios";

// baseURL is /api — nginx on the same server proxies this to the backend.
// No environment variables needed for a local internal deployment.
const api = axios.create({
  baseURL: "/api",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;

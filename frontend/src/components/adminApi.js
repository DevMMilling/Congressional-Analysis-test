import { api } from "../api";

export function invokeAdminApi(methodName, fallbackMessage, ...args) {
  const fn = api?.[methodName];
  if (typeof fn !== "function") {
    return Promise.reject(new Error(fallbackMessage));
  }

  try {
    return Promise.resolve(fn(...args));
  } catch (error) {
    return Promise.reject(error);
  }
}

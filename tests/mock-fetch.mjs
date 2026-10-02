export default function fetch(url, options) {
  if (typeof globalThis.__atqFetchMock !== "function") {
    throw new Error("Unconfigured mock: network transport is disabled.");
  }
  return globalThis.__atqFetchMock(url, options);
}

// Substitute node-fetch before the compiled module is evaluated. No real network
// transport or credentials are used by these tests.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "node-fetch") {
    return {
      url: new URL("./mock-fetch.mjs", import.meta.url).href,
      shortCircuit: true,
    };
  }
  if (/^(?:node:)?(?:http|https|http2|net|tls)$/.test(specifier)) {
    throw new Error("Network transport is disabled in the offline test suite.");
  }
  return nextResolve(specifier, context);
}

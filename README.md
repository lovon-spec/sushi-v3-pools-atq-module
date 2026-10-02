# Sushi v3 pools ATQ module

TypeScript module that retrieves Sushi v3 pool metadata from The Graph and returns contract address tags through `returnTags(chainId, apiKey)`.

## Source and attribution

This repository is a derivative of [kaiblade/sushi-v3-pools-atq-module](https://github.com/kaiblade/sushi-v3-pools-atq-module), based on upstream commit [`3d8f86cf786c68d3e6417a9ae5b707c605310a06`](https://github.com/kaiblade/sushi-v3-pools-atq-module/tree/3d8f86cf786c68d3e6417a9ae5b707c605310a06). The original author metadata is preserved in `package.json`.

The derivative adds a 30-second request deadline covering transport and JSON consumption, defensive pagination checks, sanitized errors, nonempty API-key validation, and canonical The Graph gateway URLs using an Authorization Bearer header with redirects rejected. The `atq-types` dependency range follows the recommended caret spelling while the locked dependency version remains unchanged. Configured deployment IDs and tag construction are unchanged from the upstream source.

## Build and interface

Use Node.js and Yarn Classic with the committed dependency lock:

```sh
yarn install --frozen-lockfile --ignore-scripts
yarn build
```

The compiler produces `dist/main.mjs`. Its exported async function accepts a chain ID string and a The Graph API key string and returns `Promise<ContractTag[]>`. Supply the key at runtime; do not commit it to this repository. The supported chain IDs and deployment URLs are defined in `src/main.mts`.

The inherited package test command references an upstream test entry point that is not included in this source-only publication. It is not the separate offline validation suite used to review this derivative.

## Validation scope

The reviewed source compiles with TypeScript 5.4.2 and passed 24 offline tests of the compiled module with mocked network transport. The checked Avalanche dataset contained 142 pools, and every generated output matched the baseline. A separately executed exact canonical API request succeeded, and replaying its response through the compiled module produced the same outputs. This is not a claim that the complete module was run with a real API key or that every configured chain was live-tested.

Publication does not constitute registry acceptance or a guarantee of future source data, naming, overlap, or policy compliance.

## License

Upstream `package.json` declares MIT. The inspected upstream commit has no standalone license file or copyright-year notice. This repository preserves that declaration and author attribution and includes the MIT permission and warranty terms in [LICENSE](LICENSE), without inventing an upstream copyright year.

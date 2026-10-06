# Sushi v3 pools ATQ module

TypeScript module that retrieves Sushi v3 pool metadata from The Graph and returns contract address tags through `returnTags(chainId, apiKey)`.

## Source and attribution

This repository is a derivative of [kaiblade/sushi-v3-pools-atq-module](https://github.com/kaiblade/sushi-v3-pools-atq-module), based on upstream commit [`3d8f86cf786c68d3e6417a9ae5b707c605310a06`](https://github.com/kaiblade/sushi-v3-pools-atq-module/tree/3d8f86cf786c68d3e6417a9ae5b707c605310a06). The original author metadata is preserved in `package.json`.

The derivative adds bounded, credential-safe requests and pagination. It reads source metadata once, then requests all pool pages at that block hash and checks the deployment, hash, block number and indexing-error flag on every page. Historical snapshot unavailability causes an error rather than a silent fallback to moving source data. A terminal first page now needs two requests: the metadata preflight and the pool query.

Cursor variables use the String scalar for the configured Sushi entity IDs. Tags remain dynamically constructed from source metadata. Empty or HTML/Markdown-formatted token metadata is excluded because it cannot produce valid plain-text tags; malformed metadata or noninteger fees cause a safe error. The public name budget includes the actual formatted fee suffix.

When multiple pools would receive the same public name, their labels include a distinguishing pool-address prefix and their notes include the full pool address. Prefixes expand if needed; a full-address label is used when a distinguishing prefix leaves insufficient space for a token-pair label. This comparison covers the complete snapshot, not individual pages. No otherwise valid pool is dropped to resolve a name collision.

## Build and interface

Use Node.js and Yarn Classic with the committed dependency lock:

```sh
yarn install --frozen-lockfile --ignore-scripts
yarn build
yarn test
```

The compiler produces `dist/main.mjs`. Its exported async function accepts a chain ID string and a The Graph API key string and returns `Promise<ContractTag[]>`. Supply the key at runtime; do not commit it to this repository. The supported chain IDs and deployment URLs are defined in `src/main.mts`.

## Validation scope

The committed offline test suite builds the actual module, substitutes network transport with controlled responses, and checks the 142-pool fixture plus pagination, strict request construction, invalid metadata, snapshot inconsistencies, error atomicity, deadlines and credential redaction. Tests use synthetic keys and make no live API calls. Run `yarn test` after installing the locked dependencies. The test runner uses Node's ESM loader and test runner; Node 20.11 or newer is recommended.

The fixture records Avalanche data observed on 2 October 2026. A separate independent review reconstructed the same 142 outputs from factory events and token metadata. These observations do not establish current source availability, overlap, or completeness after that snapshot. The revised snapshot-bound query must be validated separately before any claim of live end-to-end operation.

Publication does not constitute registry acceptance or a guarantee of future source data, naming, overlap, or policy compliance.

## License

Upstream `package.json` declares MIT. The inspected upstream commit has no standalone license file or copyright-year notice. This repository preserves that declaration and author attribution and includes the MIT permission and warranty terms in [LICENSE](LICENSE), without inventing an upstream copyright year.

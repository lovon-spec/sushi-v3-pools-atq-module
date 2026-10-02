# Offline public-data fixtures

`avalanche-pools.json` contains the 142 Sushi v3 Avalanche pool rows captured
during the October 2, 2026 review. The public token metadata and fee-tier rows
were joined at block 96,575,449, hash
`0x745d2e8ed586b82c34691982d7007ed8ed0d96d60c95fd3faf7124ec8649bca4`, for deployment
`QmUyC7YYpRkh5M2S7BP2gM8t8wkm7NYNAKrspW4r6uimjM`.

`avalanche-expected-tags.json` is the previously reviewed 142-row simulated tag
output, preserved as a fixed regression expectation. It is test data, not a
registry submission or a fresh API response. These fixtures contain no request
headers, API keys, credentials, or private account information.

The test suite also creates synthetic rows in memory to exercise pagination,
malformed responses, metadata validation, and deadline handling. The mock loader
replaces `node-fetch`, blocks direct Node HTTP/network imports, and the suite
disables the built-in `fetch`. It never queries the public endpoints represented
in the fixtures or uses a real API key.

## Derived GraphQL schema fixture

`derived-graph-api-schema.graphql` models the generated API fields used by the
module. Its entity field types are derived from the [pinned Sushi v3 entity
schema](https://cdn.kleros.link/ipfs/QmSCM39NPLAjNQXsnkqq6H8z8KBi5YkfYyApPYLQbbC2kb),
referenced by deployment manifest
`QmUyC7YYpRkh5M2S7BP2gM8t8wkm7NYNAKrspW4r6uimjM`. The reviewed full source schema
has SHA-256 `01336cf861579ced7f92fb0ac6acf3d9a83838727abbe70e98a7afc82b267006`.
It declares `Pool.id: ID!`, `feeTier: BigInt!`, and token `name` and `symbol` as
`String!`. The Graph's [schema documentation](https://thegraph.com/docs/en/subgraphs/developing/creating/ql-schema/)
documents `ID` as a synonym for `String`; the corresponding generated `id_gt`
filter is represented here as `String`. Block hashes are represented as `Bytes`.

The fixture is a deliberately minimal derived API surface, not a complete
schema, live endpoint introspection, or an assertion that every configured
deployment has been queried. GraphQL.js validates the exact queries captured from
the compiled module against it. Changing the captured cursor declaration from
`String!` to `Bytes!` is a negative control and must fail validation.

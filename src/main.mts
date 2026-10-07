import fetch from "node-fetch";
import { ContractTag, ITagService } from "atq-types";

// Subgraph URLs for various chains
const SUBGRAPH_URLS: Record<string, { decentralized: string }> = {
  // All endpoints below correspond to the official Sushi v3 subgraphs on https://docs.sushi.com/subgraphs/clamm.

  // Arbitrum One
  "42161": {
    decentralized:
      "https://gateway.thegraph.com/api/deployments/id/QmecewJ7QhNTKycFQjySoim7eDrZ53MaR754GbEPqqMGHy",
  },

  // Fantom
  "250": {
    decentralized:
      "https://gateway.thegraph.com/api/deployments/id/QmdqDrZZKzASkiY1UpCUXSYdzVrJ5ru1JrqxMHGd5Ag2yS",
  },

  // Polygon
  "137": {
    decentralized:
      "https://gateway.thegraph.com/api/deployments/id/QmYAA8ymppZN4APXnqUhVNEnCwN1ZqHJyWsbmXuzpQ25Km",
  },

  // Gnosis
  "100": {
    decentralized:
      "https://gateway.thegraph.com/api/deployments/id/Qmadb2zb5P2avAy7zs454bLoEycfA6qzk61LwmDVJExUWg",
  },

  // BSC
  "56": {
    decentralized:
      "https://gateway.thegraph.com/api/deployments/id/QmWQcbEg7J9gWBWfuqnknj5pdYZTp4U31JxQrmjWNEmpTM",
  },

  // Optimism
  "10": {
    decentralized:
      "https://gateway.thegraph.com/api/deployments/id/QmVHZfj6pWc7WSe4vY5epZVGGfggyVZt48voKVxf19Dc8U",
  },

  // Avalanche C
  "43114": {
    decentralized:
      "https://gateway.thegraph.com/api/deployments/id/QmUyC7YYpRkh5M2S7BP2gM8t8wkm7NYNAKrspW4r6uimjM",
  },

  // Scroll
  "534352": {
    decentralized:
      "https://gateway.thegraph.com/api/deployments/id/QmNqxqVfBETuMhV91BfquULGBLFvPZwr3ADVFTMgGZcqNf",
  },

  // Katana
  "747474": {
    decentralized:
      "https://gateway.thegraph.com/api/deployments/id/QmNRPP7nyadmgVRZ5tAdm7vqzQGRFHwdQJaMUVWv6xsfoR",
  },

  // Linea
  "59144": {
    decentralized:
      "https://gateway.thegraph.com/api/deployments/id/QmVUWgFKqLABaX7QDaJFxXai2MZeZtqjvLuPqCrED8eJfN",
  },

  // Ethereum
  "1": {
    decentralized:
      "https://gateway.thegraph.com/api/deployments/id/QmP1FMFsU4wNcui1eezwuvBjxrbLPucKrKZ9Kftn34nULw",
  },

  // Sonic
  "146": {
    decentralized:
      "https://gateway.thegraph.com/api/deployments/id/Qmaa6gJsqzeSnDBjq4NnwerMGMSaSDLqRMDkrevGXwVUt1",
  },

  // Base
  "8453": {
    decentralized:
      "https://gateway.thegraph.com/api/deployments/id/QmZftpYFevNQgBPxyaZGoz3pfbtHVEzL1BrMojqTjfYV3g",
  },
};

const PROTOCOL_NETWORKS: Record<string, { network: string }> = {
  "42161": {
    network:
      "Arbitrum One",
  },
  "59144": {
    network:
      "Linea"
  },
  "56": {
    network:
      "BSC",
  },
  "10": {
    network:
      "Optimism",
  },
  "100": {
    network:
      "Gnosis"
  },
  "250": {
    network:
      "Fantom",
  },
  "137": {
    network:
      "Polygon",
  },
  "43114": {
    network:
      "Avalanche C"
  },
  "534352": {
    network:
      "Scroll",
  },
  "747474": {
    network:
      "Katana",
  },
  "1": {
    network:
      "Ethereum Mainnet"
  },
  "146": {
    network:
      "Sonic",
  },
  "8453": {
    network:
      "Base",
  }
};

// The Graph API queries and types
interface PoolToken { id: string; name: string; symbol: string; }
interface Pool { id: string; token0: PoolToken; token1: PoolToken; feeTier: string; }
interface SourceMeta {
  deployment: string;
  hasIndexingErrors: boolean;
  block: { number: number; hash: string };
}
interface GraphQLResponse {
  data?: { pools?: Pool[]; _meta?: SourceMeta };
  errors?: unknown;
}
const REQUEST_TIMEOUT_MS = 30_000;
class RetrievalError extends Error {}
const GET_SNAPSHOT_QUERY = `
query GetSnapshot {
  _meta { deployment hasIndexingErrors block { number hash } }
}
`;
const GET_POOLS_QUERY = `
query GetPools($lastId: String!, $blockHash: Bytes!) {
  _meta(block: { hash: $blockHash }) {
    deployment hasIndexingErrors block { number hash }
  }
  pools(first: 1000, orderBy: id, orderDirection: asc,
        where: { id_gt: $lastId }, block: { hash: $blockHash }) {
    id
    token0 { id name symbol }
    token1 { id name symbol }
    feeTier
  }
}
`;

async function request(
  url: string, apiKey: string, query: string, variables: Record<string, string> = {}
): Promise<GraphQLResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let result: GraphQLResponse;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json",
                 Authorization: `Bearer ${apiKey.trim()}` },
      redirect: "error", signal: controller.signal,
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) throw new RetrievalError("HTTP request failed.");
    result = (await response.json()) as GraphQLResponse;
  } catch (error) {
    if (controller.signal.aborted) throw new RetrievalError("The Graph request timed out.");
    // Never expose a transport exception, which can contain credentials or headers.
    throw new RetrievalError("The Graph request failed or returned invalid JSON.");
  } finally {
    clearTimeout(timer);
  }
  if (!result || typeof result !== "object") {
    throw new RetrievalError("The Graph returned an invalid response.");
  }
  if (result.errors !== undefined) throw new RetrievalError("The Graph returned GraphQL errors.");
  return result;
}

function validateMeta(value: SourceMeta | undefined, deployment: string, anchor?: SourceMeta): SourceMeta {
  if (!value || value.deployment !== deployment || value.hasIndexingErrors !== false ||
      !value.block || !Number.isSafeInteger(value.block.number) || value.block.number < 0 ||
      typeof value.block.hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value.block.hash) ||
      /^0x0{64}$/.test(value.block.hash) ||
      (anchor && (value.block.hash.toLowerCase() !== anchor.block.hash.toLowerCase() ||
                  value.block.number !== anchor.block.number))) {
    throw new RetrievalError("The Graph returned invalid or inconsistent snapshot metadata.");
  }
  return value;
}

function containsHtmlOrMarkdown(text: string): boolean {
  return /<[^>]*>/.test(text) || /`/.test(text) || /^ {0,3}~{3,}[^\r\n]*$/m.test(text) ||
    /\*{1,3}[^*]+\*{1,3}/.test(text) ||
    /(?:^|[^\p{L}\p{N}])_{1,3}[^_]+_{1,3}(?=$|[^\p{L}\p{N}])/u.test(text) ||
    /~~[^~]+~~/.test(text) ||
    /!?\[[^\]]*\]\s*(?:\([^)]*\)|\[[^\]]*\])/.test(text) ||
    /^(?: {0,3}(?:#{1,6}\s|>\s?|[-+*]\s|[0-9]+[.)]\s)| {4,}\S|\t\S)/m.test(text) ||
    /^ {0,3}(?:\*\s*){3,}$|^ {0,3}(?:-\s*){3,}$|^ {0,3}(?:_\s*){3,}$/m.test(text) ||
    /\r?\n {0,3}(?:=+|-+)\s*(?:\r?\n|$)/.test(text) ||
    /^ {0,3}\[[^\]]+\]:\s*\S/m.test(text) ||
    /^ *\|? *:?-{3,}:? *\|(?: *:?-{3,}:? *\|?)+ *$/m.test(text);
}

function validToken(token: PoolToken): boolean {
  if (!token || typeof token.id !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(token.id) ||
      typeof token.name !== "string" || typeof token.symbol !== "string") {
    throw new RetrievalError("Invalid Sushi v3 token metadata was returned.");
  }
  return [token.name, token.symbol].some(value => value.trim() !== "") &&
    [token.name, token.symbol].every(value => !containsHtmlOrMarkdown(value));
}

// Angle's official list binds these chain/address identities to EURA:
// https://github.com/AngleProtocol/angle-token-list/blob/ff24d36738f8a7814e6f78f6ec57483ea9c4dbc3/ERC20_LIST.json
const EURA_ADDRESSES: Record<string, string> = {
  "100": "0x4b1e2c2762667331bc91648052f646d1b0d35984",
  "137": "0xe0b52e49357fd4daf2c15e02058dce6bc0057db4",
};
// Exact Polygon identities, not ticker-wide replacements. Circle identifies bridged USDC.e:
// https://www.circle.com/blog/what-you-need-to-know-native-usdc-on-polygon-pos
// Terra's Classic names: https://docs.terra.money/migration/exchange-migration/
// Original Terra bridge identities and Polygon PoS mapping are documented in README.md.
// MAI identity and former name: https://docs.mai.finance/docs/functions/smart-contract-addresses
// https://docs.mai.finance/docs/resources/qi-glossary
// Circle's same-token EURC rename and Polygon PoS child mapping: README.md.
// Polygon's in-place USDT0 upgrade: https://usdt0.to/ecosystem/polygon
const POLYGON_TOKEN_NAMES: Record<string, [string, string, string, string]> = {
  "0x8a037dbca8134ffc72c362e394e35e0cad618f85":
    ["Euro Coin (PoS)", "Bridged EURC (Polygon PoS)", "EUROC", "EURC"],
  "0xc2132d05d31c914a87c6611c10748aeb04b58e8f":
    ["(PoS) Tether USD", "USDT0", "USDT", "USDT0"],
  "0xa3fa99a148fa48d14ed51d610c367c61876997f1":
    ["miMATIC", "MAI", "miMATIC", "MAI"],
  "0x2791bca1f2de4661ed88a30c99a7a9449aa84174":
    ["USD Coin (PoS)", "Bridged USDC (Polygon PoS)", "USDC", "USDC.e"],
  "0x24834bbec7e39ef42f4a75eaf8e5b6486d3f0e57":
    ["Wrapped LUNA Token (PoS)", "Wrapped Luna Classic (Shuttle, Polygon PoS)", "LUNA", "LUNC"],
  "0x692597b009d13c4049a947cab2239b7d6517875f":
    ["Wrapped UST Token (PoS)", "Wrapped TerraClassicUSD (Shuttle, Polygon PoS)", "UST", "USTC"],
  "0x9cd6746665d9557e1b9a775819625711d0693439":
    ["LUNA", "Luna Classic (Wormhole)", "LUNA", "LUNC"],
  "0xe6469ba6d2fd6130788e0ea9c0a0515900563b59":
    ["UST", "TerraClassicUSD (Wormhole)", "UST", "USTC"],
};
function normalizeToken(chainId: string, token: PoolToken): PoolToken {
  const names = chainId === "137" ? POLYGON_TOKEN_NAMES[token.id.toLowerCase()] : undefined;
  if (names) return { ...token,
    name: token.name.trim() === names[0] ? names[1] : token.name,
    symbol: token.symbol.trim() === names[2] ? names[3] : token.symbol };
  if (token.id.toLowerCase() !== EURA_ADDRESSES[chainId]) return token;
  // Correct only the stale pre-rebrand metadata, not unrelated or future names.
  // Pool membership, contract addresses and fees still come from the subgraph.
  return { ...token,
    name: token.name.trim() === "agEUR" ? "EURA (previously agEUR)" : token.name,
    symbol: token.symbol.trim() === "agEUR" ? "EURA" : token.symbol };
}

function shortenName(value: string, budget: number): string {
  if (value.length <= budget) return value;
  let shortened = "";
  // Count conservatively in UTF-16 units without cutting a surrogate pair.
  for (const character of value) {
    if (shortened.length + character.length > budget - 3) break;
    shortened += character;
  }
  return shortened + "...";
}

function transformPoolsToTags(chainId: string, pools: Pool[]): ContractTag[] {
  const tags: ContractTag[] = [];
  for (const pool of pools) {
    // The pinned factory PoolCreated ABI declares fee as uint24.
    if (typeof pool.feeTier !== "string" || !/^[0-9]+$/.test(pool.feeTier) ||
        !Number.isSafeInteger(Number(pool.feeTier)) || Number(pool.feeTier) < 0 ||
        Number(pool.feeTier) > 0xffffff) {
      throw new RetrievalError("Invalid Sushi v3 pool fee was returned.");
    }
    // Skip only tokens with no usable identifier, or metadata that would put
    // HTML/Markdown in the emitted fields. A missing name or symbol alone is
    // not grounds to omit a pool: use its other source-provided identifier.
    const token0Valid = validToken(pool.token0);
    const token1Valid = validToken(pool.token1);
    if (!token0Valid || !token1Valid) continue;
    const fee = Number(pool.feeTier) / 10000;
    const suffix = `-${fee}% Pool`;
    const budget = 50 - suffix.length;
    if (budget < 3) throw new RetrievalError("The pool fee cannot fit in a valid public name.");
    const tokens = [pool.token0, pool.token1].map(token => normalizeToken(chainId, token));
    const symbols = tokens.map(token => token.symbol.trim() ? token.symbol : token.name).join("/");
    const names = tokens.map(token => token.name.trim() ? token.name : token.symbol).join("/");
    const identifierLabel = tokens.every(token => token.symbol.trim()) ? "Symbol" : "Token identifiers";
    const displaySymbols = shortenName(symbols, budget);
    const publicName = displaySymbols + suffix;
    const note = `Sushi v3's ${names} (${identifierLabel}: ${symbols}) pool, with ${fee}% fee tier, on ${PROTOCOL_NETWORKS[chainId].network} network`;
    // Also inspect composed fields: delimiters from different source fields can pair.
    if (containsHtmlOrMarkdown(publicName) || containsHtmlOrMarkdown(note)) continue;
    if (publicName.length > 50) throw new RetrievalError("Invalid public name length.");
    tags.push({ "Contract Address": `eip155:${chainId}:${pool.id}`,
      "Public Name Tag": publicName, "Project Name": "Sushi v3",
      "UI/Website Link": "https://www.sushi.com/", "Public Note": note });
  }
  return tags;
}

function differentiateInstances(tags: ContractTag[]): ContractTag[] {
  const counts = new Map<string, number>();
  for (const tag of tags) {
    const name = tag["Public Name Tag"];
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  // Token names/symbols can repeat. Resolve label collisions across the complete
  // snapshot, including different pages, without omitting any otherwise valid pool.
  for (let digits = 8; digits <= 40; digits += 2) {
    const distinct = tags.map(tag => {
      const name = tag["Public Name Tag"];
      if (counts.get(name) === 1) return tag;
      const address = tag["Contract Address"].split(":")[2].toLowerCase();
      const suffix = name.match(/-\d+(?:\.\d+)?% Pool$/)?.[0];
      if (!suffix) throw new RetrievalError("Invalid pool name suffix.");
      const marker = ` (0x${address.slice(2, 2 + digits)})`;
      const budget = 50 - suffix.length - marker.length;
      // A very long shared address prefix can leave no useful symbol budget.
      // The full pool address is an exact, self-contained identifier in that case.
      const publicName = budget >= 3
        ? shortenName(name.slice(0, -suffix.length), budget) + suffix + marker
        : `Pool ${address}`;
      return { ...tag, "Public Name Tag": publicName,
        "Public Note": `${tag["Public Note"]}. Pool address: ${address}.` };
    });
    if (new Set(distinct.map(tag => tag["Public Name Tag"])).size === tags.length) return distinct;
  }
  throw new RetrievalError("Pool instances could not be differentiated.");
}

class TagService implements ITagService {
  returnTags = async (chainId: string, apiKey: string): Promise<ContractTag[]> => {
    if (typeof apiKey !== "string" || apiKey.trim() === "") {
      throw new Error("The Graph API key must be a nonempty string.");
    }
    if (typeof chainId !== "string" || !Object.hasOwn(SUBGRAPH_URLS, chainId)) {
      throw new Error(`Unsupported Chain ID: ${String(chainId)}.`);
    }
    const url = SUBGRAPH_URLS[chainId].decentralized;
    const deployment = url.slice(url.lastIndexOf("/") + 1);
    const snapshot = await request(url, apiKey, GET_SNAPSHOT_QUERY);
    const anchor = validateMeta(snapshot.data?._meta, deployment);
    let lastId = "0x0000000000000000000000000000000000000000";
    const allTags: ContractTag[] = [];
    while (true) {
      const result = await request(url, apiKey, GET_POOLS_QUERY,
        { lastId, blockHash: anchor.block.hash });
      validateMeta(result.data?._meta, deployment, anchor);
      const pools = result.data?.pools;
      if (!Array.isArray(pools)) throw new RetrievalError("No valid pools array was returned.");
      if (pools.length > 1000) throw new RetrievalError("The Graph returned more rows than the requested page size.");
      let previous = lastId.toLowerCase();
      for (const pool of pools) {
        if (!pool || typeof pool.id !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(pool.id) ||
            pool.id.toLowerCase() <= previous) {
          throw new RetrievalError("The Graph returned an invalid or non-increasing pool ID.");
        }
        previous = pool.id.toLowerCase();
      }
      allTags.push(...transformPoolsToTags(chainId, pools));
      if (pools.length < 1000) return differentiateInstances(allTags);
      lastId = pools[pools.length - 1].id;
    }
  };
}
const tagService = new TagService();
export const returnTags = tagService.returnTags;

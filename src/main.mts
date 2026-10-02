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
interface PoolToken { name: string; symbol: string; }
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
    token0 { name symbol }
    token1 { name symbol }
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
  if (!token || typeof token.name !== "string" || typeof token.symbol !== "string") {
    throw new RetrievalError("Invalid Sushi v3 token metadata was returned.");
  }
  return [token.name, token.symbol].every(value => value.trim() !== "" && !containsHtmlOrMarkdown(value));
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
    // Empty or formatted token metadata would produce invalid ATR entries.
    // Exclude those rows without inventing replacement names or altering source text.
    const token0Valid = validToken(pool.token0);
    const token1Valid = validToken(pool.token1);
    if (!token0Valid || !token1Valid) continue;
    const fee = Number(pool.feeTier) / 10000;
    const suffix = `-${fee}% Pool`;
    const budget = 50 - suffix.length;
    if (budget < 3) throw new RetrievalError("The pool fee cannot fit in a valid public name.");
    const symbols = `${pool.token0.symbol}/${pool.token1.symbol}`;
    // Count conservatively in UTF-16 units, but never cut a surrogate pair in half.
    let displaySymbols = symbols;
    if (symbols.length > budget) {
      displaySymbols = "";
      for (const character of symbols) {
        if (displaySymbols.length + character.length > budget - 3) break;
        displaySymbols += character;
      }
      displaySymbols += "...";
    }
    const publicName = displaySymbols + suffix;
    const note = `Sushi v3's ${pool.token0.name}/${pool.token1.name} (Symbol: ${pool.token0.symbol}/${pool.token1.symbol}) pool, with ${fee}% fee tier, on ${PROTOCOL_NETWORKS[chainId].network} network`;
    // Also inspect composed fields: delimiters from different source fields can pair.
    if (containsHtmlOrMarkdown(publicName) || containsHtmlOrMarkdown(note)) continue;
    if (publicName.length > 50) throw new RetrievalError("Invalid public name length.");
    tags.push({ "Contract Address": `eip155:${chainId}:${pool.id}`,
      "Public Name Tag": publicName, "Project Name": "Sushi v3",
      "UI/Website Link": "https://www.sushi.com/", "Public Note": note });
  }
  return tags;
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
      if (pools.length < 1000) return allTags;
      lastId = pools[pools.length - 1].id;
    }
  };
}
const tagService = new TagService();
export const returnTags = tagService.returnTags;

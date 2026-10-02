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
interface PoolToken {
  name: string;
  symbol: string;
}

interface Pool {
  id: string;
  token0: PoolToken;
  token1: PoolToken;
  feeTier: string;
}

interface GraphQLData {
  pools: Pool[];
}

interface GraphQLResponse {
  data?: GraphQLData;
  errors?: { message: string }[]; // Assuming the API might return errors in this format
}

// Defining headers for the query
const REQUEST_TIMEOUT_MS = 30_000;

class RetrievalError extends Error {}

const headers: Record<string, string> = {
  "Content-Type": "application/json",
  Accept: "application/json",
};

const GET_POOLS_QUERY = `
query GetPools($lastId: Bytes!) {
  pools(
      first: 1000,
      orderBy: id,
      orderDirection: asc,
      where: { id_gt: $lastId }
  ) {
    id
    token0 {
      name
      symbol
    }
    token1 {
      name
      symbol
    }
    feeTier
  }
}
`;

function isError(e: unknown): e is Error {
  return (
    typeof e === "object" &&
    e !== null &&
    "message" in e &&
    typeof (e as Error).message === "string"
  );
}

function containsHtmlOrMarkdown(text: string): boolean {
  // Simple HTML tag detection
  return /<[^>]*>/.test(text);
}

function isEmptyOrInvalid(text: string): boolean {
  return text.trim() === "" || containsHtmlOrMarkdown(text);
}

async function fetchData(
  subgraphUrl: string,
  lastId: string,
  apiKey: string
): Promise<Pool[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let result: GraphQLResponse;
  try {
    const response = await fetch(subgraphUrl, {
      method: "POST",
      headers: { ...headers, Authorization: `Bearer ${apiKey.trim()}` },
      redirect: "error",
      signal: controller.signal,
      body: JSON.stringify({ query: GET_POOLS_QUERY, variables: { lastId } }),
    });
    if (!response.ok) {
      throw new RetrievalError("HTTP request failed.");
    }
    result = (await response.json()) as GraphQLResponse;
  } catch (error) {
    if (isError(error) && error.name === "AbortError") {
      throw new RetrievalError("The Graph request timed out.");
    }
    // Do not echo fetch errors: they can contain a credential-bearing URL.
    throw new RetrievalError("The Graph request failed or returned invalid JSON.");
  } finally {
    clearTimeout(timer);
  }
  if (result.errors) {
    throw new RetrievalError("The Graph returned GraphQL errors.");
  }
  if (!result.data || !Array.isArray(result.data.pools)) {
    throw new RetrievalError("No valid pools array was returned.");
  }
  const pools = result.data.pools;
  if (pools.length > 1000) {
    throw new RetrievalError("The Graph returned more rows than the requested page size.");
  }
  // Throw on incomplete or nonadvancing pages; never silently skip valid pools.
  let previous = lastId.toLowerCase();
  for (const pool of pools) {
    if (!pool || typeof pool.id !== "string" ||
        !/^0x[0-9a-fA-F]{40}$/.test(pool.id) || pool.id.toLowerCase() <= previous) {
      throw new RetrievalError("The Graph returned an invalid or non-increasing pool ID.");
    }
    previous = pool.id.toLowerCase();
  }
  return pools;
}

function prepareUrl(chainId: string, apiKey: string): string {
  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    throw new Error("The Graph API key must be a nonempty string.");
  }
  const urls = SUBGRAPH_URLS[chainId];
  if (!urls || isNaN(Number(chainId))) {
    const supportedChainIds = Object.keys(SUBGRAPH_URLS).join(", ");
    throw new Error(
      `Unsupported or invalid Chain ID provided: ${chainId}. Only the following values are accepted: ${supportedChainIds}`
    );
  }
  return urls.decentralized;
}

function truncateString(text: string, maxLength: number) {
  if (text.length > maxLength) {
    return text.substring(0, maxLength - 3) + "..."; // Subtract 3 for the ellipsis
  }
  return text;
}

function transformPoolsToTags(chainId: string, pools: Pool[]): ContractTag[] {
  const validPools: Pool[] = [];

  pools.forEach((pool) => {
    const token0Invalid = isEmptyOrInvalid(pool.token0.name) || isEmptyOrInvalid(pool.token0.symbol);
    const token1Invalid = isEmptyOrInvalid(pool.token1.name) || isEmptyOrInvalid(pool.token1.symbol);
    const feeTierInvalid = isEmptyOrInvalid(pool.feeTier) 

    if (token0Invalid || token1Invalid || feeTierInvalid) {
      // Reject pools where any of the fee tier values, token names or symbols are empty or contain invalid content
    } else {
      validPools.push(pool);
    }
  });

  return validPools.map((pool) => {
    // Public Name Tag must be at most 50 characters; we reserve 11 chars for "-fee tier" + " Pool" 
    const maxSymbolsLength = 39;
    const symbolsText = `${pool.token0.symbol}/${pool.token1.symbol}`;
    const truncatedSymbolsText = truncateString(symbolsText, maxSymbolsLength);

    return {
      "Contract Address": `eip155:${chainId}:${pool.id}`,
      "Public Name Tag": `${truncatedSymbolsText}-${Number(pool.feeTier)/10000}% Pool`,
      "Project Name": "Sushi v3",
      "UI/Website Link": "https://www.sushi.com/",
      "Public Note": `Sushi v3's ${pool.token0.name}/${pool.token1.name} (Symbol: ${pool.token0.symbol}/${pool.token1.symbol}) pool, with ${Number(pool.feeTier)/10000}% fee tier, on ${PROTOCOL_NETWORKS[chainId].network} network`,
    };
  });
}

// The main logic for this module
class TagService implements ITagService {
  // Using an arrow function for returnTags
  returnTags = async (
    chainId: string,
    apiKey: string
  ): Promise<ContractTag[]> => {
    // For Bytes-based IDs we must start with a valid minimal value (zero address)
    let lastId: string = "0x0000000000000000000000000000000000000000";
    let allTags: ContractTag[] = [];
    let isMore = true;

    const url = prepareUrl(chainId, apiKey);

    while (isMore) {
      try {
        const vaults = await fetchData(url, lastId, apiKey);
        allTags.push(...transformPoolsToTags(chainId, vaults));

        isMore = vaults.length === 1000;
        if (isMore) {
          lastId = vaults[vaults.length - 1].id;
        }
      } catch (error) {
        // Surface safe failures without logging metadata or credential-bearing URLs.
        if (error instanceof RetrievalError) throw error;
        throw new Error("Invalid Sushi v3 pool metadata was returned.");
      }
    }
    return allTags;
  };
}

// Creating an instance of TagService
const tagService = new TagService();

// Exporting the returnTags method directly
export const returnTags = tagService.returnTags;  

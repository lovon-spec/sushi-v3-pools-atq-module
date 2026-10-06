import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, afterEach, test } from "node:test";
import { buildSchema, parse, validate } from "graphql";
import { returnTags } from "../dist/main.mjs";

const CHAIN = "43114";
const KEY = "TEST_ONLY_NOT_A_REAL_API_KEY";
const DEPLOYMENT = "QmUyC7YYpRkh5M2S7BP2gM8t8wkm7NYNAKrspW4r6uimjM";
const ENDPOINT = `https://gateway.thegraph.com/api/deployments/id/${DEPLOYMENT}`;
const BLOCK_HASH = "0x745d2e8ed586b82c34691982d7007ed8ed0d96d60c95fd3faf7124ec8649bca4";
const OTHER_HASH = `0x${"a".repeat(64)}`;
const ZERO_ADDRESS = `0x${"0".repeat(40)}`;
const BLOCK_NUMBER = 96_575_449;
const nativeFetch = globalThis.fetch;
globalThis.fetch = () => { throw new Error("Network transport is disabled."); };
after(() => { globalThis.fetch = nativeFetch; });
afterEach(() => { delete globalThis.__atqFetchMock; });

const fixture = async (name) => JSON.parse(await readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const snapshot = await fixture("avalanche-pools.json");
const expectedTags = await fixture("avalanche-expected-tags.json");

function meta(overrides = {}) {
  return {
    deployment: DEPLOYMENT,
    hasIndexingErrors: false,
    block: { number: BLOCK_NUMBER, hash: BLOCK_HASH },
    ...overrides,
  };
}

function row(number, overrides = {}) {
  return {
    id: `0x${number.toString(16).padStart(40, "0")}`,
    token0: { name: "Alpha", symbol: "A" },
    token1: { name: "Beta", symbol: "B" },
    feeTier: "3000",
    ...overrides,
  };
}

const fullPage = () => Array.from({ length: 1000 }, (_, index) => row(index + 1));
const response = (body) => ({ ok: true, status: 200, json: async () => structuredClone(body) });
const preflight = (metadata = meta()) => response({ data: { _meta: metadata } });
const page = (rows, metadata = meta()) => response({ data: { _meta: metadata, pools: rows } });

// A strict response queue catches extra fetches and keeps all failure tests finite.
function queue(...responses) {
  const calls = [];
  globalThis.__atqFetchMock = async (url, options) => {
    const index = calls.length;
    calls.push({ url, options, body: JSON.parse(options.body) });
    assert.ok(index < responses.length, "Unexpected additional request");
    const next = responses[index];
    return typeof next === "function" ? next(url, options) : next;
  };
  return calls;
}

async function tagsFor(rows) {
  const calls = queue(preflight(), page(rows));
  const tags = await returnTags(CHAIN, KEY);
  assert.equal(calls.length, 2);
  return tags;
}

function assertSafeError(error) {
  assert.ok(error instanceof Error);
  assert.ok(error.message.length > 0);
  assert.ok(!error.message.includes(KEY), "Error must not echo the dummy credential");
  assert.ok(!error.message.includes("Bearer"), "Error must not echo the authorization header");
  assert.ok(!error.message.includes("https://"), "Error must not echo request URLs");
  assert.ok(!error.message.includes("PRIVATE_RESPONSE_MARKER"), "Error must not echo response details");
  return true;
}

async function rejectedResponses(...responses) {
  const calls = queue(...responses);
  await assert.rejects(returnTags(CHAIN, KEY), assertSafeError);
  return calls;
}

test("the 142 frozen Avalanche rows preserve all fields except the two colliding instance labels", async () => {
  assert.equal(snapshot.length, 142);
  assert.equal(expectedTags.length, 142);
  const updated = structuredClone(expectedTags);
  const instances = new Map([
    ["0x110e68959f40802d6fc017094d91ee6ca18a43f8", "0x110e6895"],
    ["0x48c99d1544cd27a9c2c2a9e00542c0f102501a95", "0x48c99d15"],
  ]);
  let changed = 0;
  for (const tag of updated) {
    const address = tag["Contract Address"].split(":")[2];
    const prefix = instances.get(address);
    if (!prefix) continue;
    assert.equal(tag["Public Name Tag"], "CS/WAVAX-0.01% Pool");
    tag["Public Name Tag"] = `CS/WAVAX-0.01% Pool (${prefix})`;
    tag["Public Note"] += `. Pool address: ${address}.`;
    changed++;
  }
  assert.equal(changed, 2);
  assert.deepEqual(await tagsFor(snapshot), updated);
});

test("canonical gateway, Bearer authentication, redirect refusal, and correct GraphQL scalars", async () => {
  const calls = queue(preflight(), page([row(1)]));
  await returnTags(CHAIN, `  ${KEY}  `);
  assert.equal(calls.length, 2);
  for (const { url, options } of calls) {
    assert.equal(url, ENDPOINT);
    assert.ok(!url.includes(KEY));
    assert.equal(options.method, "POST");
    assert.equal(options.headers.Authorization, `Bearer ${KEY}`);
    assert.equal(options.headers["Content-Type"], "application/json");
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
  }
  const preflightQuery = calls[0].body.query;
  assert.match(preflightQuery, /\b_meta\s*\{/);
  assert.doesNotMatch(preflightQuery, /\bpools\s*\(/);
  for (const field of ["deployment", "hasIndexingErrors", "number", "hash"]) {
    assert.match(preflightQuery, new RegExp(`\\b${field}\\b`));
  }
  const { query, variables } = calls[1].body;
  assert.match(query, /\$lastId\s*:\s*String!/);
  assert.doesNotMatch(query, /\$lastId\s*:\s*Bytes!/);
  assert.match(query, /\$blockHash\s*:\s*Bytes!/);
  const poolArguments = query.match(/\bpools\s*\(([\s\S]*?)\)\s*\{/);
  assert.ok(poolArguments, "The query must select pools with arguments");
  assert.match(poolArguments[1], /first\s*:\s*1000\b/);
  assert.match(poolArguments[1], /orderBy\s*:\s*id\b/);
  assert.match(poolArguments[1], /orderDirection\s*:\s*asc\b/);
  assert.match(poolArguments[1], /id_gt\s*:\s*\$lastId\b/);
  assert.match(poolArguments[1], /block\s*:\s*\{\s*hash\s*:\s*\$blockHash\s*\}/);
  assert.match(query, /\b_meta\s*\(\s*block\s*:\s*\{\s*hash\s*:\s*\$blockHash\s*\}\s*\)/);
  assert.equal(variables.blockHash, BLOCK_HASH);
  assert.ok(["", ZERO_ADDRESS].includes(variables.lastId));
});

test("both emitted queries validate against the derived API schema; Bytes cursor is rejected", async () => {
  const schemaText = await readFile(new URL("./fixtures/derived-graph-api-schema.graphql", import.meta.url), "utf8");
  const schema = buildSchema(schemaText);
  const calls = queue(preflight(), page([row(1)]));
  await returnTags(CHAIN, KEY);
  assert.equal(calls.length, 2);
  for (const { body } of calls) {
    assert.deepEqual(validate(schema, parse(body.query)), [], "The captured GraphQL query must validate");
  }
  const wrongCursorQuery = calls[1].body.query.replace(/\$lastId\s*:\s*String!/, "$lastId: Bytes!");
  assert.notEqual(wrongCursorQuery, calls[1].body.query);
  const errors = validate(schema, parse(wrongCursorQuery));
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /Variable "\$lastId" of type "Bytes!" used in position expecting type "String"/);
});

test("1,000 + 1,000 + 2 rows remain anchored while the latest block changes", async () => {
  const rows = Array.from({ length: 2002 }, (_, index) => row(index + 1));
  const calls = [];
  let latest = meta();
  globalThis.__atqFetchMock = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    assert.ok(calls.length <= 4, "Pagination must terminate after the short page");
    if (calls.length === 1) {
      const result = preflight(latest);
      latest = meta({ block: { number: BLOCK_NUMBER + 1, hash: OTHER_HASH } });
      return result;
    }
    assert.equal(body.variables.blockHash, BLOCK_HASH);
    assert.notEqual(body.variables.blockHash, latest.block.hash);
    const pageNumber = calls.length - 2;
    if (pageNumber > 0) assert.equal(body.variables.lastId, rows[pageNumber * 1000 - 1].id);
    return page(rows.slice(pageNumber * 1000, (pageNumber + 1) * 1000));
  };
  const tags = await returnTags(CHAIN, KEY);
  assert.equal(tags.length, 2002);
  assert.equal(new Set(tags.map((tag) => tag["Contract Address"])).size, 2002);
  assert.equal(tags.at(-1)["Contract Address"], `eip155:${CHAIN}:${rows.at(-1).id}`);
  assert.equal(calls.length, 4);
});

test("an exact 1,000-row page requests the terminating empty page", async () => {
  const calls = queue(preflight(), page(fullPage()), page([]));
  assert.equal((await returnTags(CHAIN, KEY)).length, 1000);
  assert.equal(calls.length, 3);
  assert.equal(calls[2].body.variables.lastId, row(1000).id);
  assert.equal(calls[2].body.variables.blockHash, BLOCK_HASH);
});

test("an anchored empty page returns no tags", async () => {
  assert.deepEqual(await tagsFor([]), []);
});

test("identical token metadata and fees produce distinct instance labels", async () => {
  const rows = [
    row(1, { id: `0x12345678${"0".repeat(32)}` }),
    row(2, { id: `0x23456789${"0".repeat(32)}` }),
  ];
  const tags = await tagsFor(rows);
  assert.deepEqual(tags.map(tag => tag["Public Name Tag"]), [
    "A/B-0.3% Pool (0x12345678)", "A/B-0.3% Pool (0x23456789)",
  ]);
  tags.forEach((tag, i) => {
    assert.ok(tag["Public Note"].endsWith(`Pool address: ${rows[i].id}.`));
    assert.equal(tag["Contract Address"], `eip155:${CHAIN}:${rows[i].id}`);
  });
});

test("address prefixes expand until colliding names are distinct", async () => {
  const rows = [
    row(1, { id: `0x1234567800${"0".repeat(30)}` }),
    row(2, { id: `0x1234567811${"0".repeat(30)}` }),
  ];
  const tags = await tagsFor(rows);
  assert.deepEqual(tags.map(tag => tag["Public Name Tag"]), [
    "A/B-0.3% Pool (0x1234567800)", "A/B-0.3% Pool (0x1234567811)",
  ]);
});

test("long shared address prefixes use exact full-address labels without dropping pools", async () => {
  const rows = [row(1), row(2)];
  const tags = await tagsFor(rows);
  assert.deepEqual(tags.map(tag => tag["Public Name Tag"]), rows.map(pool => `Pool ${pool.id}`));
  assert.ok(tags.every(tag => tag["Public Name Tag"].length <= 50));
});

test("truncation collisions and Unicode labels remain distinct within 50 code units", async () => {
  const rows = [
    row(1, { id: `0x12345678${"0".repeat(32)}`, token0: { name: "Alpha", symbol: "😀".repeat(30) + "A" } }),
    row(2, { id: `0x23456789${"0".repeat(32)}`, token0: { name: "Beta", symbol: "😀".repeat(30) + "B" } }),
  ];
  const tags = await tagsFor(rows);
  assert.equal(new Set(tags.map(tag => tag["Public Name Tag"])).size, 2);
  for (const tag of tags) {
    assert.ok(tag["Public Name Tag"].length <= 50);
    assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(tag["Public Name Tag"]));
    assert.match(tag["Public Name Tag"], /-0\.3% Pool \(0x[0-9a-f]+\)$/);
  }
});

test("collisions are resolved across page boundaries, not just within each page", async () => {
  const rows = Array.from({ length: 1001 }, (_, index) => row(index + 1, {
    token0: { name: `Token ${index}`, symbol: index === 1000 ? "T0" : `T${index}` },
  }));
  queue(preflight(), page(rows.slice(0, 1000)), page(rows.slice(1000)));
  const tags = await returnTags(CHAIN, KEY);
  assert.equal(tags.length, 1001);
  assert.equal(new Set(tags.map(tag => tag["Public Name Tag"])).size, 1001);
  assert.equal(tags[0]["Public Name Tag"], `Pool ${rows[0].id}`);
  assert.equal(tags[1000]["Public Name Tag"], `Pool ${rows[1000].id}`);
  assert.equal(tags[1]["Public Name Tag"], "T1/B-0.3% Pool");
});

test("invalid preflight metadata fails before fetching any pools", async (t) => {
  const cases = [
    ["missing metadata", undefined],
    ["null metadata", null],
    ["wrong deployment", meta({ deployment: "WRONG_DEPLOYMENT" })],
    ["missing deployment", meta({ deployment: undefined })],
    ["indexing errors", meta({ hasIndexingErrors: true })],
    ["missing indexing status", meta({ hasIndexingErrors: undefined })],
    ["string indexing status", meta({ hasIndexingErrors: "false" })],
    ["missing block", meta({ block: undefined })],
    ["null block", meta({ block: null })],
    ["null hash", meta({ block: { number: BLOCK_NUMBER, hash: null } })],
    ["short hash", meta({ block: { number: BLOCK_NUMBER, hash: "0x1234" } })],
    ["zero hash", meta({ block: { number: BLOCK_NUMBER, hash: `0x${"0".repeat(64)}` } })],
    ["nonhex hash", meta({ block: { number: BLOCK_NUMBER, hash: `0x${"g".repeat(64)}` } })],
    ["unprefixed hash", meta({ block: { number: BLOCK_NUMBER, hash: BLOCK_HASH.slice(2) } })],
    ["negative number", meta({ block: { number: -1, hash: BLOCK_HASH } })],
    ["fractional number", meta({ block: { number: 1.5, hash: BLOCK_HASH } })],
    ["string number", meta({ block: { number: String(BLOCK_NUMBER), hash: BLOCK_HASH } })],
    ["missing number", meta({ block: { hash: BLOCK_HASH } })],
  ];
  for (const [name, metadata] of cases) {
    await t.test(name, async () => {
      const calls = await rejectedResponses(response({ data: { _meta: metadata } }));
      assert.equal(calls.length, 1);
    });
  }
});

test("block zero is valid when its hash is canonical and nonzero", async () => {
  const metadata = meta({ block: { number: 0, hash: BLOCK_HASH } });
  queue(preflight(metadata), page([row(1)], metadata));
  assert.equal((await returnTags(CHAIN, KEY)).length, 1);
});

test("every page must confirm the preflight deployment, block, and healthy indexing", async (t) => {
  const cases = [
    ["missing metadata", undefined],
    ["null metadata", null],
    ["changed deployment", meta({ deployment: "WRONG_DEPLOYMENT" })],
    ["changed hash", meta({ block: { number: BLOCK_NUMBER, hash: OTHER_HASH } })],
    ["changed number", meta({ block: { number: BLOCK_NUMBER + 1, hash: BLOCK_HASH } })],
    ["indexing errors", meta({ hasIndexingErrors: true })],
  ];
  for (const [name, metadata] of cases) {
    await t.test(name, async () => {
      const calls = await rejectedResponses(preflight(), page(fullPage()), response({ data: { _meta: metadata, pools: [row(1001)] } }));
      assert.equal(calls.length, 3);
    });
  }
});

test("HTTP, GraphQL, response-shape, and JSON errors fail safely at either request stage", async (t) => {
  const cases = [
    ["HTTP failure", () => ({ ok: false, status: 503, statusText: `PRIVATE_RESPONSE_MARKER ${KEY}` })],
    ["GraphQL errors", () => response({ errors: [{ message: `PRIVATE_RESPONSE_MARKER ${KEY}` }] })],
    ["partial GraphQL data with errors", () => response({ data: { _meta: meta(), pools: [row(1)] }, errors: [{ message: `PRIVATE_RESPONSE_MARKER ${KEY}` }] })],
    ["missing data", () => response({})],
    ["null body", () => response(null)],
    ["invalid JSON", () => ({ ok: true, json: async () => { throw new Error(`PRIVATE_RESPONSE_MARKER ${KEY}`); } })],
  ];
  for (const [name, makeResponse] of cases) {
    for (const stage of ["preflight", "page"]) {
      await t.test(`${name} at ${stage}`, async () => {
        const responses = stage === "preflight" ? [makeResponse()] : [preflight(), makeResponse()];
        assert.equal((await rejectedResponses(...responses)).length, responses.length);
      });
    }
  }
});

test("missing, null, and non-array pools are rejected", async (t) => {
  for (const pools of [undefined, null, {}, "PRIVATE_RESPONSE_MARKER"]) {
    await t.test(String(pools), async () => {
      await rejectedResponses(preflight(), response({ data: { _meta: meta(), pools } }));
    });
  }
});

test("a later-page failure rejects instead of returning partial tags", async () => {
  const calls = await rejectedResponses(preflight(), page(fullPage()), response({ errors: [{ message: `PRIVATE_RESPONSE_MARKER ${KEY}` }] }));
  assert.equal(calls.length, 3);
});

test("invalid, duplicate, descending, and oversized page IDs are rejected", async (t) => {
  const cases = [
    ["malformed address", [{ ...row(1), id: "PRIVATE_RESPONSE_MARKER" }]],
    ["missing address", [{ ...row(1), id: undefined }]],
    ["null row", [null]],
    ["duplicate address", [row(1), row(1)]],
    ["duplicate address with different case", [row(10), { ...row(10), id: row(10).id.toUpperCase().replace("0X", "0x") }]],
    ["descending IDs", [row(2), row(1)]],
    ["oversized page", Array.from({ length: 1001 }, (_, index) => row(index + 1))],
  ];
  for (const [name, rows] of cases) {
    await t.test(name, () => rejectedResponses(preflight(), page(rows)));
  }
});

test("a repeated full page fails without infinite pagination", async () => {
  const calls = await rejectedResponses(preflight(), page(fullPage()), page(fullPage()));
  assert.equal(calls.length, 3);
});

test("the first ID of every later page must advance past the previous cursor", async () => {
  await rejectedResponses(preflight(), page(fullPage()), page([row(1000), row(1001)]));
});

test("malformed token metadata types fail safely", async (t) => {
  const cases = [
    ["missing token", { token0: undefined }],
    ["null token", { token1: null }],
    ["string token", { token0: "Alpha" }],
    ["missing name", { token0: { symbol: "A" } }],
    ["numeric name", { token0: { name: 123, symbol: "A" } }],
    ["null symbol", { token1: { name: "Beta", symbol: null } }],
    ["object symbol", { token1: { name: "Beta", symbol: {} } }],
  ];
  for (const [name, overrides] of cases) {
    await t.test(name, () => rejectedResponses(preflight(), page([row(1, overrides)])));
  }
});

test("a blank name or symbol uses the other source identifier without omitting the pool", async (t) => {
  for (const token of ["token0", "token1"]) {
    for (const field of ["name", "symbol"]) {
      for (const value of ["", "   ", "\t\n"]) {
        await t.test(`${token}.${field}: ${JSON.stringify(value)}`, async () => {
          const partial = row(1);
          partial[token][field] = value;
          const [tag] = await tagsFor([partial]);
          assert.equal(tag["Contract Address"], `eip155:${CHAIN}:${partial.id}`);
          const identifiers = [partial.token0, partial.token1].map(t => t.symbol.trim() ? t.symbol : t.name).join("/");
          const names = [partial.token0, partial.token1].map(t => t.name.trim() ? t.name : t.symbol).join("/");
          const label = field === "symbol" ? "Token identifiers" : "Symbol";
          assert.equal(tag["Public Name Tag"], `${identifiers}-0.3% Pool`);
          assert.equal(tag["Public Note"], `Sushi v3's ${names} (${label}: ${identifiers}) pool, with 0.3% fee tier, on Avalanche C network`);
        });
      }
    }
  }
});

test("tokens with neither name nor symbol remain excluded, without dropping other rows", async (t) => {
  for (const token of ["token0", "token1"]) {
    for (const value of ["", "   ", "\t\n"]) {
      await t.test(`${token}: ${JSON.stringify(value)}`, async () => {
        const unusable = row(1, { [token]: { name: value, symbol: value } });
        const tags = await tagsFor([unusable, row(2)]);
        assert.equal(tags.length, 1);
        assert.equal(tags[0]["Contract Address"], `eip155:${CHAIN}:${row(2).id}`);
      });
    }
  }
});

test("a missing field on each token still produces truthful identifiers", async () => {
  const [tag] = await tagsFor([row(1, {
    token0: { name: "", symbol: "A" }, token1: { name: "Beta", symbol: "" },
  })]);
  assert.equal(tag["Public Name Tag"], "A/Beta-0.3% Pool");
  assert.equal(tag["Public Note"], "Sushi v3's A/Beta (Token identifiers: A/Beta) pool, with 0.3% fee tier, on Avalanche C network");
});

test("nonempty promotional symbols are literal metadata, not grounds for exclusion", async () => {
  const symbols = [
    "!Ads BTC Casino www.MaticSlot.io", "Ads: POL Casino www.MaticSlot.io",
    "Ads: BNB Casino www.MaticSlot.io", "!Ads ETH Casino www.MaticSlot.io",
  ];
  const rows = symbols.map((symbol, index) => row(index + 1, {
    token0: { name: " ", symbol }, token1: { name: "SushiToken (PoS)", symbol: "SUSHI" }, feeTier: "100",
  }));
  const tags = await tagsFor(rows);
  assert.equal(tags.length, rows.length);
  for (let index = 0; index < tags.length; index++) {
    assert.equal(tags[index]["Public Name Tag"], `${symbols[index]}/SUSHI-0.01% Pool`);
    assert.ok(tags[index]["Public Note"].includes(`${symbols[index]}/SushiToken (PoS)`));
  }
});

test("HTML and Markdown-bearing token names or symbols are skipped", async (t) => {
  const values = [
    "<b>Alpha</b>", "Alpha<br>Beta", "<!-- Alpha -->",
    "*Alpha*", "**Alpha**", "_Alpha_", "__Alpha__", "~~Alpha~~",
    "`Alpha`", "```Alpha```", "~~~text\nAlpha\n~~~", "[Alpha](https://example.invalid)",
    "![Alpha](https://example.invalid/image)", "# Alpha", "## Alpha",
    "Alpha\n# Heading", "> Alpha", "- Alpha", "1. Alpha",
    "Alpha\n---", "| --- | --- |", "[alpha]: https://example.invalid",
    "**Sample\nToken**", "[Sample\nToken](https://example.invalid)", "     Sample code",
  ];
  for (const value of values) {
    await t.test(value, async () => {
      for (const token of ["token0", "token1"]) {
        for (const field of ["name", "symbol"]) {
          const invalid = row(1);
          invalid[token][field] = value;
          const tags = await tagsFor([invalid, row(2)]);
          assert.equal(tags.length, 1, `${token}.${field} should be skipped`);
          assert.equal(tags[0]["Contract Address"], `eip155:${CHAIN}:${row(2).id}`);
        }
      }
    });
  }
});

test("ordinary punctuation, embedded underscores, and literal text are preserved", async () => {
  const plain = row(1, {
    token0: { name: "Alpha & Beta (v2) + 50%: #1!", symbol: "A_B" },
    token1: { name: "Beta's token [plain] / v3; x=2?", symbol: "B.e+$" },
  });
  const [tag] = await tagsFor([plain]);
  assert.equal(tag["Public Name Tag"], "A_B/B.e+$-0.3% Pool");
  assert.equal(tag["Public Note"], "Sushi v3's Alpha & Beta (v2) + 50%: #1!/Beta's token [plain] / v3; x=2? (Symbol: A_B/B.e+$) pool, with 0.3% fee tier, on Avalanche C network");
});

test("markup formed only after combining individually plain metadata is skipped", async (t) => {
  const cases = [
    ["paired emphasis across symbols", { token0: { name: "Alpha", symbol: "*A" }, token1: { name: "Beta", symbol: "B*" } }],
    ["HTML across names", { token0: { name: "<b", symbol: "A" }, token1: { name: ">", symbol: "B" } }],
    ["Markdown link across names", { token0: { name: "[Alpha", symbol: "A" }, token1: { name: "](https://example.invalid)", symbol: "B" } }],
  ];
  for (const [name, overrides] of cases) {
    await t.test(name, async () => {
      const tags = await tagsFor([row(1, overrides), row(2)]);
      assert.equal(tags.length, 1);
      assert.equal(tags[0]["Contract Address"], `eip155:${CHAIN}:${row(2).id}`);
    });
  }
});

test("literal non-Markdown whitespace and control characters are preserved", async () => {
  const plain = row(1, {
    token0: { name: "Alpha\tBeta\nGamma\u0001", symbol: "A\tB" },
    token1: { name: "Delta\rOmega", symbol: "C\u0002D" },
  });
  const [tag] = await tagsFor([plain]);
  assert.equal(tag["Public Name Tag"], "A\tB/C\u0002D-0.3% Pool");
  assert.ok(tag["Public Note"].includes("Alpha\tBeta\nGamma\u0001/Delta\rOmega"));
});

test("feeTier requires a nonnegative safe integer written as decimal digits", async (t) => {
  const values = [undefined, null, 3000, {}, [], "", " ", "-1", "+1", "1.0", "1e3", "0x64", "NaN", "Infinity", "100junk", " 100", "100 ", "100\n", "16777216", "9007199254740991", "9007199254740992", "999999999999999999999999999999"];
  for (const value of values) {
    await t.test(JSON.stringify(value) ?? "undefined", async () => {
      await rejectedResponses(preflight(), page([row(1, { feeTier: value })]));
    });
  }
});

test("valid decimal fees include zero, uncommon tiers, leading zeros, and the uint24 maximum", async () => {
  const fees = ["0", "1", "100", "500", "3000", "10000", "2500", "0123", "16777215"];
  const tags = await tagsFor(fees.map((feeTier, index) => row(index + 1, { feeTier })));
  assert.equal(tags.length, fees.length);
  for (let index = 0; index < fees.length; index++) {
    assert.equal(tags[index]["Public Name Tag"], `A/B-${Number(fees[index]) / 10000}% Pool`);
  }
});

test("an invalid fee still fails when the same row has skipped token markup", async () => {
  await rejectedResponses(preflight(), page([row(1, {
    feeTier: "invalid",
    token0: { name: "<b>Alpha</b>", symbol: "A" },
  })]));
});

test("the 50-character name-tag budget includes the actual fee suffix", async () => {
  const fees = ["0", "1", "123", "3000", "10000", "1234567", "16777215"];
  const rows = fees.map((feeTier, index) => row(index + 1, {
    feeTier,
    token0: { name: "Long Alpha", symbol: "A".repeat(80) },
    token1: { name: "Long Beta", symbol: "B".repeat(80) },
  }));
  const tags = await tagsFor(rows);
  assert.equal(tags.length, fees.length);
  for (let index = 0; index < fees.length; index++) {
    const tag = tags[index]["Public Name Tag"];
    const suffix = `-${Number(fees[index]) / 10000}% Pool`;
    assert.ok(tag.length <= 50, `Fee ${fees[index]} produced ${tag.length} characters`);
    assert.ok(tag.endsWith(suffix));
    assert.ok(tag.slice(0, -suffix.length).endsWith("..."));
    assert.ok(tags[index]["Public Note"].includes("A".repeat(80)), "Only the public name tag is truncated");
  }
});

test("exactly fitting symbols are not truncated", async () => {
  const suffix = "-0.3% Pool";
  const symbols = "A".repeat(50 - suffix.length - 2);
  const [tag] = await tagsFor([row(1, { token0: { name: "Alpha", symbol: symbols } })]);
  assert.equal(tag["Public Name Tag"], `${symbols}/B${suffix}`);
  assert.equal(tag["Public Name Tag"].length, 50);
});

test("truncation never splits a Unicode surrogate pair", async () => {
  const [tag] = await tagsFor([row(1, {
    token0: { name: "Alpha", symbol: "🦄".repeat(30) },
    token1: { name: "Beta", symbol: "B" },
  })]);
  const name = tag["Public Name Tag"];
  assert.ok(name.length <= 50);
  assert.ok(name.endsWith("...-0.3% Pool"));
  for (const character of name) {
    const codePoint = character.codePointAt(0);
    assert.ok(codePoint < 0xd800 || codePoint > 0xdfff, "No unpaired surrogate may be emitted");
  }
  assert.ok(tag["Public Note"].includes("🦄".repeat(30)));
});

test("transport exceptions and server errors never leak credentials or logs", async () => {
  const logged = [];
  const originalConsole = new Map(["error", "warn", "log"].map((method) => [method, console[method]]));
  for (const method of originalConsole.keys()) console[method] = (...args) => { logged.push(args.join(" ")); };
  try {
    for (const stage of ["preflight", "page"]) {
      const failure = async (url, options) => { throw new Error(`${url}?secret=${KEY} ${options.headers.Authorization} PRIVATE_RESPONSE_MARKER`); };
      await rejectedResponses(...(stage === "preflight" ? [failure] : [preflight(), failure]));
    }
    await rejectedResponses(response({ errors: [{ message: `${KEY} Bearer PRIVATE_RESPONSE_MARKER` }] }));
    assert.deepEqual(logged, []);
  } finally {
    for (const [method, original] of originalConsole) console[method] = original;
  }
});

async function assertDeadline(stage, consumeBody) {
  const nativeSetTimeout = globalThis.setTimeout;
  const nativeClearTimeout = globalThis.clearTimeout;
  let deadlineCount = 0;
  let signal;
  globalThis.setTimeout = (callback, delay, ...args) => {
    if (delay === 30_000) {
      deadlineCount++;
      return nativeSetTimeout(callback, 10, ...args);
    }
    return nativeSetTimeout(callback, delay, ...args);
  };
  const hangUntilAbort = (requestSignal) => new Promise((resolve, reject) => {
    const abort = () => {
      const error = new Error(`PRIVATE_RESPONSE_MARKER ${KEY}`);
      error.name = "AbortError";
      reject(error);
    };
    if (requestSignal.aborted) abort();
    else requestSignal.addEventListener("abort", abort, { once: true });
  });
  const hangingResponse = async (url, options) => {
    signal = options.signal;
    return consumeBody ? { ok: true, json: () => hangUntilAbort(signal) } : hangUntilAbort(signal);
  };
  const responses = stage === "preflight" ? [hangingResponse] : [preflight(), hangingResponse];
  queue(...responses);
  let watchdog;
  try {
    const operation = returnTags(CHAIN, KEY);
    const boundedOperation = Promise.race([
      operation,
      new Promise((resolve, reject) => {
        watchdog = nativeSetTimeout(() => reject(new Error("Test watchdog: request did not abort")), 1000);
      }),
    ]);
    await assert.rejects(boundedOperation, (error) => {
      assertSafeError(error);
      assert.match(error.message, /timed out/i);
      return true;
    });
    assert.ok(deadlineCount >= 1, "The module must configure a 30-second deadline");
    assert.equal(signal.aborted, true);
  } finally {
    nativeClearTimeout(watchdog);
    globalThis.setTimeout = nativeSetTimeout;
  }
}

test("30-second deadlines cover both transport and JSON consumption at every stage", async (t) => {
  for (const stage of ["preflight", "page"]) {
    for (const consumeBody of [false, true]) {
      await t.test(`${stage} ${consumeBody ? "JSON body" : "network"}`, () => assertDeadline(stage, consumeBody));
    }
  }
});

test("missing credentials and unsupported chains fail before transport", async (t) => {
  for (const key of ["", "   ", null, undefined, 123]) {
    await t.test(`invalid key ${JSON.stringify(key)}`, async () => {
      const calls = queue();
      await assert.rejects(returnTags(CHAIN, key));
      assert.equal(calls.length, 0);
    });
  }
  for (const chain of ["999999", "invalid", "", "__proto__", "constructor"]) {
    await t.test(`unsupported chain ${JSON.stringify(chain)}`, async () => {
      const calls = queue();
      await assert.rejects(returnTags(chain, KEY));
      assert.equal(calls.length, 0);
    });
  }
});

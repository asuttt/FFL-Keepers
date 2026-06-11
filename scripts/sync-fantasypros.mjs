import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FANTASYPROS_PROJECTIONS_URL,
  FANTASYPROS_RANKINGS_URL,
  buildNormalizedRankings,
  fetchFantasyProsJson,
  loadEnvFile,
  normalizePlayerName,
  projectionFields,
  toCsv,
  toSourceCsv,
} from './fantasypros-sync-core.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ENV_PATH = join(ROOT, '.env');
const OUTPUT_JSON = join(ROOT, 'public', 'fantasypros-rankings-2026.json');
const OUTPUT_CSV = join(ROOT, 'public', 'fantasypros-rankings-2026.csv');
const SOURCE_JSON = join(ROOT, 'public', 'fantasypros-source-2026.json');
const SOURCE_CSV = join(ROOT, 'public', 'fantasypros-source-2026.csv');

await loadEnvFile(ENV_PATH);

const apiKey = process.env.FANTASYPROS_API_KEY;
if (!apiKey) {
  throw new Error('Missing FANTASYPROS_API_KEY in .env');
}

const rankingPayload = await fetchFantasyProsJson(FANTASYPROS_RANKINGS_URL, apiKey);
const players = Array.isArray(rankingPayload.players) ? rankingPayload.players : [];

if (!players.length) {
  throw new Error('FantasyPros returned no players');
}

const sourceDate = new Date().toISOString().slice(0, 10);
const normalized = buildNormalizedRankings(players, sourceDate);
const projectionPayload = await fetchFantasyProsJson(FANTASYPROS_PROJECTIONS_URL, apiKey);
const projectionMap = new Map(
  (Array.isArray(projectionPayload.players) ? projectionPayload.players : []).map((player) => [
    normalizePlayerName(player.name),
    player,
  ]),
);
const sourceRows = normalized.map((row) => ({
  ...row,
  ...projectionFields(projectionMap.get(normalizePlayerName(row.player)) ?? null, row.pos),
}));

await writeFile(OUTPUT_JSON, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
await writeFile(OUTPUT_CSV, toCsv(normalized), 'utf8');
await writeFile(SOURCE_JSON, `${JSON.stringify(sourceRows, null, 2)}\n`, 'utf8');
await writeFile(SOURCE_CSV, toSourceCsv(sourceRows), 'utf8');

console.log(`Wrote ${normalized.length} FantasyPros rankings to public/`);

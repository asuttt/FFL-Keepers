import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ENV_PATH = join(ROOT, '.env');
const OUTPUT_JSON = join(ROOT, 'public', 'fantasypros-rankings-2026.json');
const OUTPUT_CSV = join(ROOT, 'public', 'fantasypros-rankings-2026.csv');
const SOURCE_JSON = join(ROOT, 'public', 'fantasypros-source-2026.json');
const SOURCE_CSV = join(ROOT, 'public', 'fantasypros-source-2026.csv');
const API_URL = 'https://api.fantasypros.com/public/v2/json/nfl/2026/consensus-rankings?position=ALL&type=DRAFT&scoring=PPR&week=0';
const PROJECTIONS_URL = 'https://api.fantasypros.com/public/v2/json/nfl/2026/projections?position=ALL&week=0&scoring=PPR';

await loadEnvFile(ENV_PATH);

const apiKey = process.env.FANTASYPROS_API_KEY;
if (!apiKey) {
  throw new Error('Missing FANTASYPROS_API_KEY in .env');
}

const response = await fetch(API_URL, {
  headers: {
    'x-api-key': apiKey,
    accept: 'application/json',
  },
});

if (!response.ok) {
  throw new Error(`FantasyPros request failed (${response.status})`);
}

const payload = await response.json();
const players = Array.isArray(payload.players) ? payload.players : [];

if (!players.length) {
  throw new Error('FantasyPros returned no players');
}

const sourceDate = new Date().toISOString().slice(0, 10);
const normalized = buildNormalizedRankings(players, sourceDate);
const projections = await loadProjections(apiKey);
const projectionMap = new Map(
  projections.map((player) => [normalizePlayerName(player.name), Number(player.stats?.points_ppr ?? null)]),
);
const sourceRows = normalized.map((row) => ({
  ...row,
  pointsPpr: projectionMap.get(normalizePlayerName(row.player)) ?? null,
}));

await writeFile(OUTPUT_JSON, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
await writeFile(OUTPUT_CSV, toCsv(normalized), 'utf8');
await writeFile(SOURCE_JSON, `${JSON.stringify(sourceRows, null, 2)}\n`, 'utf8');
await writeFile(SOURCE_CSV, toSourceCsv(sourceRows), 'utf8');

console.log(`Wrote ${normalized.length} FantasyPros rankings to public/`);

function normalizePosition(value) {
  const upper = String(value ?? '').toUpperCase();
  if (upper === 'DST' || upper === 'D/ST' || upper === 'DEF') return 'D/ST';
  if (upper === 'FLEX' || upper === 'FLX') return 'RB';
  if (upper === 'QB' || upper === 'RB' || upper === 'WR' || upper === 'TE' || upper === 'K') return upper;
  return 'RB';
}

function normalizePlayerName(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizeTeam(value) {
  return String(value ?? '').trim().toUpperCase();
}

function cleanPlayerName(value) {
  return String(value ?? '').trim();
}

function buildNormalizedRankings(players, sourceDate) {
  const ordered = [...players].sort((a, b) => {
    const rankA = Number(a.rank_ecr ?? Number.POSITIVE_INFINITY);
    const rankB = Number(b.rank_ecr ?? Number.POSITIVE_INFINITY);
    if (rankA !== rankB) return rankA - rankB;
    return cleanPlayerName(a.player_name).localeCompare(cleanPlayerName(b.player_name));
  });

  const positionalCounts = new Map();

  return ordered.map((player, index) => {
    const pos = normalizePosition(player.player_position_id);
    const nextPosRank = (positionalCounts.get(pos) ?? 0) + 1;
    positionalCounts.set(pos, nextPosRank);

    return {
      keeper_rank: String(index + 1),
      source_rank: String(Number(player.rank_ecr ?? index + 1)),
      player: cleanPlayerName(player.player_name),
      team: normalizeTeam(player.player_team_id),
      pos,
      pos_rank: String(player.pos_rank ?? `${pos}${nextPosRank}`),
      source_date: sourceDate,
    };
  });
}

function escapeCsv(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows) {
  const header = ['keeper_rank', 'source_rank', 'player', 'team', 'pos', 'pos_rank', 'source_date'];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push(header.map((key) => escapeCsv(row[key])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

function toSourceCsv(rows) {
  const header = ['keeper_rank', 'source_rank', 'player', 'team', 'pos', 'pos_rank', 'pointsPpr', 'source_date'];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push(header.map((key) => escapeCsv(row[key])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

async function loadProjections(apiKey) {
  const response = await fetch(PROJECTIONS_URL, {
    headers: {
      'x-api-key': apiKey,
      accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`FantasyPros projections request failed (${response.status})`);
  }

  const payload = await response.json();
  return Array.isArray(payload.players) ? payload.players : [];
}

async function loadEnvFile(path) {
  try {
    const contents = await readFile(path, 'utf8');
    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const equalsIndex = line.indexOf('=');
      if (equalsIndex === -1) continue;
      const key = line.slice(0, equalsIndex).trim();
      let value = line.slice(equalsIndex + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return;
    }
    throw error;
  }
}

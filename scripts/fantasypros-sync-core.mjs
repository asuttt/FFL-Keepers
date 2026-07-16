import { readFile } from 'node:fs/promises';

export const FANTASYPROS_RANKINGS_URL =
  'https://api.fantasypros.com/public/v2/json/nfl/2026/consensus-rankings?position=ALL&type=DRAFT&scoring=PPR&week=0';
export const FANTASYPROS_PROJECTIONS_URL =
  'https://api.fantasypros.com/public/v2/json/nfl/2026/projections?position=ALL&week=0&scoring=PPR';

export function normalizePosition(value) {
  const upper = String(value ?? '').toUpperCase();
  if (upper === 'DST' || upper === 'D/ST' || upper === 'DEF') return 'D/ST';
  if (upper === 'FLEX' || upper === 'FLX') return 'RB';
  if (upper === 'QB' || upper === 'RB' || upper === 'WR' || upper === 'TE' || upper === 'K') return upper;
  return 'RB';
}

export function normalizePlayerName(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function normalizeTeam(value) {
  return String(value ?? '').trim().toUpperCase();
}

export function cleanPlayerName(value) {
  return String(value ?? '').trim();
}

export async function loadEnvFile(path) {
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

export async function fetchFantasyProsJson(url, apiKey) {
  const response = await fetch(url, {
    headers: {
      'x-api-key': apiKey,
      accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`FantasyPros request failed (${response.status})`);
  }

  return response.json();
}

export function buildNormalizedRankings(players, sourceDate) {
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
      player_id: player.player_id ?? null,
      player_page_url: player.player_page_url ?? null,
      player_bye_week: player.player_bye_week ?? null,
      player_owned_avg: player.player_owned_avg ?? null,
      player_owned_espn: player.player_owned_espn ?? null,
      player_owned_yahoo: player.player_owned_yahoo ?? null,
      player_ecr_delta: player.player_ecr_delta ?? null,
      rank_ave: player.rank_ave ?? null,
      rank_min: player.rank_min ?? null,
      rank_max: player.rank_max ?? null,
      rank_std: player.rank_std ?? null,
      tier: player.tier ?? null,
    };
  });
}

export function projectionFields(player, pos) {
  const stats = player?.stats ?? null;
  if (!stats) {
    return emptyProjectionFields();
  }

  const base = {
    ...emptyProjectionFields(),
    pointsPpr: Number(stats.points_ppr ?? stats.points ?? null),
  };

  if (pos === 'QB') {
    return {
      ...base,
      projectionPassYds: Number(stats.pass_yds ?? null),
      projectionPassTds: Number(stats.pass_tds ?? null),
      projectionRushAtt: Number(stats.rush_att ?? null),
      projectionRushYds: Number(stats.rush_yds ?? null),
      projectionRushTds: Number(stats.rush_tds ?? null),
    };
  }

  if (pos === 'RB') {
    return {
      ...base,
      projectionRushAtt: Number(stats.rush_att ?? null),
      projectionRushYds: Number(stats.rush_yds ?? null),
      projectionRushTds: Number(stats.rush_tds ?? null),
      projectionRecRec: Number(stats.rec_rec ?? null),
      projectionRecYds: Number(stats.rec_yds ?? null),
      projectionRecTds: Number(stats.rec_tds ?? null),
    };
  }

  if (pos === 'WR' || pos === 'TE') {
    return {
      ...base,
      projectionRecRec: Number(stats.rec_rec ?? null),
      projectionRecYds: Number(stats.rec_yds ?? null),
      projectionRecTds: Number(stats.rec_tds ?? null),
    };
  }

  if (pos === 'K') {
    return {
      ...base,
      projectionFga: Number(stats.fga ?? null),
      projectionFg: Number(stats.fg ?? null),
      projectionXpt: Number(stats.xpt ?? null),
    };
  }

  if (pos === 'D/ST') {
    return {
      ...base,
      projectionDefSack: Number(stats.def_sack ?? null),
      projectionDefInt: Number(stats.def_int ?? null),
      projectionDefTd: Number(stats.def_td ?? null),
      projectionDefSafety: Number(stats.def_safety ?? null),
      projectionDefFf: Number(stats.def_ff ?? null),
      projectionDefFr: Number(stats.def_fr ?? null),
      projectionDefRetd: Number(stats.def_retd ?? null),
    };
  }

  return base;
}

function emptyProjectionFields() {
  return {
    pointsPpr: null,
    projectionPassYds: null,
    projectionPassTds: null,
    projectionRushAtt: null,
    projectionRushYds: null,
    projectionRushTds: null,
    projectionRecRec: null,
    projectionRecYds: null,
    projectionRecTds: null,
    projectionFga: null,
    projectionFg: null,
    projectionXpt: null,
    projectionDefSack: null,
    projectionDefInt: null,
    projectionDefTd: null,
    projectionDefSafety: null,
    projectionDefFf: null,
    projectionDefFr: null,
    projectionDefRetd: null,
  };
}

export function escapeCsv(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows) {
  const header = [
    'keeper_rank',
    'source_rank',
    'player',
    'team',
    'pos',
    'pos_rank',
    'player_id',
    'player_page_url',
    'player_bye_week',
    'player_owned_avg',
    'player_owned_espn',
    'player_owned_yahoo',
    'player_ecr_delta',
    'rank_ave',
    'rank_min',
    'rank_max',
    'rank_std',
    'tier',
    'source_date',
  ];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push(header.map((key) => escapeCsv(row[key])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

export function toSourceCsv(rows) {
  const header = [
    'keeper_rank',
    'source_rank',
    'player',
    'team',
    'pos',
    'pos_rank',
    'pointsPpr',
    'player_id',
    'player_page_url',
    'player_bye_week',
    'player_owned_avg',
    'player_owned_espn',
    'player_owned_yahoo',
    'player_ecr_delta',
    'rank_ave',
    'rank_min',
    'rank_max',
    'rank_std',
    'tier',
    'projectionPassYds',
    'projectionPassTds',
    'projectionRushAtt',
    'projectionRushYds',
    'projectionRushTds',
    'projectionRecRec',
    'projectionRecYds',
    'projectionRecTds',
    'projectionFga',
    'projectionFg',
    'projectionXpt',
    'projectionDefSack',
    'projectionDefInt',
    'projectionDefTd',
    'projectionDefSafety',
    'projectionDefFf',
    'projectionDefFr',
    'projectionDefRetd',
    'source_date',
  ];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push(header.map((key) => escapeCsv(row[key])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

import {
  FANTASYPROS_PROJECTIONS_URL,
  FANTASYPROS_RANKINGS_URL,
  buildNormalizedRankings,
  fetchFantasyProsJson,
  loadEnvFile,
  normalizePlayerName,
  projectionFields,
} from '../scripts/fantasypros-sync-core.mjs';

const ROOT = process.cwd();

export default async function handler(request, response) {
  try {
    await loadEnvFile(`${ROOT}/.env`);

    const apiKey = process.env.FANTASYPROS_API_KEY;
    if (!apiKey) {
      response.status(500).json({ ok: false, error: 'Missing FANTASYPROS_API_KEY' });
      return;
    }

    const rankingPayload = await fetchFantasyProsJson(FANTASYPROS_RANKINGS_URL, apiKey);
    const players = Array.isArray(rankingPayload.players) ? rankingPayload.players : [];
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

    response.status(200).json({
      ok: true,
      sourceDate,
      rankings: normalized.length,
      sourceRows: sourceRows.length,
      note: 'Dry-run endpoint only; manual sync still writes local snapshot files',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to sync FantasyPros';
    response.status(500).json({ ok: false, error: message });
  }
}

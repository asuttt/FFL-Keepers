import { BlobPreconditionFailedError, get, put } from '@vercel/blob';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const LOCKS_PATH = 'keeper-locks.json';

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function loadDraftData() {
  return JSON.parse(await readFile(join(process.cwd(), 'public', 'draft-data.json'), 'utf8'));
}

async function readLocks() {
  const blob = await get(LOCKS_PATH, { access: 'private', useCache: false });
  if (!blob) return { locks: {}, etag: null };

  const payload = JSON.parse(await new Response(blob.stream).text());
  return { locks: payload?.locks && typeof payload.locks === 'object' ? payload.locks : {}, etag: blob.blob.etag };
}

async function writeLocks(locks, etag) {
  return put(LOCKS_PATH, JSON.stringify({ locks }, null, 2), {
    access: 'private',
    allowOverwrite: true,
    ifMatch: etag ?? undefined,
    contentType: 'application/json',
    cacheControlMaxAge: 60,
  });
}

function json(response, status, body) {
  response.status(status).setHeader('Cache-Control', 'no-store').json(body);
}

export default async function handler(request, response) {
  try {
    if (request.method === 'GET') {
      const { locks } = await readLocks();
      json(response, 200, { locks });
      return;
    }

    if (request.method !== 'POST' && request.method !== 'DELETE') {
      response.setHeader('Allow', 'GET, POST, DELETE');
      json(response, 405, { error: 'Method not allowed' });
      return;
    }

    const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body ?? {};
    const team = typeof body.team === 'string' ? body.team.trim() : '';
    const pickNumber = Number(body.pick);
    const draftData = await loadDraftData();
    const pick = draftData.picks.find((candidate) => candidate.team === team && candidate.pick === pickNumber);

    if (!pick) {
      json(response, 400, { error: 'That pick is not part of the selected team roster.' });
      return;
    }

    const current = await readLocks();
    const locks = { ...current.locks };
    const key = slugify(team);

    if (request.method === 'DELETE') {
      delete locks[key];
    } else {
      locks[key] = {
        team: pick.team,
        pick: pick.pick,
        player: pick.player,
        position: pick.pos,
        nflTeam: pick.nflTeam,
        round: pick.round,
        lockedAt: new Date().toISOString(),
      };
    }

    await writeLocks(locks, current.etag);
    json(response, 200, { locks });
  } catch (error) {
    if (error instanceof BlobPreconditionFailedError) {
      json(response, 409, { error: 'The keeper list changed. Refresh and try again.' });
      return;
    }

    const message = error instanceof Error ? error.message : 'Unable to update keeper locks';
    json(response, 500, { error: message });
  }
}

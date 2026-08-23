import { type CSSProperties, type ReactNode, createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  Copyright,
  Grid2X2,
  ChevronUp,
  Check,
  Unlock,
  RotateCcw,
  Pencil,
  Search,
  Shield,
  Sparkles,
  Lock,
} from 'lucide-react';

type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'D/ST';

type DraftPick = {
  pick: number;
  round: number;
  team: string;
  player: string;
  nflTeam: string;
  pos: Position;
};

type RankingEntry = {
  keeper_rank: string;
  source_rank: string;
  player: string;
  team: string;
  pos: Position;
  pos_rank: string;
  source_date: string;
  player_id?: number | null;
  player_square_image_url?: string | null;
  player_image_url?: string | null;
  player_page_url?: string | null;
};

type TeamSummary = {
  name: string;
  picks: number;
  avgPick: number;
  bestRound: number;
  firstPick: number;
  lastPick: number;
};

type DraftData = {
  meta: {
    source: string;
    season: number;
  };
  teams: TeamSummary[];
  picks: DraftPick[];
};

type DraftDataState = {
  data: DraftData | null;
  rankings: RankingEntry[] | null;
  rankingSource: string | null;
  sourceRows: SourceRow[] | null;
  sourceSource: string | null;
  loading: boolean;
  error: string | null;
  keeperLocks: KeeperLocks;
  refreshKeeperLocks: () => Promise<void>;
};

type KeeperLock = {
  team: string;
  pick: number;
  player: string;
  position: Position;
  nflTeam: string;
  round: number;
  lockedAt: string;
};

type KeeperLocks = Record<string, KeeperLock>;

type KeeperEvaluation = DraftPick & {
  ranking: RankingEntry | null;
  sourceRank: number | null;
  valueGain: number | null;
  keeperScore: number;
  keeperScoreRaw: number;
  projectionSurplus: number | null;
  why: string;
};

type SourceRow = RankingEntry & {
  pointsPpr: number | null;
  isFallback?: boolean;
  player_id?: number | null;
  player_square_image_url?: string | null;
  player_image_url?: string | null;
  player_page_url?: string | null;
  player_bye_week?: string | null;
  player_owned_avg?: number | null;
  player_owned_espn?: number | null;
  player_owned_yahoo?: number | null;
  player_ecr_delta?: number | null;
  rank_ave?: string | null;
  rank_min?: string | null;
  rank_max?: string | null;
  rank_std?: string | null;
  tier?: number | null;
  projectionPassYds?: number | null;
  projectionPassTds?: number | null;
  projectionRushAtt?: number | null;
  projectionRushYds?: number | null;
  projectionRushTds?: number | null;
  projectionRecRec?: number | null;
  projectionRecYds?: number | null;
  projectionRecTds?: number | null;
  projectionFga?: number | null;
  projectionFg?: number | null;
  projectionXpt?: number | null;
  projectionDefSack?: number | null;
  projectionDefInt?: number | null;
  projectionDefTd?: number | null;
  projectionDefSafety?: number | null;
  projectionDefFf?: number | null;
  projectionDefFr?: number | null;
  projectionDefRetd?: number | null;
};

type ProjectionReplacementLevel = {
  topPpr: number | null;
  replacementPpr: number | null;
};

type ProjectionReplacementLevels = Record<Position, ProjectionReplacementLevel>;

type PreviewStat = {
  label: string;
  value: string;
};

const teamColors: Record<string, string> = {
  'Bum Gaffer CM': 'amber',
  'Joe Buck Yourself': 'blue',
  'Double Ds and TDs': 'violet',
  'Bird Gang': 'green',
  Eurotrash: 'slate',
  'Fire Fury POWER': 'rose',
  'Team Phins UP': 'cyan',
  "Max's Magnificent Team": 'emerald',
  'levittown girth & tonnage': 'orange',
  'Stairway to Evans': 'indigo',
};

function FootballIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <g transform="rotate(-42 12 12)">
        <ellipse cx="12" cy="12" rx="5.5" ry="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M10 10.3h4M10 12h4M10 13.7h4M12 9.6v4.8" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" />
      </g>
    </svg>
  );
}

const DraftDataContext = createContext<DraftDataState | undefined>(undefined);

function useDraftData() {
  const context = useContext(DraftDataContext);
  if (!context) {
    throw new Error('useDraftData must be used inside DraftDataProvider');
  }
  return context;
}

function DraftDataProvider({ children }: { children: ReactNode }) {
  const [keeperLocks, setKeeperLocks] = useState<KeeperLocks>({});
  const [state, setState] = useState<DraftDataState>({
    data: null,
    rankings: null,
    rankingSource: null,
    sourceRows: null,
    sourceSource: null,
    loading: true,
    error: null,
    keeperLocks: {},
    refreshKeeperLocks: async () => {},
  });

  const refreshKeeperLocks = async () => {
    try {
      const response = await fetch('/api/keepers', { cache: 'no-store' });
      if (!response.ok) return;
      const payload = (await response.json()) as { locks?: KeeperLocks };
      setKeeperLocks(payload.locks ?? {});
    } catch {
      // Local Vite development does not serve the Vercel API; treat it as empty state.
    }
  };

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const [draftResponse, rankingSnapshot] = await Promise.all([
          fetch('/draft-data.json', { signal: controller.signal }),
          loadRankingSnapshot(controller.signal),
        ]);

        if (!draftResponse.ok) {
          throw new Error(`Failed to load draft-data.json (${draftResponse.status})`);
        }

        const draftJson = (await draftResponse.json()) as DraftData;
        const sourceSnapshot = await loadSourceSnapshot(rankingSnapshot.rankings, controller.signal);

        setState({
          data: draftJson,
          rankings: rankingSnapshot.rankings,
          rankingSource: rankingSnapshot.source,
          sourceRows: sourceSnapshot.rows,
          sourceSource: sourceSnapshot.source,
          loading: false,
          error: null,
          keeperLocks,
          refreshKeeperLocks,
        });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        const message = error instanceof Error ? error.message : 'Unable to load draft data';
        setState({ data: null, rankings: null, rankingSource: null, sourceRows: null, sourceSource: null, loading: false, error: message, keeperLocks, refreshKeeperLocks });
      }
    }

    load();
    refreshKeeperLocks();
    return () => controller.abort();
  }, []);

  return <DraftDataContext.Provider value={{ ...state, keeperLocks, refreshKeeperLocks }}>{children}</DraftDataContext.Provider>;
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function teamFromSlug(data: DraftData | null, slug?: string) {
  if (!data || !slug) {
    return null;
  }
  return data.teams.find((team) => slugify(team.name) === slug) ?? null;
}

function lockedPickForTeam(keeperLocks: KeeperLocks, team: string) {
  return keeperLocks[slugify(team)]?.pick ?? null;
}

function formatSnapshotDate(value: string | undefined) {
  if (!value) {
    return 'unknown date';
  }

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
  });
}

function normalizePlayerName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizeTeamAbbreviation(value: string) {
  return value.trim().toUpperCase();
}

function lookupKey(player: string, pos: Position, team: string) {
  return pos === 'D/ST' ? `dst:${normalizeTeamAbbreviation(team)}` : normalizePlayerName(player);
}

function playerImageUrl(row: SourceRow) {
  return row.player_square_image_url
    ?? row.player_image_url
    ?? (row.player_id ? `https://images.fantasypros.com/images/players/nfl/${row.player_id}/headshot/210x210.png` : null);
}

const fallbackEspnPlayerIds: Record<string, number> = {
  [normalizePlayerName('AJ Dillon')]: 4045163,
};

function fallbackPlayerImageUrl(pick: DraftPick) {
  const playerId = fallbackEspnPlayerIds[normalizePlayerName(pick.player)];
  return playerId ? `https://a.espncdn.com/i/headshots/nfl/players/full/${playerId}.png` : null;
}

function teamLogoUrlForAbbreviation(team: string) {
  const normalizedTeam = team.trim().toLowerCase();
  if (!normalizedTeam) return null;
  if (normalizedTeam === 'fa') return 'https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png';
  return `https://a.espncdn.com/i/teamlogos/nfl/500/${normalizedTeam}.png`;
}

function teamLogoUrl(row: SourceRow) {
  return teamLogoUrlForAbbreviation(row.team);
}

function rankingLookup(rankings: RankingEntry[] | null) {
  const lookup = new Map<string, RankingEntry>();
  for (const entry of rankings ?? []) {
    lookup.set(normalizePlayerName(entry.player), entry);
    lookup.set(lookupKey(entry.player, entry.pos, entry.team), entry);
  }
  return lookup;
}

function sourceRowLookup(sourceRows: SourceRow[] | null) {
  const lookup = new Map<string, SourceRow>();
  for (const row of sourceRows ?? []) {
    lookup.set(normalizePlayerName(row.player), row);
    lookup.set(lookupKey(row.player, row.pos, row.team), row);
  }
  return lookup;
}

function sourceRowForPick(lookup: Map<string, SourceRow>, pick: DraftPick) {
  return lookup.get(lookupKey(pick.player, pick.pos, pick.nflTeam)) ?? null;
}

function projectionReplacementLevels(sourceRows: SourceRow[] | null): ProjectionReplacementLevels {
  const replacementRanks: Record<Position, number> = {
    QB: 12,
    RB: 36,
    WR: 48,
    TE: 12,
    K: 10,
    'D/ST': 10,
  };
  const levels = {} as ProjectionReplacementLevels;

  for (const pos of Object.keys(replacementRanks) as Position[]) {
    const rows = (sourceRows ?? [])
      .filter((row) => row.pos === pos && row.pointsPpr !== null)
      .sort((a, b) => (parsePositionRank(a.pos_rank) ?? 999) - (parsePositionRank(b.pos_rank) ?? 999));
    const replacement = rows[replacementRanks[pos] - 1]?.pointsPpr ?? null;
    const top = rows[0]?.pointsPpr ?? null;
    levels[pos] = { topPpr: top, replacementPpr: replacement };
  }

  return levels;
}

function fallbackSourceRow(pick: DraftPick): SourceRow {
  return {
    keeper_rank: '',
    source_rank: '',
    player: pick.player,
    team: pick.nflTeam.toUpperCase(),
    pos: pick.pos,
    pos_rank: '',
    source_date: '',
    pointsPpr: null,
    player_image_url: fallbackPlayerImageUrl(pick),
    isFallback: true,
  };
}

function previewRowForPick(lookup: Map<string, SourceRow>, pick: DraftPick) {
  return sourceRowForPick(lookup, pick) ?? fallbackSourceRow(pick);
}

type RankingSnapshot = {
  source: string;
  rankings: RankingEntry[];
};

type SourceSnapshot = {
  source: string;
  rows: SourceRow[];
};

const rankingSources = [
  { path: '/fantasypros-rankings-2026.json', label: 'FantasyPros' },
  { path: '/espn-rankings-2026.json', label: 'ESPN' },
] as const;

const fantasyProsSourcePath = '/fantasypros-source-2026.json';

async function loadRankingSnapshot(signal: AbortSignal): Promise<RankingSnapshot> {
  const errors: string[] = [];

  for (const rankingSource of rankingSources) {
    const response = await fetch(rankingSource.path, { signal });
    if (!response.ok) {
      errors.push(`${rankingSource.path} (${response.status})`);
      continue;
    }

    const rankings = (await response.json()) as RankingEntry[];
    return { source: rankingSource.label, rankings };
  }

  throw new Error(`Failed to load rankings: ${errors.join(', ')}`);
}

function normalizeSourceRows(rankings: RankingEntry[], pointsPprByPlayer: Map<string, number | null>) {
  return rankings.map((entry) => ({
    ...entry,
    pointsPpr: pointsPprByPlayer.get(normalizePlayerName(entry.player)) ?? null,
    player_id: entry.player_id ?? null,
    player_page_url: entry.player_page_url ?? null,
    player_bye_week: null,
    player_owned_avg: null,
    player_owned_espn: null,
    player_owned_yahoo: null,
    player_ecr_delta: null,
    rank_ave: null,
    rank_min: null,
    rank_max: null,
    rank_std: null,
    tier: null,
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
  }));
}

function formatPreviewValue(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '-';
  }

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function getPreviewStats(row: SourceRow): PreviewStat[] {
  switch (row.pos) {
    case 'QB':
      return [
        { label: 'Pass yds', value: formatPreviewValue(row.projectionPassYds) },
        { label: 'Pass TDs', value: formatPreviewValue(row.projectionPassTds) },
        { label: 'Rush yds', value: formatPreviewValue(row.projectionRushYds) },
        { label: 'Rush TDs', value: formatPreviewValue(row.projectionRushTds) },
      ];
    case 'RB':
      return [
        { label: 'Carries', value: formatPreviewValue(row.projectionRushAtt) },
        { label: 'Rush yds', value: formatPreviewValue(row.projectionRushYds) },
        { label: 'Rush TDs', value: formatPreviewValue(row.projectionRushTds) },
        { label: 'Recs', value: formatPreviewValue(row.projectionRecRec) },
        { label: 'Rec yds', value: formatPreviewValue(row.projectionRecYds) },
        { label: 'Rec TDs', value: formatPreviewValue(row.projectionRecTds) },
      ];
    case 'WR':
    case 'TE':
      return [
        { label: 'Recs', value: formatPreviewValue(row.projectionRecRec) },
        { label: 'Rec yds', value: formatPreviewValue(row.projectionRecYds) },
        { label: 'Rec TDs', value: formatPreviewValue(row.projectionRecTds) },
      ];
    case 'K':
      return [
        { label: 'FG att', value: formatPreviewValue(row.projectionFga) },
        { label: 'FG made', value: formatPreviewValue(row.projectionFg) },
        { label: 'XP', value: formatPreviewValue(row.projectionXpt) },
      ];
    case 'D/ST':
      return [
        { label: 'Sacks', value: formatPreviewValue(row.projectionDefSack) },
        { label: 'INTs', value: formatPreviewValue(row.projectionDefInt) },
        { label: 'TDs', value: formatPreviewValue(row.projectionDefTd) },
        { label: 'FF', value: formatPreviewValue(row.projectionDefFf) },
        { label: 'FR', value: formatPreviewValue(row.projectionDefFr) },
      ];
    default:
      return [];
  }
}

async function loadSourceSnapshot(rankings: RankingEntry[], signal: AbortSignal): Promise<SourceSnapshot> {
  try {
    const response = await fetch(fantasyProsSourcePath, { signal });
    if (!response.ok) {
      throw new Error(`Failed to load ${fantasyProsSourcePath} (${response.status})`);
    }

    const rows = (await response.json()) as SourceRow[];
    return { source: 'FantasyPros', rows };
  } catch {
    return { source: 'FantasyPros', rows: normalizeSourceRows(rankings, new Map()) };
  }
}

function parsePositionRank(value: string) {
  const match = value.match(/(\d+)$/);
  return match ? Number(match[1]) : null;
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function keeperAnchorOpener(teamName: string) {
  const openers = [
    'Best keeper value on this roster',
    'Top keeper value on this roster',
    'Strongest keeper on this roster',
    'Best value keeper here',
    'Most attractive keeper on this roster',
  ];

  return openers[hashString(teamName) % openers.length];
}

function evaluatePick(
  pick: DraftPick,
  ranking: RankingEntry | null,
  sourceRow: SourceRow | null,
  replacementLevels: ProjectionReplacementLevels,
  rankingSource: string,
): KeeperEvaluation {
  if (!ranking) {
    return {
      ...pick,
      ranking: null,
      sourceRank: null,
      valueGain: null,
      keeperScore: 1,
      keeperScoreRaw: 1,
      projectionSurplus: null,
      why: `Not found in the 2026 ${rankingSource} rankings, so not recommended as a keeper`,
    };
  }

  const sourceRank = Number(ranking.source_rank);
  const valueGain = pick.pick - sourceRank;
  const projectionSurplus = sourceRow?.pointsPpr !== null && sourceRow?.pointsPpr !== undefined
    ? sourceRow.pointsPpr - (replacementLevels[ranking.pos].replacementPpr ?? sourceRow.pointsPpr)
    : null;
  const keeperScoreRaw = keeperStrength(valueGain, sourceRank, ranking.pos, sourceRow?.pointsPpr ?? null, replacementLevels);
  return {
    ...pick,
    ranking,
    sourceRank,
    valueGain,
    keeperScore: Math.round(keeperScoreRaw * 10) / 10,
    keeperScoreRaw,
    projectionSurplus,
    why: `Pick #${pick.pick} (Round ${pick.round}) versus #${sourceRank} overall rank`,
  };
}

function keeperStrength(
  valueGain: number,
  overallRank: number,
  pos: Position,
  pointsPpr: number | null,
  replacementLevels: ProjectionReplacementLevels,
) {
  if (valueGain <= 0) return 1;

  const surplusScore = 10 * (1 - Math.exp(-valueGain / 50));
  const assetQualityScore = rankQualityScore(overallRank);
  const scarcityScore = projectionScarcityScore(pos, pointsPpr, replacementLevels);
  let score = surplusScore * keeperScoreWeights.surplus
    + assetQualityScore * keeperScoreWeights.quality
    + scarcityScore * keeperScoreWeights.scarcity;

  if (overallRank <= 10 && valueGain >= 10) {
    score = Math.max(score, 7.5);
  }

  if (pos === 'QB' && scarcityScore === 0) {
    score = Math.min(score, 4.5);
  }

  return Math.min(10, Math.max(1, score));
}

const keeperScoreWeights = {
  surplus: 0.4,
  quality: 0.4,
  scarcity: 0.2,
} as const;

function rankQualityScore(overallRank: number) {
  if (overallRank <= 5) return 10;
  if (overallRank <= 10) return 9.5 + ((10 - overallRank) / 5) * 0.5;
  if (overallRank <= 25) return 8.8 + ((25 - overallRank) / 15) * 0.7;
  if (overallRank <= 50) return 7.8 + ((50 - overallRank) / 25) * 1;
  if (overallRank <= 100) return 6.5 + ((100 - overallRank) / 50) * 1.3;
  if (overallRank <= 150) return 5.5 + ((150 - overallRank) / 50) * 1;
  return 4.2;
}

function projectionScarcityScore(pos: Position, pointsPpr: number | null, replacementLevels: ProjectionReplacementLevels) {
  const replacementLevel = replacementLevels[pos];
  if (pointsPpr === null || replacementLevel.topPpr === null || replacementLevel.replacementPpr === null || pos === 'K' || pos === 'D/ST') {
    return 0;
  }

  const replacementGap = pointsPpr - replacementLevel.replacementPpr;
  const maxReplacementGap = Math.max(
    ...Object.entries(replacementLevels)
      .filter(([position]) => position !== 'K' && position !== 'D/ST')
      .map(([, level]) => (level.topPpr ?? 0) - (level.replacementPpr ?? 0)),
  );
  if (replacementGap <= 0 || maxReplacementGap <= 0) return 0;

  return Math.min(10, (replacementGap / maxReplacementGap) * 10);
}

function positionTone(pos: Position) {
  switch (pos) {
    case 'QB':
      return 'qb';
    case 'RB':
      return 'rb';
    case 'WR':
      return 'wr';
    case 'TE':
      return 'te';
    case 'K':
      return 'k';
    case 'D/ST':
      return 'dst';
    default:
      return 'rb';
  }
}

function scoreTone(score: number) {
  if (score >= 8.5) return 'elite';
  if (score >= 7.4) return 'strong';
  if (score >= 6.0) return 'viable';
  return 'pass';
}

function scoreToneFromValue(score: number | null) {
  if (score === null) return 'pass';
  return scoreTone(score);
}

function meterWidth(score: number | null) {
  if (score === null) return '0%';
  return `${Math.min(100, Math.max(0, score * 10))}%`;
}

function NavLink({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: typeof Grid2X2;
  label: string;
}) {
  const location = useLocation();
  const active = location.pathname === to || (to === '/' && location.pathname === '/');
  return (
    <Link
      className={cn('nav-link', active && 'nav-link-active')}
      to={to}
      onClick={() => {
        if (active) {
          window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });

          if (to === '/draft-board' && window.matchMedia('(max-width: 679px)').matches) {
            document.querySelector<HTMLElement>('.board-shell')?.scrollTo({ left: 0, behavior: 'smooth' });
          }
        }
      }}
    >
      <Icon size={16} />
      <span>{label}</span>
    </Link>
  );
}

function AppShell({ children }: { children: ReactNode }) {
  const currentYear = new Date().getFullYear();
  const location = useLocation();
  const scrollTopEnabled = location.pathname === '/' || location.pathname === '/draft-board' || location.pathname === '/source-data' || location.pathname.startsWith('/teams/');

  return (
    <div className="app-shell">
      <div className="app-header">
        <Link to="/" className="brand-lockup mobile-brand-lockup">
          <span className="brand-mark"><FootballIcon /></span>
          <span>
            <strong>2026 Classy Bois Keepers</strong>
          </span>
        </Link>
        <header className="topbar">
          <Link to="/" className="brand-lockup desktop-brand-lockup">
            <span className="brand-mark"><FootballIcon /></span>
            <span>
              <strong>2026 Classy Bois Keepers</strong>
            </span>
          </Link>

          <nav className="nav-pills" aria-label="Primary navigation">
            <NavLink to="/" icon={Grid2X2} label="Keepers" />
            <NavLink to="/draft-board" icon={CalendarDays} label="2025 Draft" />
            <NavLink to="/source-data" icon={Search} label="Data" />
          </nav>
        </header>
      </div>

      <main className="page-shell">{children}</main>

      <ScrollTopControl enabled={scrollTopEnabled} />

      <footer className="site-footer" aria-label="Site footer">
        <div className="site-footer__inner">
          <p className="site-footer__copy">
            <span className="site-footer__mark">
              <Copyright size={14} aria-hidden="true" />
              <span> {currentYear}</span>
            </span>
            <span className="site-footer__credit">
              <a className="site-footer__link" href="https://shipyard.vercel.app" target="_blank" rel="noopener">
                Shipyard
              </a>
              <span>. All rights reserved</span>
            </span>
          </p>
        </div>
      </footer>
    </div>
  );
}

function ScrollTopControl({ enabled }: { enabled: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setVisible(false);
      return;
    }

    const update = () => setVisible(window.scrollY > window.innerHeight * 0.45);
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [enabled]);

  if (!enabled) {
    return null;
  }

  return (
    <button
      className={cn('scroll-top-control', visible && 'scroll-top-control--visible')}
      type="button"
      onClick={() => window.scrollTo({ top: 0, left: 0, behavior: 'smooth' })}
      aria-label="Back to top"
    >
      <ChevronUp aria-hidden="true" />
    </button>
  );
}

function AppTitleBlock({
  title,
  description,
  chips,
}: {
  title: string;
  description: string;
  chips?: ReactNode;
}) {
  return (
    <section className="hero-card">
      <div className="hero-copy">
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="hero-badges">{chips}</div>
    </section>
  );
}

function SectionIntro({
  title,
  description,
  meta,
  mobileLeading,
}: {
  title: string;
  description: string;
  meta?: ReactNode;
  mobileLeading?: ReactNode;
}) {
  return (
    <section className="section-intro">
      <div className="section-intro__copy">
        <h1>
          {mobileLeading ? <span className="section-intro__mobile-leading">{mobileLeading}</span> : null}
          {title}
        </h1>
        <p>{description}</p>
      </div>
      {meta ? <div className="section-intro__meta">{meta}</div> : null}
    </section>
  );
}

function PositionPill({ pos, compact = false }: { pos: Position; compact?: boolean }) {
  return <span className={cn('pill', `pill--${positionTone(pos)}`, compact && 'pill--compact')}>{pos}</span>;
}

function keeperScoreTone(score: number) {
  if (score >= 8) return 'green';
  if (score >= 7) return 'lime';
  if (score >= 6) return 'amber';
  return 'low';
}

function KeeperScoreBar({ score, compact = false }: { score: number | null; compact?: boolean }) {
  if (score === null) return <span className="keeper-score-bar keeper-score-bar--blank">NR</span>;

  return (
    <div className={cn('keeper-score-bar', compact && 'keeper-score-bar--compact')}>
      <span className="keeper-score-bar__track">
        <span
          className={cn('keeper-score-bar__fill', `keeper-score-bar__fill--${keeperScoreTone(score)}`)}
          style={{ width: `${score * 10}%` }}
        />
      </span>
      <strong>{score.toFixed(1)}</strong>
    </div>
  );
}

function ValueGainPill({ value }: { value: number | null }) {
  const tone = value === null ? 'pass' : value >= 50 ? 'elite' : value >= 25 ? 'strong' : value > 0 ? 'viable' : 'pass';
  return <span className={cn('pill', `pill--${tone}`)}>{value === null ? 'NR' : `${value > 0 ? '+' : ''}${value}`}</span>;
}

function ValuePill({ value }: { value: number | null }) {
  return <span className={cn('pill', `pill--slate`)}>{value === null ? '-' : value.toFixed(1)}</span>;
}

function RankBadge({ rank }: { rank: string }) {
  return <span className="source-rank-badge" aria-hidden="true">{rank}</span>;
}

function RankValueCell({ sourceRank, teamCount }: { sourceRank: number | null; teamCount: number }) {
  if (sourceRank === null) {
    return <div className="rank-value-cell rank-value-cell--blank">-</div>;
  }

  const roundGrade = Math.ceil(sourceRank / teamCount);

  return (
    <div className="rank-value-cell rank-value-cell--current">
      <strong>{`Round ${roundGrade}`}</strong>
      <span>{`(#${sourceRank})`}</span>
    </div>
  );
}

function TeamBadge({ team }: { team: string }) {
  return <span className={cn('pill', `pill--${teamColors[team] ?? 'slate'}`)}>{team}</span>;
}

function KeeperLockIndicator({ isLocked }: { isLocked: boolean }) {
  return (
    <span className="keeper-lock-slot">
      {isLocked ? <Lock className="keeper-lock-icon" size={15} aria-label="Keeper locked" /> : null}
    </span>
  );
}

function PlayerWithSuffix({
  player,
  nflTeam,
  pos,
  compact = false,
  unranked = false,
  trailing,
}: {
  player: string;
  nflTeam: string;
  pos: Position;
  compact?: boolean;
  unranked?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <div className={cn('player-line', compact && 'player-line--compact')}>
      <div className="player-line__name">
        <span className="player-line__player">{player}{unranked ? '*' : ''}</span>
        <span className="player-line__team">{nflTeam.toUpperCase()}</span>
      </div>
      <PositionPill pos={pos} />
      {trailing ? <span className="player-line__trailing">{trailing}</span> : null}
    </div>
  );
}

function PlayerPreviewTrigger({ row, children, previewImageUrl = playerImageUrl(row) }: { row: SourceRow; children: ReactNode; previewImageUrl?: string | null }) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});

  const isMobileViewport = () => window.matchMedia('(max-width: 820px)').matches;

  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const positionPopover = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(332, viewportWidth - 24);
    const estimatedHeight = 236;
    const margin = 12;

    let left = rect.left;
    if (left + width > viewportWidth - margin) {
      left = viewportWidth - width - margin;
    }
    left = Math.max(margin, left);

    let top = rect.bottom + 12;
    if (top + estimatedHeight > viewportHeight - margin) {
      top = rect.top - estimatedHeight - 12;
    }
    top = Math.max(margin, top);

    setPopoverStyle({
      position: 'fixed',
      top,
      left,
      width,
    });
  };

  const openPopover = () => {
    clearCloseTimer();
    positionPopover();
    setOpen(true);

    if (isMobileViewport()) {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const estimatedHeight = 236;
      const margin = 16;
      const availableBottom = window.innerHeight - margin;
      const desiredBottom = rect.bottom + 12 + estimatedHeight;

      if (desiredBottom > availableBottom) {
        window.scrollBy({
          top: desiredBottom - availableBottom,
          behavior: 'smooth',
        });
      }
    }
  };

  const scheduleClose = () => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => setOpen(false), 120);
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const trigger = triggerRef.current;
      const popover = popoverRef.current;
      const target = event.target as Node | null;

      if (trigger?.contains(target) || popover?.contains(target)) {
        return;
      }

      setOpen(false);
    };

    const handleScrollOrResize = () => {
      if (isMobileViewport()) {
        positionPopover();
      } else {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [open]);

  useEffect(() => {
    return () => clearCloseTimer();
  }, []);

  const playerPopover = open && typeof document !== 'undefined'
    ? createPortal(
        <div
          ref={popoverRef}
          className="player-preview-popover"
          style={popoverStyle}
          onPointerEnter={clearCloseTimer}
          onPointerLeave={scheduleClose}
        >
          <div className="player-preview-popover__inner">
            <div className="player-preview-popover__head">
              <div className="player-preview-popover__head-left">
                {previewImageUrl ? (
                  <img
                    className={cn('player-preview-popover__image', previewImageUrl === teamLogoUrl(row) && 'player-preview-popover__image--logo')}
                    src={previewImageUrl}
                    alt=""
                  />
                ) : (
                  <div className="player-preview-popover__avatar" aria-hidden="true">
                    {row.player
                      .split(' ')
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join('')}
                  </div>
                )}
                <div className="player-preview-popover__title">
                  <strong>{row.player}</strong>
                  <div className="player-preview-popover__meta">
                    <span className="player-preview-popover__team">{row.team}</span>
                    <PositionPill pos={row.pos} compact />
                  </div>
                </div>
              </div>
              <span className="player-preview-popover__tag">{row.isFallback ? 'NR for 2026' : 'Projected'}</span>
            </div>
            <div className="player-preview-popover__metric">
              <span>PPR points</span>
              <strong>{row.isFallback ? 'N/A' : row.pointsPpr === null ? '-' : row.pointsPpr.toFixed(1)}</strong>
            </div>
            <div className="player-preview-popover__grid" role="list" aria-label={`${row.player} projections`}>
              {getPreviewStats(row).map((stat) => (
                <div className="player-preview-popover__stat" role="listitem" key={stat.label}>
                  <span>{stat.label}</span>
                  <strong>{row.isFallback && stat.value === '-' ? 'N/A' : stat.value}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="player-preview-trigger"
        aria-label={`View projections for ${row.player}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') openPopover();
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === 'mouse') scheduleClose();
        }}
        onFocus={(event) => {
          if (event.currentTarget.matches(':focus-visible')) openPopover();
        }}
        onClick={(event) => {
          event.preventDefault();
          if (open) {
            setOpen(false);
            return;
          }
          openPopover();
        }}
      >
        {children}
      </button>
      {playerPopover}
    </>
  );
}

function RecommendationCell({ rec, sourceRow, trailing }: { rec: KeeperEvaluation; sourceRow: SourceRow | null; trailing?: ReactNode }) {
  const content = <PlayerWithSuffix player={rec.player} nflTeam={rec.nflTeam} pos={rec.pos} compact trailing={trailing} />;
  const imageUrl = sourceRow ? (rec.pos === 'D/ST' ? teamLogoUrl(sourceRow) : playerImageUrl(sourceRow)) : null;
  const display = (
    <div className="keeper-rec-content">
      {imageUrl ? <img className="keeper-rec__headshot" src={imageUrl} alt="" loading="lazy" /> : null}
      {content}
    </div>
  );

  if (!sourceRow) {
    return display;
  }

  return <PlayerPreviewTrigger row={sourceRow} previewImageUrl={teamLogoUrl(sourceRow)}>{display}</PlayerPreviewTrigger>;
}

function MobileKeeperStats({ rec, teamCount }: { rec: KeeperEvaluation; teamCount: number }) {
  return (
    <div className="mobile-keeper-row__stats">
      <div><span>2025 cost</span><strong>Round {rec.round} <small>(#{rec.pick})</small></strong></div>
      <div><span>2026 value</span><RankValueCell sourceRank={rec.sourceRank} teamCount={teamCount} /></div>
      <div><span>Value gain</span><ValueGainPill value={rec.valueGain} /></div>
      <div><span>Keeper score</span><KeeperScoreBar score={rec.keeperScore} compact /></div>
    </div>
  );
}

function PlayerPreviewName({ row, compact = false, showHeadshot = false, showTeamLogo = false, displayPlayer, unranked = false, trailing }: { row: SourceRow | null; compact?: boolean; showHeadshot?: boolean; showTeamLogo?: boolean; displayPlayer?: string; unranked?: boolean; trailing?: ReactNode }) {
  if (!row) {
    return null;
  }

  const imageUrl = showHeadshot
    ? (row.isFallback ? (playerImageUrl(row) ?? teamLogoUrl(row)) : row.pos === 'D/ST' ? teamLogoUrl(row) : playerImageUrl(row))
    : null;
  const previewImageUrl = row.isFallback && row.pos !== 'D/ST' && playerImageUrl(row)
    ? playerImageUrl(row)
    : showTeamLogo
      ? teamLogoUrl(row)
      : playerImageUrl(row);
  const content = (
    <div className={cn(showHeadshot && 'keeper-rec-content')}>
      {imageUrl ? <img className="keeper-rec__headshot" src={imageUrl} alt="" loading="lazy" /> : null}
      <PlayerWithSuffix player={displayPlayer ?? row.player} nflTeam={row.team} pos={row.pos} compact={compact} unranked={unranked} trailing={trailing} />
    </div>
  );
  return <PlayerPreviewTrigger row={row} previewImageUrl={previewImageUrl}>{content}</PlayerPreviewTrigger>;
}

function evaluateTeam(
  team: string,
  picks: DraftPick[],
  rankings: Map<string, RankingEntry>,
  sourceRowsByPick: Map<string, SourceRow>,
  replacementLevels: ProjectionReplacementLevels,
  rankingSource: string,
) {
  return picks
    .filter((pick) => pick.team === team)
    .map((pick) => evaluatePick(
      pick,
      rankings.get(lookupKey(pick.player, pick.pos, pick.nflTeam)) ?? null,
      sourceRowForPick(sourceRowsByPick, pick),
      replacementLevels,
      rankingSource,
    ))
    .sort((a, b) => {
      const unrankedDifference = Number(a.ranking === null) - Number(b.ranking === null);
      if (unrankedDifference !== 0) return unrankedDifference;

      const displayedScoreDifference = Math.round(b.keeperScore * 10) - Math.round(a.keeperScore * 10);
      if (displayedScoreDifference !== 0) return displayedScoreDifference;

      const overallRankDifference = (a.sourceRank ?? 9999) - (b.sourceRank ?? 9999);
      if (overallRankDifference !== 0) return overallRankDifference;

      const projectionDifference = (b.projectionSurplus ?? -9999) - (a.projectionSurplus ?? -9999);
      if (projectionDifference !== 0) return projectionDifference;

      const quarterbackDifference = Number(a.pos === 'QB') - Number(b.pos === 'QB');
      if (quarterbackDifference !== 0) return quarterbackDifference;

      const rawScoreDifference = b.keeperScoreRaw - a.keeperScoreRaw;
      if (Math.abs(rawScoreDifference) > 0.05) return rawScoreDifference;

      return (b.valueGain ?? -9999) - (a.valueGain ?? -9999);
    });
}

function bestKeeperForTeam(
  team: string,
  picks: DraftPick[],
  rankings: Map<string, RankingEntry>,
  sourceRowsByPick: Map<string, SourceRow>,
  replacementLevels: ProjectionReplacementLevels,
  rankingSource: string,
) {
  return evaluateTeam(team, picks, rankings, sourceRowsByPick, replacementLevels, rankingSource).find((pick) => pick.ranking !== null) ?? null;
}

function selectedKeeperForTeam(
  team: string,
  picks: DraftPick[],
  rankings: Map<string, RankingEntry>,
  sourceRowsByPick: Map<string, SourceRow>,
  replacementLevels: ProjectionReplacementLevels,
  rankingSource: string,
  keeperLocks: KeeperLocks,
) {
  const rankedPicks = evaluateTeam(team, picks, rankings, sourceRowsByPick, replacementLevels, rankingSource);
  const lockedPick = lockedPickForTeam(keeperLocks, team);
  return rankedPicks.find((pick) => pick.pick === lockedPick)
    ?? rankedPicks.find((pick) => pick.ranking !== null)
    ?? null;
}

function DashboardTable({
  rows,
  sourceRows,
  teamCount,
  keeperLocks,
}: {
  rows: KeeperEvaluation[];
  sourceRows: SourceRow[] | null;
  teamCount: number;
  keeperLocks: KeeperLocks;
}) {
  const sourceRowsByPick = useMemo(() => sourceRowLookup(sourceRows), [sourceRows]);

  return (
    <>
      <div className="table-shell table-shell--keeper">
        <table className="keeper-table keeper-table--league">
        <thead>
          <tr>
            <th>Team</th>
            <th>Keeper</th>
            <th>2025 cost</th>
            <th>2026 value</th>
            <th>Value gain</th>
            <th>Keeper score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((rec) => {
            const isLocked = lockedPickForTeam(keeperLocks, rec.team) === rec.pick;
            return (
              <tr key={rec.team} className="keeper-table__row">
                <td className="keeper-table__team">
                  <Link className="keeper-table__team-link" to={`/teams/${slugify(rec.team)}`}>
                    <span className="keeper-table__team-name">{rec.team}</span>
                    <ChevronRight size={16} />
                  </Link>
                </td>
                <td className="keeper-table__rec">
                  <div className="keeper-table__rec-inner">
                    <RecommendationCell
                      rec={rec}
                      sourceRow={sourceRowForPick(sourceRowsByPick, rec)}
                      trailing={<KeeperLockIndicator isLocked={isLocked} />}
                    />
                  </div>
                </td>
                <td className="keeper-table__round">Round {rec.round} <span>(#{rec.pick})</span></td>
                <td className="keeper-table__value">
                  <RankValueCell sourceRank={rec.sourceRank} teamCount={teamCount} />
                </td>
                <td className="keeper-table__score">
                  <ValueGainPill value={rec.valueGain} />
                </td>
                <td className="keeper-table__score">
                  <KeeperScoreBar score={rec.keeperScore} compact />
                </td>
              </tr>
            );
          })}
        </tbody>
        </table>
      </div>
      <div className="mobile-keeper-list">
        {rows.map((rec) => {
          const isLocked = lockedPickForTeam(keeperLocks, rec.team) === rec.pick;
          return (
            <article className="mobile-keeper-row" key={rec.team}>
              <Link className="mobile-keeper-row__team" to={`/teams/${slugify(rec.team)}`}>
                <strong>{rec.team}</strong>
                <ChevronRight size={16} />
              </Link>
              <div className="mobile-keeper-row__player">
                <RecommendationCell
                  rec={rec}
                  sourceRow={sourceRowForPick(sourceRowsByPick, rec)}
                  trailing={<KeeperLockIndicator isLocked={isLocked} />}
                />
              </div>
              <MobileKeeperStats rec={rec} teamCount={teamCount} />
            </article>
          );
        })}
      </div>
    </>
  );
}

function DashboardPage() {
  const { data, rankings, rankingSource, sourceRows, keeperLocks, loading, error } = useDraftData();

  if (loading) {
    return (
      <div className="page-stack">
        <AppTitleBlock
          title="Loading your league board..."
          description="We are pulling the draft dataset into the first draft of the dashboard."
          chips={
            <>
              <span className="status-chip status-chip--soft">
                <Sparkles size={14} />
                Placeholder recs
              </span>
              <span className="status-chip status-chip--soft">
                <Shield size={14} />
                Dark theme
              </span>
            </>
          }
        />
        <div className="skeleton-card" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="page-stack">
        <AppTitleBlock
          title="We could not load the data."
          description={error ?? 'Unknown error'}
          chips={
            <span className="status-chip status-chip--soft">
              <Shield size={14} />
              Data unavailable
            </span>
          }
        />
      </div>
    );
  }

  const rankingMap = rankingLookup(rankings);
  const sourceRowsByPick = sourceRowLookup(sourceRows);
  const replacementLevels = projectionReplacementLevels(sourceRows);
  const sourceLabel = rankingSource ?? 'current rankings';
  const snapshotDate = formatSnapshotDate(sourceRows?.[0]?.source_date);
  const recs = data.teams
    .map((team) => selectedKeeperForTeam(team.name, data.picks, rankingMap, sourceRowsByPick, replacementLevels, sourceLabel, keeperLocks))
    .filter(Boolean) as KeeperEvaluation[];

  return (
    <div className="page-stack">
      <SectionIntro
        title="2026 Keeper Recs"
        description={`Select team for full breakdown. Data as of ${snapshotDate}`}
      />
      <DashboardTable rows={recs} sourceRows={sourceRows} teamCount={data.teams.length} keeperLocks={keeperLocks} />
    </div>
  );
}

function TeamPage() {
  const { data, rankings, rankingSource, sourceRows, keeperLocks, refreshKeeperLocks, loading, error } = useDraftData();
  const params = useParams();
  const navigate = useNavigate();
  const sourceRowsByPick = useMemo(() => sourceRowLookup(sourceRows), [sourceRows]);
  const [lockMode, setLockMode] = useState(false);
  const [pendingPick, setPendingPick] = useState<number | null>(null);
  const [savingLock, setSavingLock] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);
  const [contentRefresh, setContentRefresh] = useState(false);

  if (loading) {
    return <LoadingPanel title="Loading team drilldown..." />;
  }

  if (error || !data) {
    return <ErrorPanel message={error ?? 'Unknown error'} />;
  }

  const team = teamFromSlug(data, params.teamId);

  if (!team) {
    return <Navigate to="/" replace />;
  }

  const rankingMap = rankingLookup(rankings);
  const replacementLevels = projectionReplacementLevels(sourceRows);
  const sourceLabel = rankingSource ?? 'current rankings';
  const rankedPicks = evaluateTeam(team.name, data.picks, rankingMap, sourceRowsByPick, replacementLevels, sourceLabel);
  const lockedPick = lockedPickForTeam(keeperLocks, team.name);
  const recommendation = rankedPicks.find((pick) => pick.pick === lockedPick)
    ?? rankedPicks.find((pick) => pick.ranking !== null)
    ?? null;
  const pendingRecommendation = rankedPicks.find((pick) => pick.pick === pendingPick) ?? null;
  const anchorOpener = recommendation ? keeperAnchorOpener(team.name) : null;

  const enterLockMode = () => {
    setLockError(null);
    setPendingPick(lockedPick);
    setLockMode(true);
  };

  const cancelLockMode = () => {
    setLockError(null);
    setPendingPick(null);
    setLockMode(false);
  };

  const confirmKeeper = async () => {
    if (!pendingRecommendation) return;
    setSavingLock(true);
    setLockError(null);
    try {
      const response = await fetch('/api/keepers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team: team.name, pick: pendingRecommendation.pick }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Unable to lock keeper');
      await refreshKeeperLocks();
      setContentRefresh(true);
      window.setTimeout(() => setContentRefresh(false), 420);
      setLockMode(false);
      setPendingPick(null);
    } catch (error) {
      setLockError(error instanceof Error ? error.message : 'Unable to lock keeper');
    } finally {
      setSavingLock(false);
    }
  };

  const resetKeeper = async () => {
    if (lockedPick === null) return;
    setSavingLock(true);
    setLockError(null);
    try {
      const response = await fetch('/api/keepers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team: team.name, pick: lockedPick }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Unable to restore recommendation');
      await refreshKeeperLocks();
      setContentRefresh(true);
      window.setTimeout(() => setContentRefresh(false), 420);
      setLockMode(false);
      setPendingPick(null);
    } catch (error) {
      setLockError(error instanceof Error ? error.message : 'Unable to restore recommendation');
    } finally {
      setSavingLock(false);
    }
  };

  return (
    <div className="page-stack">
      <SectionIntro
        title={team.name}
        description="Last year's roster sorted by keeper value"
        mobileLeading={
          <button className="team-back-link team-back-link--mobile" type="button" onClick={() => navigate('/')} aria-label="Back to keeper recommendations">
            <ArrowLeft size={18} />
          </button>
        }
        meta={
          <button className="text-link team-back-link team-back-link--desktop" type="button" onClick={() => navigate('/')}>
            <ArrowLeft size={16} />
            Back
          </button>
        }
      />

      <section className={cn('panel', 'team-spotlight', contentRefresh && 'content-refresh-fade')}>
        <div className="spotlight-copy">
          <div className="team-card__eyebrow spotlight-copy__eyebrow">Top keeper anchor</div>
          {recommendation ? (
            <PlayerPreviewName row={sourceRowForPick(sourceRowsByPick, recommendation)} compact showHeadshot showTeamLogo displayPlayer={recommendation.pos === 'D/ST' ? recommendation.player : undefined} />
          ) : (
            <h2>No ranked keeper yet</h2>
          )}
          <p>{recommendation && anchorOpener ? <>{anchorOpener}: {recommendation.why}</> : 'No recommendation available yet'}</p>
        </div>
        <div className="meter-card">
          <div className="meter-card__head">
            <div className="meter-card__label">Keeper score</div>
            <div className="meter-card__score">
              <KeeperScoreBar score={recommendation?.keeperScore ?? null} />
            </div>
            <button
              className={cn('keeper-lock-cta', lockedPick !== null && 'keeper-lock-cta--locked', lockMode && 'keeper-lock-cta--editing')}
              type="button"
              onClick={lockMode ? cancelLockMode : enterLockMode}
              aria-label={lockMode ? 'Exit keeper edit mode' : lockedPick !== null ? 'Edit locked keeper' : 'Choose keeper'}
              title={lockMode ? 'Exit keeper edit mode' : lockedPick !== null ? 'Edit locked keeper' : 'Choose keeper'}
            >
              {lockMode || lockedPick === null ? <Pencil size={16} /> : <Lock size={16} />}
            </button>
            {lockMode && lockedPick !== null ? (
              <button
                className="keeper-lock-reset"
                type="button"
                onClick={resetKeeper}
                disabled={savingLock}
                aria-label="Use recommended keeper"
                title="Use recommended keeper"
              >
                <RotateCcw size={15} />
              </button>
            ) : null}
          </div>
          <small>Adjusted for overall tier and positional replacement value</small>
        </div>
      </section>

      <section className={cn('panel', 'table-panel', 'table-panel--drilldown', contentRefresh && 'content-refresh-fade')}>
        <div className="panel-head panel-head--stacked panel-head--source">
          <div>
            <div className="team-card__eyebrow">Keeper Rankings</div>
          </div>
          <span className="status-chip status-chip--soft">Sorted by keeper score</span>
        </div>

        <div className="table-shell table-shell--keeper">
          <table className="keeper-table keeper-table--drilldown">
            <thead>
              <tr>
                <th>Player</th>
                <th>2025 Cost</th>
                <th>2026 Value</th>
                <th>Value gain</th>
                <th>Keeper score</th>
              </tr>
            </thead>
            <tbody>
              {rankedPicks.map((rec) => {
                const isRecommendation = recommendation?.pick === rec.pick;
                const isLocked = lockedPick === rec.pick;
                  const isPending = pendingPick === rec.pick;
                return (
                  <tr key={rec.pick} className={cn('keeper-table__row', isRecommendation && 'keeper-table__row--highlight', isLocked && 'keeper-table__row--locked', isPending && 'keeper-table__row--pending')}>
                    <td className="keeper-table__player">
                      <div className="keeper-candidate-control">
                        <PlayerPreviewName
                          row={previewRowForPick(sourceRowsByPick, rec)}
                          compact
                          showHeadshot
                          showTeamLogo
                          displayPlayer={rec.pos === 'D/ST' ? rec.player : undefined}
                          unranked={rec.ranking === null}
                        />
                        {lockMode ? (
                          <button className={cn('keeper-lock-select', isPending && 'keeper-lock-select--selected')} type="button" onClick={isPending ? confirmKeeper : () => setPendingPick(rec.pick)} aria-pressed={isPending} aria-label={isPending ? `Save ${rec.player} as keeper` : `Select ${rec.player} as keeper`} title={isPending ? 'Save keeper' : 'Select keeper'} disabled={isPending && savingLock}>
                            {isPending ? <><Check size={14} /><span>Save</span></> : <Unlock size={14} />}
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td className="keeper-table__round">Round {rec.round} <span>(#{rec.pick})</span></td>
                    <td className="keeper-table__value">
                      <RankValueCell sourceRank={rec.sourceRank} teamCount={data.teams.length} />
                    </td>
                    <td className="keeper-table__score">
                      <ValueGainPill value={rec.valueGain} />
                    </td>
                    <td className="keeper-table__score">
                      <KeeperScoreBar score={rec.keeperScore} compact />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mobile-keeper-list mobile-keeper-list--drilldown">
          {rankedPicks.map((rec) => {
            const isRecommendation = recommendation?.pick === rec.pick;
            const isLocked = lockedPick === rec.pick;
            const isPending = pendingPick === rec.pick;
            return (
              <article className={cn('mobile-keeper-row', isRecommendation && 'mobile-keeper-row--highlight', isLocked && 'mobile-keeper-row--locked', isPending && 'mobile-keeper-row--pending')} key={rec.pick}>
                <div className="mobile-keeper-row__player">
                  <div className="keeper-candidate-control">
                    <PlayerPreviewName
                      row={previewRowForPick(sourceRowsByPick, rec)}
                      compact
                      showHeadshot
                      showTeamLogo
                      displayPlayer={rec.pos === 'D/ST' ? rec.player : undefined}
                      unranked={rec.ranking === null}
                      trailing={isLocked ? <Lock className="keeper-lock-icon" size={15} aria-label="Keeper locked" /> : null}
                    />
                    {lockMode ? (
                      <button className={cn('keeper-lock-select', isPending && 'keeper-lock-select--selected')} type="button" onClick={isPending ? confirmKeeper : () => setPendingPick(rec.pick)} aria-pressed={isPending} aria-label={isPending ? `Save ${rec.player} as keeper` : `Select ${rec.player} as keeper`} title={isPending ? 'Save keeper' : 'Select keeper'} disabled={isPending && savingLock}>
                        {isPending ? <><Check size={14} /><span>Save</span></> : <Unlock size={14} />}
                      </button>
                    ) : null}
                  </div>
                </div>
                <MobileKeeperStats rec={rec} teamCount={data.teams.length} />
              </article>
            );
          })}
        </div>
        {lockError ? <p className="keeper-lock-error" role="alert">{lockError}</p> : null}
      </section>
      {rankedPicks.some((rec) => rec.ranking === null) ? (
        <p className="keeper-table__note">*Player not included in current FantasyPros rankings. Keeper score defaults to 1.0; value gain is NR</p>
      ) : null}
    </div>
  );
}

function LoadingPanel({ title }: { title: string }) {
  return (
    <div className="page-stack">
      <AppTitleBlock title={title} description="Pulling the draft dataset." />
      <div className="skeleton-card" />
    </div>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="page-stack">
      <AppTitleBlock title="Something broke while loading." description={message} />
    </div>
  );
}

function DraftBoardPage() {
  const { data, rankings, rankingSource, sourceRows, loading, error } = useDraftData();
  const boardShellRef = useRef<HTMLDivElement>(null);
  const boardHeaderAnchorRef = useRef<HTMLDivElement>(null);
  const boardHeaderRef = useRef<HTMLDivElement>(null);
  const boardHeaderPinnedRef = useRef(false);

  useEffect(() => {
    const updateBoardHeader = () => {
      const shell = boardShellRef.current;
      const anchor = boardHeaderAnchorRef.current;
      const header = boardHeaderRef.current;
      const nav = document.querySelector<HTMLElement>('.topbar');
      if (!shell || !anchor || !header || !nav) return;

      const desktop = window.matchMedia('(min-width: 980px)').matches;
      const shellRect = shell.getBoundingClientRect();
      const anchorRect = anchor.getBoundingClientRect();
      const navRect = nav.getBoundingClientRect();
      const headerHeight = header.offsetHeight;
      const shouldPin = desktop && anchorRect.top <= navRect.bottom + 8 && shellRect.bottom > navRect.bottom + headerHeight;

      if (shouldPin) {
        header.classList.add('board-header--pinned');
        header.style.position = 'fixed';
        header.style.top = `${navRect.bottom + 8}px`;
        header.style.left = `${shellRect.left}px`;
        header.style.width = `${shell.clientWidth}px`;
        header.style.transform = `translateX(${-shell.scrollLeft}px)`;
        anchor.style.height = `${headerHeight + 14}px`;
      } else {
        header.classList.remove('board-header--pinned');
        header.style.position = 'relative';
        header.style.top = '';
        header.style.left = '';
        header.style.width = '';
        header.style.transform = '';
        anchor.style.height = '';
      }

      if (boardHeaderPinnedRef.current !== shouldPin) {
        boardHeaderPinnedRef.current = shouldPin;
      }
    };

    updateBoardHeader();
    window.addEventListener('scroll', updateBoardHeader, { passive: true });
    window.addEventListener('resize', updateBoardHeader);
    const shell = boardShellRef.current;
    shell?.addEventListener('scroll', updateBoardHeader, { passive: true });
    return () => {
      window.removeEventListener('scroll', updateBoardHeader);
      window.removeEventListener('resize', updateBoardHeader);
      shell?.removeEventListener('scroll', updateBoardHeader);
    };
  }, [data, loading]);

  if (loading) {
    return <LoadingPanel title="Loading draft board..." />;
  }

  if (error || !data) {
    return <ErrorPanel message={error ?? 'Unknown error'} />;
  }

  const byRound = Array.from({ length: 15 }, (_, index) =>
    data.picks.filter((pick) => pick.round === index + 1),
  );
  const snakeRows = byRound.map((roundPicks, index) => (index % 2 === 0 ? roundPicks : [...roundPicks].reverse()));
  const draftOrderTeams = [...byRound[0]].sort((a, b) => a.pick - b.pick);
  const rankingMap = rankingLookup(rankings);
  const sourceRowsByPick = sourceRowLookup(sourceRows);
  const replacementLevels = projectionReplacementLevels(sourceRows);
  const sourceLabel = rankingSource ?? 'current rankings';
  const recs = new Set(
    data.teams
      .map((team) => bestKeeperForTeam(team.name, data.picks, rankingMap, sourceRowsByPick, replacementLevels, sourceLabel)?.pick)
      .filter((pick): pick is number => typeof pick === 'number'),
  );

  return (
    <div className="page-stack">
      <SectionIntro
        title="2025 Draft Board"
        description="Baseline cost for each keeper recommendation"
      />

      <section className="panel board-panel">
        <div className="panel-head">
          <div className="team-card__eyebrow">Classy Bois 2025 Draft</div>
          <span className="status-chip status-chip--soft">PPR; Snake format</span>
        </div>

        <div className="board-shell" ref={boardShellRef}>
          <div className="board-grid" role="table" aria-label="Draft board snake view">
            <div
              className="board-header-anchor"
              ref={boardHeaderAnchorRef}
            >
              <div className="board-header" ref={boardHeaderRef} role="row">
                {draftOrderTeams.map((pick, index) => (
                  <div className="board-header__team" key={pick.pick} role="columnheader">
                    <span className="board-header__slot">{index + 1}</span>
                    <strong>{pick.team}</strong>
                  </div>
                ))}
              </div>
            </div>
            {snakeRows.map((roundPicks, index) => (
              <div className="board-row" role="row" key={index}>
                {roundPicks.map((pick, colIndex) => {
                  const isTempRec = recs.has(pick.pick);
                  const selection = index % 2 === 0 ? colIndex + 1 : draftOrderTeams.length - colIndex;
                  return (
                    <article
                      className={cn('board-card', `board-card--${positionTone(pick.pos)}`, isTempRec && 'board-card--keeper')}
                      key={pick.pick}
                      role="cell"
                    >
                      <img
                        className="board-card__team-logo"
                        src={teamLogoUrlForAbbreviation(pick.nflTeam) ?? undefined}
                        alt=""
                        aria-hidden="true"
                        loading="lazy"
                      />
                      <div className="board-card__top">
                        <span className="board-card__pick">{`${index + 1}.${selection}`}</span>
                      </div>
                      <div className="board-card__player">{pick.player}</div>
                      <div className="board-card__meta board-card__meta--inline">
                        <span className={cn('board-card__badge', `board-card__badge--${positionTone(pick.pos)}`)}>{pick.pos}</span>
                        <span>{pick.nflTeam.toUpperCase()}</span>
                      </div>
                    </article>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function SourceDataPage() {
  const { sourceRows, sourceSource, loading, error } = useDraftData();
  const [search, setSearch] = useState('');
  const [positionFilter, setPositionFilter] = useState<Position | 'all'>('all');
  const [teamFilter, setTeamFilter] = useState('all');

  if (loading) {
    return <LoadingPanel title="Loading source data..." />;
  }

  if (error || !sourceRows) {
    return <ErrorPanel message={error ?? 'Unknown error'} />;
  }

  const sourceLabel = sourceSource ?? 'FantasyPros';
  const snapshotDate = formatSnapshotDate(sourceRows[0]?.source_date);
  const rankedRows = sourceRows.slice(0, 300);
  const teamOptions = Array.from(new Set(rankedRows.map((row) => row.team))).sort((a, b) => a.localeCompare(b));
  const query = search.trim().toLowerCase();
  const matchesFilters = (row: SourceRow) => {
    const matchesPlayer = !query || row.player.toLowerCase().includes(query);
    const matchesPosition = positionFilter === 'all' || row.pos === positionFilter;
    const matchesTeam = teamFilter === 'all' || row.team === teamFilter;
    return matchesPlayer && matchesPosition && matchesTeam;
  };
  const sourceColumns = Array.from({ length: 3 }, (_, index) => rankedRows.slice(index * 100, (index + 1) * 100).filter(matchesFilters));
  const maxColumnRows = Math.max(...sourceColumns.map((rows) => rows.length), 0);

  return (
    <div className="page-stack">
      <SectionIntro
        title="FantasyPros Data"
        description={`Projected PPR Points and Rankings as of ${snapshotDate}`}
      />

      <section className="panel table-panel">
        <div className="panel-head panel-head--stacked panel-head--source">
          <div>
            <div className="team-card__eyebrow">Top 300</div>
          </div>
          <span className="status-chip status-chip--soft">{sourceLabel} PPR</span>
        </div>

        <div className="source-filter-row">
          <label className="search-field search-field--table">
            <Search size={16} />
            <span className="sr-only">Search players</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search players..." />
          </label>
          <label className="filter-select">
            <span className="sr-only">Filter by position</span>
            <select value={positionFilter} onChange={(event) => setPositionFilter(event.target.value as Position | 'all')}>
              <option value="all">All positions</option>
              {(['QB', 'RB', 'WR', 'TE', 'K', 'D/ST'] as Position[]).map((position) => (
                <option key={position} value={position}>{position}</option>
              ))}
            </select>
          </label>
          <label className="filter-select">
            <span className="sr-only">Filter by team</span>
            <select value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)}>
              <option value="all">All teams</option>
              {teamOptions.map((team) => <option key={team} value={team}>{team}</option>)}
            </select>
          </label>
        </div>

        <div className="source-columns">
          {sourceColumns.map((rows, columnIndex) => (
            <section className="source-column" key={columnIndex}>
              <div className="source-column__head">
                <strong>Ranks {columnIndex * 100 + 1}-{Math.min((columnIndex + 1) * 100, rankedRows.length)}</strong>
              </div>
              <div className="table-shell table-shell--source">
                <table className="keeper-table keeper-table--source">
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>PPR</th>
                      <th>Pos Rank</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={`${row.keeper_rank}-${row.player}`} className="keeper-table__row">
                        <td className="keeper-table__player source-player-cell">
                          <RankBadge rank={row.keeper_rank} />
                          <PlayerPreviewName row={row} compact showTeamLogo={row.pos === 'D/ST'} />
                        </td>
                        <td className="keeper-table__points">
                          <ValuePill value={row.pointsPpr} />
                        </td>
                        <td className="keeper-table__pos-rank">{row.pos_rank}</td>
                      </tr>
                    ))}
                    {Array.from({ length: maxColumnRows - rows.length }, (_, blankIndex) => (
                      <tr key={`blank-${columnIndex}-${blankIndex}`} className="source-blank-row" aria-hidden="true">
                        <td colSpan={3}>&nbsp;</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}

function AppRoutes() {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = '2026 Classy Bois Keepers';
  }, [location.pathname]);

  return (
    <AppShell>
      <div className="route-transition" key={location.pathname}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/teams/:teamId" element={<TeamPage />} />
          <Route path="/draft-board" element={<DraftBoardPage />} />
          <Route path="/source-data" element={<SourceDataPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </AppShell>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <DraftDataProvider>
        <AppRoutes />
      </DraftDataProvider>
    </BrowserRouter>
  );
}

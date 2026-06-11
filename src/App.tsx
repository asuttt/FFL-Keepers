import { type ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  Copyright,
  Grid2X2,
  Search,
  Shield,
  Sparkles,
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
};

type KeeperEvaluation = DraftPick & {
  ranking: RankingEntry | null;
  sourceRank: number | null;
  sourceTier: number | null;
  keeperScore: number;
  keeperCost: number;
  keeperValue: number | null;
  keeperCostValue: number;
  sourceValue: number | null;
  why: string;
};

type SourceRow = RankingEntry & {
  pointsPpr: number | null;
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

const DraftDataContext = createContext<DraftDataState | undefined>(undefined);

function useDraftData() {
  const context = useContext(DraftDataContext);
  if (!context) {
    throw new Error('useDraftData must be used inside DraftDataProvider');
  }
  return context;
}

function DraftDataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DraftDataState>({
    data: null,
    rankings: null,
    rankingSource: null,
    sourceRows: null,
    sourceSource: null,
    loading: true,
    error: null,
  });

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
        });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        const message = error instanceof Error ? error.message : 'Unable to load draft data';
        setState({ data: null, rankings: null, rankingSource: null, sourceRows: null, sourceSource: null, loading: false, error: message });
      }
    }

    load();
    return () => controller.abort();
  }, []);

  return <DraftDataContext.Provider value={state}>{children}</DraftDataContext.Provider>;
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

function rankingLookup(rankings: RankingEntry[] | null) {
  return new Map((rankings ?? []).map((entry) => [normalizePlayerName(entry.player), entry]));
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
    player_id: null,
    player_square_image_url: null,
    player_image_url: null,
    player_page_url: null,
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

function evaluatePick(pick: DraftPick, ranking: RankingEntry | null, rankingSource: string): KeeperEvaluation {
  if (!ranking) {
    return {
      ...pick,
      ranking: null,
      sourceRank: null,
      sourceTier: null,
      keeperScore: 1,
      keeperValue: null,
      keeperCostValue: draftValueScore(pick.round),
      keeperCost: pick.round,
      sourceValue: null,
      why: `Not found in the 2026 ${rankingSource} rankings, so not recommended as a keeper`,
    };
  }

  const sourceRank = Number(ranking.source_rank);
  const sourceTier = Math.ceil(sourceRank / 10);
  const sourceValue = rankValueScore(sourceRank);
  const keeperCostValue = draftValueScore(pick.round);
  const positionValue = scarcityValue(ranking.pos, ranking.pos_rank);
  const positionRank = parsePositionRank(ranking.pos_rank) ?? 999;
  let keeperScore = sourceValue * 0.45 + keeperCostValue * 0.35 + positionValue * 0.2;

  if (ranking.pos === 'QB' && positionRank > 5) {
    keeperScore = Math.min(keeperScore, 3.5);
  }
  if (ranking.pos === 'TE' && positionRank > 5) {
    keeperScore = Math.min(keeperScore, 5.8);
  }
  if (ranking.pos === 'K' || ranking.pos === 'D/ST') {
    keeperScore = Math.min(keeperScore, 2.5);
  }

  keeperScore = clampScore(keeperScore);
  return {
    ...pick,
    ranking,
    sourceRank,
    sourceTier,
    keeperScore,
    keeperCost: pick.round,
    keeperValue: sourceValue,
    keeperCostValue,
    sourceValue,
    why: `Round ${pick.round} cost versus #${sourceRank} overall rank`,
  };
}

function clampScore(value: number) {
  return Math.min(10, Math.max(1, Math.round(value * 10) / 10));
}

function rankValueScore(sourceRank: number) {
  return 10 - ((sourceRank - 1) / 159) * 9;
}

function draftValueScore(round: number) {
  return ((round - 1) / 14) * 9 + 1;
}

function scarcityValue(pos: Position, posRank: string) {
  const positionRank = parsePositionRank(posRank) ?? 999;
  switch (pos) {
    case 'RB':
      return positionRank <= 12 ? 9.6 : positionRank <= 24 ? 9.1 : 8.4;
    case 'WR':
      return positionRank <= 12 ? 9.0 : positionRank <= 24 ? 8.4 : 7.7;
    case 'TE':
      return positionRank <= 5 ? 9.7 : positionRank <= 10 ? 8.6 : 7.0;
    case 'QB':
      return positionRank <= 5 ? 8.6 : 4.0;
    case 'K':
      return 2.1;
    case 'D/ST':
      return 2.0;
    default:
      return 6.0;
  }
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
    <Link className={cn('nav-link', active && 'nav-link-active')} to={to}>
      <Icon size={16} />
      <span>{label}</span>
    </Link>
  );
}

function AppShell({ children }: { children: ReactNode }) {
  const currentYear = new Date().getFullYear();

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand-lockup">
          <span className="brand-mark">FFL</span>
          <span>
            <strong>Classy Bois 2026 Keepers</strong>
          </span>
        </Link>

        <nav className="nav-pills" aria-label="Primary navigation">
          <NavLink to="/" icon={Grid2X2} label="Keepers" />
          <NavLink to="/draft-board" icon={CalendarDays} label="2025 Draft" />
          <NavLink to="/source-data" icon={Search} label="Data" />
        </nav>
      </header>

      <main className="page-shell">{children}</main>

      <footer className="site-footer" aria-label="Site footer">
        <div className="site-footer__inner">
          <p className="site-footer__copy">
            <span className="site-footer__mark">
              <Copyright size={14} aria-hidden="true" />
              <span> {currentYear}</span>
            </span>
            <span className="site-footer__credit">
              <a className="site-footer__link" href="https://shipyard.vercel.app" target="_blank" rel="noreferrer">
                Arseni Sutton
              </a>
              <span>. All rights reserved</span>
            </span>
          </p>
        </div>
      </footer>
    </div>
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
}: {
  title: string;
  description: string;
  meta?: ReactNode;
}) {
  return (
    <section className="section-intro">
      <div className="section-intro__copy">
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {meta ? <div className="section-intro__meta">{meta}</div> : null}
    </section>
  );
}

function PositionPill({ pos }: { pos: Position }) {
  return <span className={cn('pill', `pill--${positionTone(pos)}`)}>{pos}</span>;
}

function ScorePill({ score }: { score: number | null }) {
  return <span className={cn('pill', `pill--${scoreToneFromValue(score)}`)}>{score === null ? 'NR' : score.toFixed(1)}</span>;
}

function ValuePill({ value }: { value: number | null }) {
  return <span className={cn('pill', `pill--slate`)}>{value === null ? '-' : value.toFixed(1)}</span>;
}

function RankBadge({ rank }: { rank: string }) {
  return <span className="source-rank-badge" aria-hidden="true">{rank}</span>;
}

function RankValueCell({ sourceRank, posRank }: { sourceRank: number | null; posRank: string | null }) {
  if (sourceRank === null) {
    return <div className="rank-value-cell rank-value-cell--blank">-</div>;
  }

  return (
    <div className="rank-value-cell">
      <strong>{sourceRank}</strong>
      <span>{posRank ? `(${posRank})` : '-'}</span>
    </div>
  );
}

function TeamBadge({ team }: { team: string }) {
  return <span className={cn('pill', `pill--${teamColors[team] ?? 'slate'}`)}>{team}</span>;
}

function PlayerWithSuffix({
  player,
  nflTeam,
  pos,
  compact = false,
}: {
  player: string;
  nflTeam: string;
  pos: Position;
  compact?: boolean;
}) {
  return (
    <div className={cn('player-line', compact && 'player-line--compact')}>
      <div className="player-line__name">
        <span className="player-line__player">{player}</span>
        <span className="player-line__comma">,</span>
        <span className="player-line__team">{nflTeam.toUpperCase()}</span>
      </div>
      <PositionPill pos={pos} />
    </div>
  );
}

function RecommendationCell({ rec }: { rec: KeeperEvaluation }) {
  return <PlayerWithSuffix player={rec.player} nflTeam={rec.nflTeam} pos={rec.pos} compact />;
}

function evaluateTeam(team: string, picks: DraftPick[], rankings: Map<string, RankingEntry>, rankingSource: string) {
  return picks
    .filter((pick) => pick.team === team)
    .map((pick) => evaluatePick(pick, rankings.get(normalizePlayerName(pick.player)) ?? null, rankingSource))
    .sort((a, b) => b.keeperScore - a.keeperScore || (a.sourceRank ?? 9999) - (b.sourceRank ?? 9999));
}

function bestKeeperForTeam(team: string, picks: DraftPick[], rankings: Map<string, RankingEntry>, rankingSource: string) {
  return evaluateTeam(team, picks, rankings, rankingSource)[0] ?? null;
}

function DashboardTable({
  rows,
}: {
  rows: KeeperEvaluation[];
}) {
  return (
    <div className="table-shell">
      <table className="keeper-table keeper-table--league">
        <thead>
          <tr>
            <th>Team</th>
            <th>Keeper rec</th>
            <th>2025 round</th>
            <th>2026 rank</th>
            <th>Keeper score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((rec) => {
            return (
              <tr key={rec.team} className="keeper-table__row">
                <td className="keeper-table__team">
                  <Link className="keeper-table__team-link" to={`/teams/${slugify(rec.team)}`}>
                    <span className="keeper-table__team-name">{rec.team}</span>
                    <ChevronRight size={16} />
                  </Link>
                </td>
                <td className="keeper-table__rec">{<RecommendationCell rec={rec} />}</td>
                <td className="keeper-table__round">R{rec.round}</td>
                <td className="keeper-table__value">
                  <RankValueCell sourceRank={rec.sourceRank} posRank={rec.ranking?.pos_rank ?? null} />
                </td>
                <td className="keeper-table__score">
                  <ScorePill score={rec.keeperScore} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DashboardPage() {
  const { data, rankings, rankingSource, loading, error } = useDraftData();

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
  const sourceLabel = rankingSource ?? 'current rankings';
  const recs = data.teams
    .map((team) => bestKeeperForTeam(team.name, data.picks, rankingMap, sourceLabel))
    .filter(Boolean) as KeeperEvaluation[];

  return (
    <div className="page-stack">
      <SectionIntro
        title="Team-by-Team Keeper Recs"
        description={`Top picks, ranked by current value versus last year's draft slot. Select team for full breakdown`}
      />
      <DashboardTable rows={recs} />
    </div>
  );
}

function TeamPage() {
  const { data, rankings, rankingSource, loading, error } = useDraftData();
  const params = useParams();
  const navigate = useNavigate();

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
  const sourceLabel = rankingSource ?? 'current rankings';
  const rankedPicks = evaluateTeam(team.name, data.picks, rankingMap, sourceLabel);
  const recommendation = rankedPicks[0] ?? null;
  const anchorOpener = recommendation ? keeperAnchorOpener(team.name) : null;

  return (
    <div className="page-stack">
      <SectionIntro
        title={team.name}
        description="Last year's roster, sorted by keeper value"
        meta={
          <>
            <button className="text-link" type="button" onClick={() => navigate('/')}>
              <ArrowLeft size={16} />
              Back
            </button>
          </>
        }
      />

      <section className="panel team-spotlight">
        <div className="spotlight-copy">
          <div className="team-card__eyebrow spotlight-copy__eyebrow">Top keeper anchor</div>
          {recommendation ? <PlayerWithSuffix player={recommendation.player} nflTeam={recommendation.nflTeam} pos={recommendation.pos} compact /> : <h2>No ranked keeper yet</h2>}
          <p>{recommendation && anchorOpener ? <>{anchorOpener}: {recommendation.why}</> : 'No recommendation available yet'}</p>
        </div>
        <div className="meter-card">
          <div className="meter-card__head">
            <div className="meter-card__label">Keeper score</div>
            <ScorePill score={recommendation?.keeperScore ?? null} />
          </div>
          <div className="meter">
            <span
              className={cn('meter__fill', recommendation && `meter__fill--${scoreTone(recommendation.keeperScore)}`)}
              style={{ width: meterWidth(recommendation?.keeperScore ?? null) }}
            />
          </div>
          <small>Weighted from {sourceLabel} rank, keeper cost, and positional scarcity</small>
        </div>
      </section>

      <section className="panel table-panel table-panel--drilldown">
        <div className="panel-head panel-head--stacked">
          <div>
            <div className="team-card__eyebrow">Keeper Rankings</div>
          </div>
          <span className="status-chip status-chip--soft">Sorted by keeper score</span>
        </div>

        <div className="table-shell">
          <table className="keeper-table keeper-table--drilldown">
            <thead>
              <tr>
                <th>Player</th>
                <th>Rnd</th>
                <th>2026 rank</th>
                <th>Keeper score</th>
              </tr>
            </thead>
            <tbody>
              {rankedPicks.map((rec) => {
                const isRecommendation = recommendation?.pick === rec.pick;
                return (
                  <tr key={rec.pick} className={cn('keeper-table__row', isRecommendation && 'keeper-table__row--highlight')}>
                    <td className="keeper-table__player">
                      <PlayerWithSuffix player={rec.player} nflTeam={rec.nflTeam} pos={rec.pos} compact />
                    </td>
                    <td className="keeper-table__round">R{rec.round}</td>
                    <td className="keeper-table__value">
                      <RankValueCell sourceRank={rec.sourceRank} posRank={rec.ranking?.pos_rank ?? null} />
                    </td>
                    <td className="keeper-table__score">
                      <ScorePill score={rec.keeperScore} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
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
  const { data, rankings, rankingSource, loading, error } = useDraftData();

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
  const sourceLabel = rankingSource ?? 'current rankings';
  const recs = new Set(
    data.teams
      .map((team) => bestKeeperForTeam(team.name, data.picks, rankingMap, sourceLabel)?.pick)
      .filter((pick): pick is number => typeof pick === 'number'),
  );

  return (
    <div className="page-stack">
      <SectionIntro
        title="2025 Draft Board"
        description="Last season's draft, used as the keeper cost baseline"
      />

      <section className="panel board-panel">
        <div className="panel-head">
          <div className="team-card__eyebrow">Classy Bois 2025 Draft</div>
          <span className="status-chip status-chip--soft">PPR; Snake format</span>
        </div>

        <div className="board-shell">
          <div className="board-grid" role="table" aria-label="Draft board snake view">
            <div className="board-header" role="row">
              {draftOrderTeams.map((pick, index) => (
                <div className="board-header__team" key={pick.pick} role="columnheader">
                  <span className="board-header__slot">{index + 1}</span>
                  <strong>{pick.team}</strong>
                </div>
              ))}
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

  if (loading) {
    return <LoadingPanel title="Loading source data..." />;
  }

  if (error || !sourceRows) {
    return <ErrorPanel message={error ?? 'Unknown error'} />;
  }

  const sourceLabel = sourceSource ?? 'FantasyPros';
  const snapshotDate = formatSnapshotDate(sourceRows[0]?.source_date);
  const visibleRows = sourceRows
    .slice(0, 300)
    .filter((row) => {
      const query = search.trim().toLowerCase();
      if (!query) return true;
      return [row.player, row.team, row.pos, row.pos_rank].some((value) => value.toLowerCase().includes(query));
    });
  const columnSize = Math.ceil(visibleRows.length / 3);
  const sourceColumns = Array.from({ length: 3 }, (_, index) => visibleRows.slice(index * columnSize, (index + 1) * columnSize));

  return (
    <div className="page-stack">
      <SectionIntro
        title="FantasyPros Source Data"
        description={`Projected PPR Points and Rankings as of ${snapshotDate}`}
      />

      <section className="panel table-panel">
        <div className="panel-head panel-head--stacked">
          <div>
            <div className="team-card__eyebrow">Top 300</div>
            <h2>Source rankings</h2>
          </div>
          <span className="status-chip status-chip--soft">{sourceLabel} PPR</span>
        </div>

        <label className="search-field search-field--table">
          <Search size={16} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search players, teams, or positions..." />
        </label>

        <div className="source-columns">
          {sourceColumns.map((rows, columnIndex) => (
            <section className="source-column" key={columnIndex}>
              <div className="source-column__head">
                <strong>Ranks {columnIndex * columnSize + 1}-{columnIndex * columnSize + rows.length}</strong>
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
                          <PlayerWithSuffix player={row.player} nflTeam={row.team} pos={row.pos} compact />
                        </td>
                        <td className="keeper-table__points">
                          <ValuePill value={row.pointsPpr} />
                        </td>
                        <td className="keeper-table__pos-rank">{row.pos_rank}</td>
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
    window.scrollTo({ top: 0, left: 0 });
    document.title = 'Classy Bois 2026 Keepers';
  }, [location.pathname]);

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/teams/:teamId" element={<TeamPage />} />
        <Route path="/draft-board" element={<DraftBoardPage />} />
        <Route path="/source-data" element={<SourceDataPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
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

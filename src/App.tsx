import { type ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Copyright,
  Grid2X2,
  Shield,
  Sparkles,
  X,
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
  loading: boolean;
  error: string | null;
};

type PickerRecommendation = DraftPick & {
  grade: 'Elite' | 'Strong' | 'Viable' | 'Pass';
  why: string;
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
    loading: true,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch('/draft-data.json', { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Failed to load draft-data.json (${response.status})`);
        }
        const json = (await response.json()) as DraftData;
        setState({ data: json, loading: false, error: null });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        const message = error instanceof Error ? error.message : 'Unable to load draft data';
        setState({ data: null, loading: false, error: message });
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

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function gradeFromRound(round: number): PickerRecommendation['grade'] {
  if (round <= 3) return 'Elite';
  if (round <= 6) return 'Strong';
  if (round <= 10) return 'Viable';
  return 'Pass';
}

function roundBand(round: number) {
  if (round <= 5) return 'early';
  if (round <= 10) return 'mid';
  return 'late';
}

function tempRecommendationForTeam(team: string, picks: DraftPick[]) {
  const teamPicks = picks.filter((pick) => pick.team === team);
  if (!teamPicks.length) {
    return null;
  }
  const index = hashString(team) % teamPicks.length;
  const pick = teamPicks[index];
  return {
    ...pick,
    grade: gradeFromRound(pick.round),
    why: 'Temporary placeholder rec. Real summer rankings will replace this logic later.',
  } satisfies PickerRecommendation;
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

function gradeTone(grade: PickerRecommendation['grade']) {
  switch (grade) {
    case 'Elite':
      return 'elite';
    case 'Strong':
      return 'strong';
    case 'Viable':
      return 'viable';
    case 'Pass':
      return 'pass';
    default:
      return 'viable';
  }
}

function value2026ForPick(pick: DraftPick) {
  const roundCurve = 98 - (pick.round - 1) * 4.8;
  const positionBoost: Record<Position, number> = {
    QB: -3,
    RB: 4,
    WR: 3,
    TE: 1,
    K: -9,
    'D/ST': -7,
  };
  const noise = (hashString(`${pick.player}-${pick.team}`) % 7) - 3;
  return Math.max(20, Math.min(99, Math.round(roundCurve + positionBoost[pick.pos] + noise)));
}

function draftCostValue(round: number) {
  return Math.max(20, Math.round(98 - (round - 1) * 5.2));
}

function deltaForPick(pick: DraftPick) {
  return value2026ForPick(pick) - draftCostValue(pick.round);
}

function deltaTone(delta: number) {
  if (delta >= 12) return 'elite';
  if (delta >= 6) return 'strong';
  if (delta >= 0) return 'viable';
  return 'pass';
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

function GradePill({ grade }: { grade: PickerRecommendation['grade'] }) {
  return <span className={cn('pill', `pill--${gradeTone(grade)}`)}>{grade}</span>;
}

function TeamBadge({ team }: { team: string }) {
  return <span className={cn('pill', `pill--${teamColors[team] ?? 'slate'}`)}>{team}</span>;
}

function ValuePill({ value }: { value: number }) {
  return <span className="pill pill--value">{value}</span>;
}

function DeltaPill({ delta }: { delta: number }) {
  return <span className={cn('pill', `pill--${deltaTone(delta)}`)}>{delta >= 0 ? `+${delta}` : delta}</span>;
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

function RecommendationCell({ rec }: { rec: PickerRecommendation }) {
  return <PlayerWithSuffix player={rec.player} nflTeam={rec.nflTeam} pos={rec.pos} compact />;
}

function DashboardTable({
  rows,
}: {
  rows: PickerRecommendation[];
}) {
  return (
    <div className="table-shell">
      <table className="keeper-table keeper-table--league">
        <thead>
          <tr>
            <th>Team</th>
            <th>Keeper rec</th>
            <th>Rnd</th>
            <th>Val</th>
            <th>Δ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((rec) => {
            const delta = deltaForPick(rec);
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
                  <ValuePill value={value2026ForPick(rec)} />
                </td>
                <td className="keeper-table__delta">
                  <DeltaPill delta={delta} />
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
  const { data, loading, error } = useDraftData();

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

  const recs = data.teams
    .map((team) => tempRecommendationForTeam(team.name, data.picks))
    .filter(Boolean) as PickerRecommendation[];

  return (
    <div className="page-stack">
      <SectionIntro
        title="Best keeper picks, team by team"
        description="One recommendation per team. Click any team name to jump into roster breakdown"
      />
      <DashboardTable rows={recs} />
    </div>
  );
}

function TeamPickerModal({
  open,
  onClose,
  teams,
}: {
  open: boolean;
  onClose: () => void;
  teams: TeamSummary[];
}) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    if (open) {
      window.addEventListener('keydown', onKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  const visibleTeams = teams.filter((team) => team.name.toLowerCase().includes(search.toLowerCase()));

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-label="Select team" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="team-card__eyebrow">Team selector</div>
            <h3>Pick a roster to inspect</h3>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close selector">
            <X size={18} />
          </button>
        </div>

        <label className="search-field search-field--modal">
          <Search size={16} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter teams..." />
        </label>

        <div className="team-picker-list">
          {visibleTeams.map((team) => {
            return (
              <button
                key={team.name}
                className="team-picker-row"
                type="button"
                onClick={() => {
                  navigate(`/teams/${slugify(team.name)}`);
                  onClose();
                }}
              >
                <div>
                  <strong>{team.name}</strong>
                  <span>{team.picks} picks · avg pick {team.avgPick}</span>
                </div>
                <div className="team-picker-row__meta">
                  <span>Open roster</span>
                  <ChevronDown size={14} />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TeamPage() {
  const { data, loading, error } = useDraftData();
  const params = useParams();
  const navigate = useNavigate();
  const [selectorOpen, setSelectorOpen] = useState(false);

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

  const teamPicks = data.picks.filter((pick) => pick.team === team.name);
  const recommendation = tempRecommendationForTeam(team.name, data.picks);
  const rankedPicks = [...teamPicks]
    .map((pick) => ({
      pick,
      value: value2026ForPick(pick),
      delta: deltaForPick(pick),
      grade: gradeFromRound(pick.round),
    }))
    .sort((a, b) => b.delta - a.delta);

  return (
    <div className="page-stack">
      <TeamPickerModal open={selectorOpen} onClose={() => setSelectorOpen(false)} teams={data.teams} />

      <section className="hero-card hero-card--stacked">
        <div className="hero-copy">
          <h1>{team.name}</h1>
          <p>Inspect the roster built from last year&apos;s draft. The recommendation slot is still temporary, but the layout is ready for the real keeper logic.</p>
        </div>

        <div className="hero-actions">
          <button className="button button-secondary" type="button" onClick={() => navigate('/')}>
            <ArrowLeft size={16} />
            Back to dashboard
          </button>
          <button className="button button-primary" type="button" onClick={() => setSelectorOpen(true)}>
            Choose another team
          </button>
        </div>
      </section>

      <section className="panel team-spotlight">
        <div className="spotlight-copy">
          <div className="team-card__eyebrow">Temporary keeper anchor</div>
          <h2>{recommendation?.player ?? 'No recommendation yet'}</h2>
          <div className="pill-row">
            {recommendation ? (
              <>
                <PositionPill pos={recommendation.pos} />
                <TeamBadge team={recommendation.nflTeam} />
                <GradePill grade={recommendation.grade} />
              </>
            ) : null}
          </div>
          <p>{recommendation?.why ?? 'No recommendation available yet.'}</p>
        </div>
        <div className="meter-card">
          <div className="meter-card__label">Placeholder confidence</div>
          <div className="meter">
            <span className={cn('meter__fill', recommendation && `meter__fill--${gradeTone(recommendation.grade)}`)} />
          </div>
          <small>Real summer rankings will drive this later.</small>
        </div>
      </section>

      <section className="panel table-panel">
        <div className="panel-head panel-head--stacked">
          <div>
            <div className="team-card__eyebrow">Draft history</div>
            <h2>Keeper ranking list</h2>
          </div>
          <span className="status-chip status-chip--soft">Sorted by temporary delta</span>
        </div>

        <div className="table-shell">
          <table className="keeper-table keeper-table--drilldown">
            <thead>
              <tr>
                <th>Player</th>
                <th>Rnd</th>
                <th>Val</th>
                <th>Δ</th>
              </tr>
            </thead>
            <tbody>
              {rankedPicks.map(({ pick, value, delta, grade }) => {
                const isRecommendation = recommendation?.pick === pick.pick;
                return (
                  <tr key={pick.pick} className={cn('keeper-table__row', isRecommendation && 'keeper-table__row--highlight')}>
                    <td className="keeper-table__player">
                      <PlayerWithSuffix player={pick.player} nflTeam={pick.nflTeam} pos={pick.pos} />
                    </td>
                    <td className="keeper-table__round">R{pick.round}</td>
                    <td><ValuePill value={value} /></td>
                    <td><DeltaPill delta={delta} /></td>
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
  const { data, loading, error } = useDraftData();

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
  const recs = new Set(data.teams.map((team) => tempRecommendationForTeam(team.name, data.picks)?.pick).filter(Boolean));

  return (
    <div className="page-stack">
      <SectionIntro
        title="2025 Draft Board"
      />

      <section className="panel">
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

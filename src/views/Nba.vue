<script setup>
import { ref, watch } from 'vue';
import axios from 'axios';
import { useRoute } from 'vue-router';

import NbaTeamStatsModal from '../components/NbaTeamStatsModal.vue';
import NbaPlayerStatsModal from '../components/NbaPlayerStatsModal.vue';
import PickList from '../components/PickList.vue';
import { buildNbaApiUrl } from '../utils/nbaApi';

const matchups = ref([]);
const loading = ref(false);
const isLoaded = ref(false);
const errorMessage = ref('');

const pickList = ref([]);
const isPickListOpen = ref(false);
const playerModalState = ref({
  visible: false,
  playerId: null,
  teamId: null,
  teamCode: '',
  opponentCode: '',
  playerName: '',
  playerPosition: '',
  market: {},
  initialStats: [],
});
const teamModalState = ref({
  visible: false,
  teamId: null,
  teamName: '',
  markets: [],
});

const MATCHUPS_URL = buildNbaApiUrl('markets/matchups');
const MARKETS_URL = buildNbaApiUrl('markets');
const TEAM_AVERAGES_URL = buildNbaApiUrl('teams/stats/averages');
const TEAM_PERFORMANCE_URL = buildNbaApiUrl('teams/stats/recent-performance');
const LINEUPS_URL = buildNbaApiUrl('games/lineups');

const route = useRoute();

watch(
  () => route.query?.date ?? null,
  (newDateParam) => {
    void loadMatchups(newDateParam);
  },
  { immediate: true }
);

const OFFENSE_RANK_DEFS = [
  { label: 'Points', key: 'points' },
  { label: 'Assists', key: 'assists' },
  { label: 'Rebounds', key: 'rebounds' },
];

const DEFENSE_RANK_DEFS = [
  { label: 'Points', key: 'points' },
  { label: 'Assists', key: 'assists' },
  { label: 'Rebounds', key: 'rebounds' },
];

const PLAYER_SECTION_CONFIG = [
  { key: 'starters', label: 'Starters' },
  { key: 'bench', label: 'Bench' },
];

const PLAYER_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'points', label: 'PTS', statKey: 'points' },
  { key: 'pt3', label: '3PT', statKey: 'pt3' },
  { key: 'rebounds', label: 'REB', statKey: 'rebounds' },
  { key: 'assists', label: 'AST', statKey: 'assists' },
  { key: 'pra', label: 'PRA', statKey: 'pra' },
];

async function loadMatchups(dateParam = null) {
  loading.value = true;
  errorMessage.value = '';
  const resolvedDate =
    typeof dateParam === 'string' && dateParam.trim().length ? dateParam.trim() : null;
  const dateConfig = resolvedDate ? { params: { date: resolvedDate } } : undefined;
  const shouldIncludeLineups = !resolvedDate;

  try {
    const [
      matchupsResponse,
      marketsResponse,
      averagesResponse,
      performanceResponse,
    ] = await Promise.all([
      axios.get(MATCHUPS_URL, dateConfig),
      axios.get(MARKETS_URL, dateConfig),
      axios.get(TEAM_AVERAGES_URL),
      axios.get(TEAM_PERFORMANCE_URL),
    ]);

    const rawMatchups = toArray(matchupsResponse.data ?? matchupsResponse);
    const rawMarkets = toArray(marketsResponse.data ?? marketsResponse);
    const teamAverages = extractTeamAverages(averagesResponse.data ?? averagesResponse);
    const teamPerformance = extractRecentPerformance(performanceResponse.data ?? performanceResponse);
    let lineupGames = null;
    if (shouldIncludeLineups) {
      try {
        const lineupsResponse = await axios.get(LINEUPS_URL);
        lineupGames = extractLineupGames(lineupsResponse.data ?? lineupsResponse);
      } catch (lineupsError) {
        console.warn('Lineups request failed, falling back to default player rendering', lineupsError);
      }
    }

    const marketsMap = buildMarketsMap(rawMarkets);
    const averagesMap = buildTeamAverageMap(teamAverages);
    const performanceMap = buildPerformanceMap(teamPerformance);
    const lineupsMap = shouldIncludeLineups ? buildLineupsMap(lineupGames ?? []) : new Map();

    matchups.value = rawMatchups.map((rawMatchup) =>
      enrichMatchup(rawMatchup, marketsMap, averagesMap, performanceMap, lineupsMap)
    );
  } catch (error) {
    console.error('Unable to load NBA data', error);
    matchups.value = [];
    errorMessage.value = 'No se pudo cargar la información de la NBA. Intenta nuevamente más tarde.';
  } finally {
    loading.value = false;
    isLoaded.value = true;
  }
}

function buildMarketsMap(entries) {
  const map = new Map();
  toArray(entries).forEach((entry) => {
    const key = getMatchupKey(entry);
    if (key) {
      map.set(key, entry);
    }
  });
  return map;
}

function enrichMatchup(rawMatchup, marketsMap, averagesMap, performanceMap, lineupsMap) {
  const matchupKey = getMatchupKey(rawMatchup);
  const marketEntry = matchupKey ? marketsMap.get(matchupKey) ?? null : null;
  const lineupEntry = findLineupEntry(rawMatchup, lineupsMap);

  const homeTeam = buildTeam(
    rawMatchup.home_team,
    marketEntry,
    averagesMap,
    performanceMap,
    rawMatchup.away_team,
    lineupEntry?.home
  );
  const awayTeam = buildTeam(
    rawMatchup.away_team,
    marketEntry,
    averagesMap,
    performanceMap,
    rawMatchup.home_team,
    lineupEntry?.away
  );

  return {
    id: matchupKey ?? normalizeId(rawMatchup.id),
    externalId: rawMatchup.external_id ?? null,
    startAt: rawMatchup.start_at ?? rawMatchup.scheduled_at ?? null,
    displayDate: formatMatchupDate(rawMatchup.start_at ?? rawMatchup.scheduled_at),
    homeTeam,
    awayTeam,
  };
}

function buildTeam(teamPayload = {}, marketEntry, averagesMap, performanceMap, opponentPayload, lineupInfo) {
  const teamId = normalizeId(teamPayload.id ?? teamPayload.team_id);
  const opponentId = normalizeId(opponentPayload?.id ?? opponentPayload?.team_id);
  const performance = performanceMap.get(teamId) ?? null;
  const recordInfo = buildRecordInfo(teamPayload, performance);
  const { sections, injuries, layout } = buildPlayerSections(teamPayload, marketEntry, lineupInfo);

  return {
    id: teamId,
    code: resolveTeamCode(teamPayload),
    name: formatTeamName(teamPayload),
    recordInfo,
    markets: buildTeamMarkets(teamId, marketEntry),
    offenseRanks: buildRankList(teamId, OFFENSE_RANK_DEFS, averagesMap, 'ofensive'),
    opponentDefenseRanks: buildRankList(opponentId, DEFENSE_RANK_DEFS, averagesMap, 'defensive'),
    opponentCode: resolveTeamCode(opponentPayload),
    playerSections: sections,
    playerSectionsLayout: layout,
    injuries,
  };
}

function buildTeamMarkets(teamId, marketEntry) {
  if (!marketEntry) return { primary: [], secondary: [] };
  const market = resolveMarketObject(marketEntry);
  const teamMarkets = findTeamMarketEntry(teamId, marketEntry);
  const primary = [];
  const secondary = [];

  const handicap = computeSignedHandicap(teamId, market?.handicap, market?.favorite_team_id);
  if (handicap !== null) {
    primary.push({ label: 'HC', value: formatMarketValue(handicap) });
  }

  const teamPoints = teamMarkets?.points ?? null;
  if (teamPoints !== null && teamPoints !== undefined) {
    primary.push({ label: 'PTS', value: formatMarketValue(teamPoints) });
  }

  const firstHalfHandicap = computeSignedHandicap(
    teamId,
    market?.first_half_handicap,
    market?.first_half_favorite_team_id ?? market?.favorite_team_id
  );
  if (firstHalfHandicap !== null) {
    primary.push({ label: 'H1 HC', value: formatMarketValue(firstHalfHandicap) });
  }

  const firstHalfPoints = teamMarkets?.first_half_points ?? market?.first_half_points ?? null;
  if (firstHalfPoints !== null && firstHalfPoints !== undefined) {
    primary.push({ label: 'H1 PTS', value: formatMarketValue(firstHalfPoints) });
  }

  const soloPoints = teamMarkets?.solo_points ?? teamMarkets?.points ?? null;
  if (soloPoints !== null && soloPoints !== undefined) {
    secondary.push({ label: 'SOLO', value: formatMarketValue(soloPoints) });
  }

  const firstHalfSoloPoints = teamMarkets?.first_half_points ?? null;
  if (firstHalfSoloPoints !== null && firstHalfSoloPoints !== undefined) {
    secondary.push({ label: 'H1 SOLO', value: formatMarketValue(firstHalfSoloPoints) });
  }

  const quarterKeys = [
    { key: 'first_quarter_points', label: 'Q1' },
    { key: 'second_quarter_points', label: 'Q2' },
    { key: 'third_quarter_points', label: 'Q3' },
    { key: 'fourth_quarter_points', label: 'Q4' },
  ];
  quarterKeys.forEach(({ key, label }) => {
    const value = teamMarkets?.[key] ?? market?.[key] ?? null;
    if (value !== null && value !== undefined) {
      secondary.push({ label, value: formatMarketValue(value) });
    }
  });

  return {
    primary,
    secondary,
  };
}

function resolveMoneylineValue(teamId, marketEntry) {
  const market = resolveMarketObject(marketEntry);
  if (!market) return null;
  const normalizedTeamId = normalizeId(teamId);
  const favoriteId = normalizeId(market.favorite_team_id);
  if (market.moneyline_home !== undefined || market.moneyline_away !== undefined) {
    const homeId = normalizeId(marketEntry?.home_team_id ?? marketEntry?.home_team?.id);
    const isHome = normalizedTeamId && homeId && normalizedTeamId === homeId;
    return isHome ? market.moneyline_home : market.moneyline_away;
  }
  if (market.moneyline !== undefined) {
    return market.moneyline;
  }
  if (normalizedTeamId && favoriteId) {
    return normalizedTeamId === favoriteId ? '-Fav' : '+Dog';
  }
  return null;
}

function findTeamMarketEntry(teamId, marketEntry) {
  const normalizedTeamId = normalizeId(teamId);
  if (!normalizedTeamId) return null;
  return toArray(marketEntry?.team_markets).find((entry) => normalizeId(entry.team_id) === normalizedTeamId) ?? null;
}

function buildRankList(teamId, defs, averagesMap, branchKey) {
  const normalizedId = normalizeId(teamId);
  if (!normalizedId) return [];
  const averagesEntry = averagesMap.get(normalizedId) ?? {};
  const branch = averagesEntry[branchKey] ?? averagesEntry[branchKey === 'ofensive' ? 'offensive' : 'defensive'] ?? {};
  return defs
    .map((definition) => {
      const metric = branch?.[definition.key];
      if (!metric || (metric.value === null && metric.rank === null)) return null;
      return {
        label: String(definition.label ?? '').toUpperCase() || 'STAT',
        value: metric.value,
        rank: metric.rank,
      };
    })
    .filter(Boolean);
}

function buildPlayerSections(teamPayload, marketEntry, lineupInfo) {
  const lineupStarters = toArray(lineupInfo?.starters);
  const starterIds = new Set(lineupStarters.map((player) => normalizeId(player.id ?? player.player_id)).filter(Boolean));
  const hasLineups = starterIds.size > 0;
  const layout = hasLineups ? 'lineups' : 'default';

  const sectionConfig = hasLineups
    ? PLAYER_SECTION_CONFIG
    : [
        {
          key: 'all',
          label: 'Roster',
        },
      ];

  const sections = sectionConfig.map((section) => ({
    key: section.key,
    label: section.label,
    columns: PLAYER_COLUMNS,
    rows: [],
  }));
  const injuries = [];

  const sectionMap = new Map(sections.map((section) => [section.key, section]));
  const { categoryMap: lineupCategoryMap, detailMap: lineupDetailMap } = buildLineupMaps(
    hasLineups ? lineupInfo : {}
  );

  const players = toArray(teamPayload?.players).map((player, index) => ({
    ...player,
    __depthIndex: index,
  }));
  const playerInfoMap = new Map();
  players.forEach((player) => {
    const playerId = normalizeId(player.id ?? player.player_id);
    if (!playerId) return;
    playerInfoMap.set(playerId, player);
  });

  toArray(lineupInfo?.injuries).forEach((entry) => {
    injuries.push(buildInjuryEntry(entry));
  });

  const playerMarkets = toArray(marketEntry?.player_markets);
  playerMarkets.forEach((market) => {
    const playerId = normalizeId(market.player_id ?? market.playerId);
    if (!playerId) return;
    const rosterInfo = playerInfoMap.get(playerId);
    if (!rosterInfo) return;
    const lineupDetails = lineupDetailMap.get(playerId) ?? null;
    const playerInfo = lineupDetails ? { ...rosterInfo, ...lineupDetails } : rosterInfo;
    const playerStats = Array.isArray(playerInfo?.stats) ? playerInfo.stats : [];
    const resolvedCategory = resolvePlayerCategory(playerInfo, market, lineupCategoryMap);
    if (resolvedCategory === 'injuries' && hasLineups) {
      injuries.push(buildInjuryEntry(playerInfo));
    }
    const category = hasLineups ? (starterIds.has(playerId) ? 'starters' : 'bench') : 'all';
    const section = sectionMap.get(category);
    if (!section) return;

    const metrics = {};
    const marketSnapshot = {};
    PLAYER_COLUMNS.forEach((column) => {
      if (!column.statKey) return;
      const rawValue = market[column.statKey];
      const numericValue = parseNumeric(rawValue);
      metrics[column.key] = {
        value: formatMarketValue(rawValue),
        rawValue,
        statKey: column.statKey,
        lastFive: computeLastFive(playerStats, column.statKey, numericValue),
      };
      if (numericValue !== null) {
        marketSnapshot[column.statKey] = numericValue;
      }
    });

    const fullName = resolvePlayerName(playerInfo);
    const displayName = resolvePlayerDisplayName(playerInfo);
    const position = resolvePlayerPosition(playerInfo);
    section.rows.push({
      id: playerId,
      name: displayName,
      fullName,
      teamId: normalizeId(playerInfo.team_id ?? teamPayload.id),
      position,
      stats: playerStats,
      market: marketSnapshot,
      rawMarket: market,
      metrics,
    });
  });

  if (hasLineups) {
    players.forEach((player) => {
      const playerId = normalizeId(player.id ?? player.player_id);
      if (!playerId) return;
      const resolvedCategory = resolvePlayerCategory(player, {}, lineupCategoryMap);
      if (resolvedCategory === 'injuries') {
        injuries.push(buildInjuryEntry(player));
      }
    });
  }

  const uniqueInjuries = hasLineups ? dedupeById(injuries) : [];

  return {
    sections: sections.filter((section) => section.rows.length),
    injuries: uniqueInjuries,
    layout,
  };
}

function resolvePlayerCategory(playerInfo = {}, market = {}, lineupCategoryMap) {
  const playerId =
    normalizeId(playerInfo.id ?? playerInfo.player_id) ?? normalizeId(market.player_id ?? market.playerId);
  if (lineupCategoryMap?.size && playerId) {
    const lineupCategory = lineupCategoryMap.get(playerId);
    if (lineupCategory) {
      return lineupCategory;
    }
  }

  const injuryStatus = String(
    playerInfo.injury_status ?? playerInfo.injury?.status ?? playerInfo.status ?? ''
  ).toLowerCase();
  if (injuryStatus && injuryStatus !== 'active' && injuryStatus !== 'none' && injuryStatus !== 'available') {
    return 'injuries';
  }

  const marketRole = String(market.role ?? market.player_type ?? '').toLowerCase();
  if (marketRole.includes('injury')) return 'injuries';

  const latestStat = resolveLatestStat(playerInfo.stats);
  if (latestStat?.is_starter === 1) return 'starters';

  const marketStarter = market.is_starter ?? market.starter ?? market.projected_starter;
  if (marketStarter === true || marketStarter === 1) return 'starters';

  const isStarterDirect = playerInfo.is_starter ?? playerInfo.starter ?? playerInfo.projected_starter;
  if (isStarterDirect === true) return 'starters';

  const role = String(playerInfo.role ?? playerInfo.depth_chart_role ?? '').toLowerCase();
  if (role.includes('start')) return 'starters';

  const lineupStatus = String(playerInfo.lineup_status ?? playerInfo.projected_role ?? '').toLowerCase();
  if (lineupStatus.includes('start')) return 'starters';

  const depthOrder = Number(
    playerInfo.depth_chart_order ??
      playerInfo.depth_chart_rank ??
      playerInfo.order ??
      playerInfo.__depthIndex
  );
  if (Number.isFinite(depthOrder) && depthOrder >= 0 && depthOrder < 5) {
    return 'starters';
  }

  return 'bench';
}

function buildInjuryEntry(player = {}) {
  const status = player.injury_status ?? player.injury?.status ?? player.status ?? 'Questionable';
  return {
    id: normalizeId(player.id ?? player.player_id),
    name: player.name ?? resolvePlayerName(player),
    status,
  };
}

function dedupeById(entries) {
  const map = new Map();
  entries.forEach((entry) => {
    const id = normalizeId(entry.id);
    if (!id) return;
    if (!map.has(id)) {
      map.set(id, entry);
    }
  });
  return Array.from(map.values());
}

function buildRecordInfo(teamPayload = {}, performance) {
  const records = performance?.records ?? {};
  const baseWins = parseRecordValue(teamPayload.wins ?? teamPayload.record?.wins);
  const baseLosses = parseRecordValue(teamPayload.losses ?? teamPayload.record?.losses);
  const baseTies = parseRecordValue(teamPayload.ties ?? teamPayload.record?.ties);

  const columns = [
    buildWinLossColumn({
      key: 'overall',
      header: 'W/D',
      record: findRecordEntry(records, ['overall', 'season', 'record', 'wd']),
      fallback: { wins: baseWins, losses: baseLosses, ties: baseTies },
    }),
    buildWinLossColumn({
      key: 'last7-wd',
      header: 'L7 W/D',
      record: findRecordEntry(records, [
        'last_games',
        'lastgames',
        'last_7',
        'last7',
        'l7',
        'last-seven',
        'last7_wd',
        'last_7_wd',
        'wd_last7',
      ]),
    }),
    buildWinLossColumn({
      key: 'last7-ats',
      header: 'L7 ATS',
      record: findRecordEntry(records, ['ats', 'last_7_ats', 'last7_ats', 'ats_last7', 'ats_last_7', 'l7_ats']),
    }),
    buildOverUnderColumn({
      key: 'last7-ou',
      header: 'L7 O/U',
      record: findRecordEntry(records, [
        'over_under',
        'overunder',
        'last7_ou',
        'last_7_ou',
        'ou_last7',
        'ou_last_7',
        'last-seven-ou',
        'last7_over_under',
        'last_7_over_under',
        'over_under_last_7',
      ]),
    }),
  ];

  return {
    columns,
  };
}

function parseRecordValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function buildWinLossColumn({ key, header, record, fallback }) {
  const normalized = extractWinLossRecord(record, fallback);
  if (!normalized) {
    return buildRecordPlaceholder(key, header);
  }
  const wins = normalized.wins ?? 0;
  const losses = normalized.losses ?? 0;
  const ties = normalized.ties ?? 0;
  const gamesEvaluated = normalized.gamesEvaluated;
  return {
    key,
    header,
    text: formatRecordText(wins, losses, ties, gamesEvaluated),
    state: resolveRecordState(wins, losses),
  };
}

function buildOverUnderColumn({ key, header, record, fallback }) {
  const normalized = extractOverUnderRecord(record, fallback);
  if (!normalized) {
    return buildRecordPlaceholder(key, header);
  }
  const overs = normalized.overs ?? 0;
  const unders = normalized.unders ?? 0;
  const pushes = normalized.pushes ?? 0;
  const gamesEvaluated = normalized.gamesEvaluated;
  return {
    key,
    header,
    text: formatOverUnderText(overs, unders, pushes, gamesEvaluated),
    state: resolveRecordState(overs, unders),
  };
}

function buildRecordPlaceholder(key, header) {
  return {
    key,
    header,
    text: '-',
    state: 'neutral',
  };
}

function formatRecordText(wins, losses, ties, gamesEvaluated) {
  const baseWins = Number.isFinite(wins) ? wins : 0;
  const baseLosses = Number.isFinite(losses) ? losses : 0;
  const baseTies = Number.isFinite(ties) ? ties : 0;
  const base = `${baseWins}-${baseLosses}`;
  const suffix = Number.isFinite(gamesEvaluated) && gamesEvaluated > 0 ? ` (${gamesEvaluated})` : '';
  if (baseTies > 0) {
    return `${base}-${baseTies}${suffix}`;
  }
  return `${base}${suffix}`;
}

function formatOverUnderText(overs, unders, pushes, gamesEvaluated) {
  const baseOvers = Number.isFinite(overs) ? overs : 0;
  const baseUnders = Number.isFinite(unders) ? unders : 0;
  const basePushes = Number.isFinite(pushes) ? pushes : 0;
  const base = `${baseOvers}-${baseUnders}`;
  const suffix = Number.isFinite(gamesEvaluated) && gamesEvaluated > 0 ? ` (${gamesEvaluated})` : '';
  if (basePushes > 0) {
    return `${base}-${basePushes}${suffix}`;
  }
  return `${base}${suffix}`;
}

function resolveRecordState(positive, negative) {
  if (positive > negative) return 'positive';
  if (positive < negative) return 'negative';
  return 'neutral';
}

function extractWinLossRecord(record, fallback = {}) {
  const wins = resolveStatValue(record, ['wins', 'win', 'w', 'victories', 'success', 'successes'], fallback);
  const losses = resolveStatValue(record, ['losses', 'loss', 'l', 'defeats', 'failures'], fallback);
  const ties = resolveStatValue(record, ['ties', 'tie', 't', 'draws', 'draw', 'push', 'pushes', 'd'], fallback);
  const gamesEvaluated = resolveStatValue(
    record,
    ['games_evaluated', 'games', 'evaluated', 'played', 'gp'],
    fallback
  );
  if (wins === null && losses === null && ties === null) {
    return null;
  }
  return {
    wins: wins ?? 0,
    losses: losses ?? 0,
    ties: ties ?? 0,
    gamesEvaluated: gamesEvaluated ?? null,
  };
}

function extractOverUnderRecord(record, fallback = {}) {
  const overs = resolveStatValue(record, ['overs', 'over', 'o', 'wins', 'win', 'w'], fallback);
  const unders = resolveStatValue(record, ['unders', 'under', 'u', 'losses', 'loss', 'l'], fallback);
  const pushes = resolveStatValue(record, ['pushes', 'push', 'ties', 'tie', 't', 'p'], fallback);
  const gamesEvaluated = resolveStatValue(
    record,
    ['games_evaluated', 'games', 'evaluated', 'played', 'gp'],
    fallback
  );
  if (overs === null && unders === null && pushes === null) {
    return null;
  }
  return {
    overs: overs ?? 0,
    unders: unders ?? 0,
    pushes: pushes ?? 0,
    gamesEvaluated: gamesEvaluated ?? null,
  };
}

function resolveStatValue(source, keys, fallback) {
  for (const key of keys) {
    const numeric = parseRecordValue(source?.[key]);
    if (numeric !== null) return numeric;
  }
  if (fallback && typeof fallback === 'object') {
    for (const key of keys) {
      const numeric = parseRecordValue(fallback?.[key]);
      if (numeric !== null) return numeric;
    }
  } else if (fallback !== undefined) {
    const numeric = parseRecordValue(fallback);
    if (numeric !== null) return numeric;
  }
  return null;
}

function findRecordEntry(records = {}, variants = []) {
  if (!records || typeof records !== 'object') return null;
  const normalizedEntries = new Map();
  Object.entries(records).forEach(([key, value]) => {
    normalizedEntries.set(normalizeRecordKey(key), value);
  });
  for (const variant of variants) {
    const normalizedVariant = normalizeRecordKey(variant);
    if (normalizedEntries.has(normalizedVariant)) {
      return normalizedEntries.get(normalizedVariant);
    }
  }
  return null;
}

function normalizeRecordKey(key) {
  return String(key ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function buildTeamAverageMap(entries) {
  const map = new Map();
  entries.forEach((entry) => {
    const teamId = normalizeId(entry?.team?.id ?? entry?.team_id);
    if (!teamId) return;
    map.set(teamId, {
      ofensive: entry.ofensive ?? entry.offensive ?? {},
      defensive: entry.defensive ?? {},
    });
  });
  return map;
}

function buildPerformanceMap(entries) {
  const map = new Map();
  entries.forEach((entry) => {
    const teamId = normalizeId(entry?.team?.id ?? entry?.team_id);
    if (!teamId) return;
    map.set(teamId, {
      summary: entry.summary ?? '',
      records: entry.records ?? {},
    });
  });
  return map;
}

function extractLineupGames(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.games)) return payload.games;
  return [];
}

function buildLineupsMap(entries) {
  const map = new Map();
  toArray(entries).forEach((game) => {
    const normalizedGame = normalizeLineupGame(game);
    if (!normalizedGame) return;
    const idKey = normalizeId(game?.id ?? game?.game_id ?? game?.matchup_id ?? game?.gameId);
    if (idKey) {
      map.set(idKey, normalizedGame);
    }
    const compositeKey = buildLineupCompositeKey(normalizedGame?.away?.teamId, normalizedGame?.home?.teamId);
    if (compositeKey) {
      map.set(compositeKey, normalizedGame);
    }
  });
  return map;
}

function normalizeLineupGame(game = {}) {
  const away = normalizeLineupTeam(game.away_team ?? game.awayTeam);
  const home = normalizeLineupTeam(game.home_team ?? game.homeTeam);
  if (!away && !home) return null;
  return { away, home };
}

function normalizeLineupTeam(team = {}) {
  if (!team) return null;
  const teamId = normalizeId(team.id ?? team.team_id);
  const starters = toArray(team.starters).map((player, index) => normalizeLineupPlayer(player, 'starters', index));
  const bench = toArray(team.bench).map((player, index) => normalizeLineupPlayer(player, 'bench', index));
  const injuries = toArray(team.injuries).map((player, index) =>
    normalizeLineupPlayer(player, 'injuries', index)
  );
  return {
    teamId,
    starters,
    bench,
    injuries,
  };
}

function normalizeLineupPlayer(player = {}, category = 'bench', index = 0) {
  return {
    id: normalizeId(player.id ?? player.player_id),
    name: player.name ?? resolvePlayerName(player),
    status: player.status ?? player.injury_status ?? player.injury?.status ?? null,
    category,
    order: index,
  };
}

function buildLineupCompositeKey(awayTeamId, homeTeamId) {
  const away = normalizeId(awayTeamId);
  const home = normalizeId(homeTeamId);
  if (!away || !home) return null;
  return `pair:${away}-${home}`;
}

function findLineupEntry(rawMatchup, lineupsMap) {
  if (!lineupsMap || !lineupsMap.size) return null;
  const candidates = [
    rawMatchup.id,
    rawMatchup.game_id,
    rawMatchup.gameId,
    rawMatchup.matchup_id,
    rawMatchup.matchupId,
    rawMatchup.market_id,
    rawMatchup.marketId,
    rawMatchup.external_id,
    rawMatchup.externalId,
  ];
  for (const candidate of candidates) {
    const key = normalizeId(candidate);
    if (key && lineupsMap.has(key)) {
      return lineupsMap.get(key);
    }
  }
  const compositeKey = buildLineupCompositeKey(
    rawMatchup.away_team?.id ?? rawMatchup.away_team?.team_id,
    rawMatchup.home_team?.id ?? rawMatchup.home_team?.team_id
  );
  if (compositeKey && lineupsMap.has(compositeKey)) {
    return lineupsMap.get(compositeKey);
  }
  return null;
}

function buildLineupMaps(lineupInfo = {}) {
  const categoryMap = new Map();
  const detailMap = new Map();
  ['starters', 'bench', 'injuries'].forEach((category) => {
    toArray(lineupInfo?.[category]).forEach((player, index) => {
      const normalizedId = normalizeId(player.id ?? player.player_id);
      if (!normalizedId) return;
      categoryMap.set(normalizedId, category);
      detailMap.set(normalizedId, {
        ...player,
        lineupCategory: category,
        order: index,
      });
    });
  });
  return { categoryMap, detailMap };
}

function extractTeamAverages(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.teams)) return payload.teams;
  return [];
}

function extractRecentPerformance(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.teams)) return payload.teams;
  return [];
}

function resolveTeamCode(team = {}) {
  return team.short_name ?? team.code ?? team.abbreviation ?? team.nickname ?? team.name ?? 'TEAM';
}

function formatTeamName(team = {}) {
  const names = [team.city, team.name].filter(Boolean);
  return names.length ? names.join(' ') : team.name ?? team.code ?? 'Team';
}

function resolvePlayerName(player = {}) {
  const names = [player.first_name, player.last_name].filter(Boolean);
  if (names.length) return names.join(' ');
  if (player.full_name) return player.full_name;
  if (player.name) return player.name;
  return player.id ? `Player ${player.id}` : 'Player';
}

function resolvePlayerPosition(player = {}) {
  const position =
    player.position ??
    player.primary_position ??
    player.pos ??
    player.role ??
    player.depth_chart_position ??
    '';
  return position ? String(position).toUpperCase() : '';
}

function resolvePlayerDisplayName(player = {}) {
  const first = String(player.first_name ?? player.firstName ?? '').trim();
  const last = String(player.last_name ?? player.lastName ?? '').trim();
  if (first && last) {
    return `${first.charAt(0).toUpperCase()}. ${last}`;
  }
  const fullName = String(player.full_name ?? player.name ?? '').trim();
  if (fullName) {
    const parts = fullName.split(/\s+/);
    if (parts.length >= 2) {
      const [firstName, ...rest] = parts;
      const lastName = rest.join(' ');
      if (firstName && lastName) {
        return `${firstName.charAt(0).toUpperCase()}. ${lastName}`;
      }
    }
  }
  return resolvePlayerName(player);
}

function formatMatchupDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function normalizeId(value) {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

function getMatchupKey(entity = {}) {
  const candidates = [
    entity.id,
    entity.game_id,
    entity.gameId,
    entity.matchup_id,
    entity.matchupId,
    entity.market_id,
    entity.marketId,
    entity.external_id,
    entity.externalId,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeId(candidate);
    if (normalized) return normalized;
  }
  return null;
}

function toArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  if (payload && typeof payload === 'object' && Array.isArray(payload.results)) return payload.results;
  return [];
}

function resolveLatestStat(statsList) {
  const stats = Array.isArray(statsList) ? statsList : [];
  if (!stats.length) return null;
  return stats.reduce((latest, current) => {
    const latestDate = latest?.created_at ? new Date(latest.created_at).getTime() : null;
    const currentDate = current?.created_at ? new Date(current.created_at).getTime() : null;
    if (latestDate !== null && currentDate !== null) {
      return currentDate > latestDate ? current : latest;
    }
    const latestId = Number(latest?.game_id ?? latest?.id ?? 0);
    const currentId = Number(current?.game_id ?? current?.id ?? 0);
    return currentId > latestId ? current : latest;
  });
}

function resolveMarketObject(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const candidate = entry.market ?? entry.markets ?? null;
  if (candidate && typeof candidate === 'object') {
    return candidate;
  }
  if (
    entry.handicap !== undefined ||
    entry.points !== undefined ||
    entry.total_points !== undefined
  ) {
    return entry;
  }
  return null;
}

function computeSignedHandicap(teamId, rawLine, favoriteTeamId) {
  const numeric = parseNumeric(rawLine);
  if (numeric === null) return null;
  const normalizedTeamId = normalizeId(teamId);
  const normalizedFavoriteId = normalizeId(favoriteTeamId);
  if (!normalizedTeamId || !normalizedFavoriteId) return numeric;
  const absolute = Math.abs(numeric);
  return normalizedTeamId === normalizedFavoriteId ? -absolute : absolute;
}

function parseNumeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatMarketValue(value) {
  if (value === null || value === undefined || value === '') return '-';
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
  }
  return String(value);
}

function formatLastFiveText(lastFive) {
  if (!lastFive || !lastFive.total) return null;
  return `(${lastFive.success}/${lastFive.total})`;
}

function resolveLastFiveClass(lastFive) {
  if (!lastFive || !lastFive.total) return 'pick-list__last-five--neutral';
  const success = Number(lastFive.success ?? 0);
  const total = Number(lastFive.total ?? 0);
  const half = total / 2;
  if (success > half) return 'pick-list__last-five--positive';
  if (success < half) return 'pick-list__last-five--negative';
  return 'pick-list__last-five--neutral';
}

function computeLastFive(statsList, key, targetValue) {
  if (targetValue === null || targetValue === undefined) return null;
  const stats = Array.isArray(statsList) ? statsList : [];
  if (!stats.length) return null;
  const recent = stats.slice(0, 5);
  if (!recent.length) return null;
  let success = 0;
  recent.forEach((stat) => {
    const statValue = parseNumeric(stat?.[key]);
    if (statValue !== null && statValue >= targetValue) {
      success += 1;
    }
  });
  return { success, total: recent.length };
}

function createPickEntryId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildTeamPickKey(teamId, label, value) {
  const normalizedLabel = label ?? 'market';
  const normalizedValue = value ?? '';
  return `team:${teamId ?? 'unknown'}:${normalizedLabel}:${normalizedValue}`;
}

function buildPlayerPickKey(teamId, playerId, sectionKey, statKey) {
  return `player:${teamId ?? 'unknown'}:${playerId ?? 'unknown'}:${sectionKey ?? 'section'}:${statKey ?? 'stat'}`;
}

function addPickEntry(entry) {
  if (!entry || !entry.key) return;
  const exists = pickList.value.some((item) => item.key === entry.key);
  if (exists) return;
  pickList.value = [...pickList.value, entry];
}

function handleMarketPick(event, teamContext, market) {
  event?.stopPropagation?.();
  if (!teamContext || !market) return;
  const teamId = normalizeId(teamContext.id);
  const key = buildTeamPickKey(teamId, market.label, market.value);
  const entry = {
    id: createPickEntryId(),
    key,
    type: 'team',
    teamCode: teamContext.code,
    teamId,
    playerName: null,
    marketLabel: market.label ?? 'Market',
    value: market.value ?? '-',
    valueClass: 'pick-list__value--team',
    lastFiveText: '',
    lastFiveClass: '',
  };
  addPickEntry(entry);
}

function handlePlayerPick(event, teamContext, section, row, column) {
  event?.stopPropagation?.();
  if (!teamContext || !section || !row || !column) return;
  const metric = row.metrics?.[column.key];
  if (!metric) return;
  const teamId = normalizeId(teamContext.id);
  const statKey = column.statKey ?? column.key;
  const key = buildPlayerPickKey(teamId, row.id, section.key, statKey);
  const lastFive = metric.lastFive ?? null;
  const lastFiveText = formatLastFiveText(lastFive);
  const entry = {
    id: createPickEntryId(),
    key,
    type: 'player',
    teamCode: teamContext.code,
    teamId,
    playerId: row.id,
    sectionKey: section.key,
    statKey,
    playerName: row.name,
    marketLabel: `${section.label.toUpperCase()} ${column.label.toUpperCase()}`,
    value: metric.value ?? '-',
    valueClass: 'pick-list__value--player',
    lastFiveText: lastFiveText ?? '',
    lastFiveClass: resolveLastFiveClass(lastFive),
  };
  addPickEntry(entry);
}

function togglePickList() {
  if (!pickList.value.length) return;
  isPickListOpen.value = !isPickListOpen.value;
}

function closePickList() {
  isPickListOpen.value = false;
}

function handlePickEntryRemove(entry) {
  if (!entry?.key) return;
  pickList.value = pickList.value.filter((item) => item.key !== entry.key);
  if (!pickList.value.length) {
    isPickListOpen.value = false;
  }
}

function handlePickEntrySelect() {
  // Placeholder for future interactions when selecting a pick list entry.
}

function openTeamModal(team) {
  const teamId = normalizeId(team?.id);
  if (!teamId) return;
  const primary = Array.isArray(team?.markets?.primary) ? team.markets.primary : [];
  const secondary = Array.isArray(team?.markets?.secondary) ? team.markets.secondary : [];
  teamModalState.value = {
    visible: true,
    teamId,
    teamName: team?.name ?? '',
    markets: [...primary, ...secondary],
  };
}

function closeTeamModal() {
  teamModalState.value = {
    visible: false,
    teamId: null,
    teamName: '',
    markets: [],
  };
}

function openPlayerModal(teamContext, playerRow) {
  if (!playerRow?.id) return;
  const playerId = normalizeId(playerRow.id);
  if (!playerId) return;

  const teamId = normalizeId(playerRow.teamId ?? teamContext?.id);
  const baselineStats = Array.isArray(playerRow.stats) ? playerRow.stats : [];
  const teamCode = resolveTeamCode(teamContext);
  const opponentCode = teamContext?.opponentCode ?? '';
  const marketSnapshot = playerRow.market ?? {};

  playerModalState.value = {
    visible: true,
    playerId,
    teamId,
    teamCode,
    opponentCode,
    playerName: playerRow.fullName ?? playerRow.name ?? `Jugador ${playerId}`,
    playerPosition: playerRow.position ?? '',
    market: marketSnapshot,
    initialStats: baselineStats,
  };
}

function closePlayerModal() {
  playerModalState.value = {
    visible: false,
    playerId: null,
    teamId: null,
    teamCode: '',
    opponentCode: '',
    playerName: '',
    playerPosition: '',
    market: {},
    initialStats: [],
  };
}
</script>

<template>
  <div class="nba-view">
    <header class="page-header">
      <h1 class="page-title">NBA Matchups &amp; Markets</h1>
      <p class="page-subtitle">Líneas de equipos y jugadores para los enfrentamientos del día.</p>
    </header>

    <div v-if="loading" class="status-message status-message--loading">Cargando datos...</div>
    <div v-else-if="errorMessage" class="status-message status-message--error">{{ errorMessage }}</div>

    <section v-else-if="isLoaded && matchups.length" class="matchups-grid">
      <article v-for="matchup in matchups" :key="matchup.id" class="matchup-card">
        <header class="matchup-header">
          <h2 class="matchup-code">
            {{ matchup.awayTeam.code }} VS {{ matchup.homeTeam.code }}
          </h2>
          <p class="matchup-date">{{ matchup.displayDate }}</p>
        </header>

        <div class="teams-wrapper">
          <section v-for="team in [matchup.awayTeam, matchup.homeTeam]" :key="team.id" class="team-panel">
            <header class="team-heading">
              <h2 class="team-name">{{ team.name }}</h2>
              <div v-if="team.recordInfo.columns.length" class="team-summary">
                <table class="team-summary-table">
                  <thead>
                    <tr>
                      <th v-for="column in team.recordInfo.columns" :key="`summary-head-${column.key}`">
                        {{ column.header }}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td
                        v-for="column in team.recordInfo.columns"
                        :key="`summary-value-${column.key}`"
                        :class="['team-record', `team-record--${column.state}`]"
                      >
                        {{ column.text }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </header>

            <div class="team-section">
              <h3>Markets</h3>
              <div v-if="team.markets.primary.length || team.markets.secondary.length" class="market-block">
                <div
                  v-if="team.markets.primary.length"
                  class="market-table-wrapper team-market-trigger"
                  @click="openTeamModal(team)"
                >
                  <table class="market-table">
                    <thead>
                      <tr>
                        <th v-for="market in team.markets.primary" :key="`primary-label-${market.label}`">
                          {{ market.label }}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td
                          v-for="market in team.markets.primary"
                          :key="`primary-value-${market.label}`"
                          @contextmenu.prevent="handleMarketPick($event, team, market)"
                        >
                          <span class="market-value">{{ market.value }}</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div
                  v-if="team.markets.secondary.length"
                  class="market-table-wrapper team-market-trigger"
                  @click="openTeamModal(team)"
                >
                  <table class="market-table market-table--secondary">
                    <thead>
                      <tr>
                        <th v-for="market in team.markets.secondary" :key="`secondary-label-${market.label}`">
                          {{ market.label }}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td
                          v-for="market in team.markets.secondary"
                          :key="`secondary-value-${market.label}`"
                          @contextmenu.prevent="handleMarketPick($event, team, market)"
                        >
                          <span class="market-value">{{ market.value }}</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <p v-else class="team-placeholder">Sin mercados disponibles.</p>
            </div>

            <div class="team-section">
              <h3>Offense</h3>
              <div v-if="team.offenseRanks.length" class="rank-table-wrapper">
                <table class="rank-table">
                  <thead>
                    <tr>
                      <th v-for="rank in team.offenseRanks" :key="`offense-${rank.label}`">{{ rank.label }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td v-for="rank in team.offenseRanks" :key="`offense-val-${rank.label}`">
                        <span class="rank-value">{{ formatMarketValue(rank.value) }}</span>
                        <span v-if="rank.rank" class="rank-meta">#{{ rank.rank }}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-else class="team-placeholder">Sin métricas ofensivas.</p>
            </div>

            <div class="team-section">
              <h3>Opponent Defense</h3>
              <div v-if="team.opponentDefenseRanks.length" class="rank-table-wrapper">
                <table class="rank-table">
                  <thead>
                    <tr>
                      <th v-for="rank in team.opponentDefenseRanks" :key="`defense-${rank.label}`">
                        {{ rank.label }}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td v-for="rank in team.opponentDefenseRanks" :key="`defense-val-${rank.label}`">
                        <span class="rank-value">{{ formatMarketValue(rank.value) }}</span>
                        <span v-if="rank.rank" class="rank-meta">#{{ rank.rank }}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-else class="team-placeholder">Sin métricas defensivas del rival.</p>
            </div>

            <div class="team-section">
              <h3>Players</h3>
              <p class="section-helper">Haz clic derecho sobre una línea para agregarla a tus picks.</p>
              <p
                v-if="team.playerSectionsLayout === 'lineups'"
                class="section-helper section-helper--note"
              >
                Lineups activos: se muestran titulares y banca reportados.
              </p>
              <p
                v-else
                class="section-helper section-helper--note"
              >
                Sin lineups confirmados: se lista la plantilla completa desde los mercados.
              </p>
              <div v-if="team.playerSections.length" class="player-sections">
                <section v-for="section in team.playerSections" :key="section.key" class="players-table-wrapper">
                  <header class="players-section-header">{{ section.label }}</header>
                  <table class="players-table">
                    <thead>
                      <tr>
                        <th v-for="column in section.columns" :key="`head-${section.key}-${column.key}`">
                          {{ column.label }}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="row in section.rows"
                        :key="`row-${section.key}-${row.id}`"
                        class="player-row"
                        @click="openPlayerModal(team, row)"
                      >
                        <td v-for="column in section.columns" :key="`cell-${section.key}-${row.id}-${column.key}`">
                          <template v-if="column.key === 'name'">
                            <span class="player-name" :title="row.fullName ?? row.name">
                              {{ row.name }}
                            </span>
                          </template>
                          <template v-else>
                            <div
                              class="stat-cell"
                              @contextmenu.prevent="handlePlayerPick($event, team, section, row, column)"
                            >
                              <span class="stat-value">{{ row.metrics[column.key]?.value ?? '-' }}</span>
                              <span
                                v-if="row.metrics[column.key]?.lastFive"
                                :class="['stat-last-five', resolveLastFiveClass(row.metrics[column.key]?.lastFive)]"
                              >
                                {{ formatLastFiveText(row.metrics[column.key]?.lastFive) }}
                              </span>
                            </div>
                          </template>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </section>
              </div>
              <p v-else class="team-placeholder">Sin jugadores con mercados activos.</p>

              <div v-if="team.injuries.length" class="injury-list">
                <header class="injury-header">Injuries</header>
                <ul class="injury-items">
                  <li v-for="injury in team.injuries" :key="`injury-${injury.id}`" class="injury-item">
                    <span class="injury-name">{{ injury.name }}</span>
                    <span class="injury-status">{{ injury.status }}</span>
                  </li>
                </ul>
              </div>
            </div>
          </section>
        </div>
      </article>
    </section>

    <div v-else-if="isLoaded" class="status-message">No hay matchups disponibles.</div>

    <PickList
      :items="pickList"
      :count="pickList.length"
      :open="isPickListOpen"
      @toggle="togglePickList"
      @close="closePickList"
      @select="handlePickEntrySelect"
      @remove="handlePickEntryRemove"
    />

    <transition name="modal-fade">
      <NbaPlayerStatsModal
        v-if="playerModalState.visible"
        :visible="playerModalState.visible"
        :player-id="playerModalState.playerId"
        :team-id="playerModalState.teamId"
        :team-code="playerModalState.teamCode"
        :opponent-code="playerModalState.opponentCode"
        :player-name="playerModalState.playerName"
        :player-position="playerModalState.playerPosition"
        :market="playerModalState.market"
        :initial-stats="playerModalState.initialStats"
        @close="closePlayerModal"
      />
    </transition>

    <transition name="modal-fade">
      <NbaTeamStatsModal
        v-if="teamModalState.visible"
        :visible="teamModalState.visible"
        :team-id="teamModalState.teamId"
        :team-name="teamModalState.teamName"
        :markets="teamModalState.markets"
        @close="closeTeamModal"
      />
    </transition>
  </div>
</template>

<style scoped>
:global(body) {
  background-color: #0f172a;
  color: #e2e8f0;
  font-family: 'Inter', sans-serif;
}

.nba-view {
  max-width: 1200px;
  margin: 0 auto;
  padding: 32px 16px 64px;
}

.page-header {
  margin-bottom: 24px;
}

.page-title {
  margin: 0;
  font-size: 28px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: #f1f5f9;
}

.page-subtitle {
  margin: 6px 0 0;
  font-size: 14px;
  color: #94a3b8;
}

.status-message {
  text-align: center;
  padding: 24px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(56, 189, 248, 0.12);
  color: #e2e8f0;
  margin-bottom: 24px;
}

.status-message--loading {
  color: #bae6fd;
}

.status-message--error {
  border-color: rgba(239, 68, 68, 0.45);
  color: #fecaca;
}

.matchups-grid {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.matchup-card {
  background: rgba(15, 23, 42, 0.75);
  border: 1px solid rgba(56, 189, 248, 0.18);
  border-radius: 20px;
  padding: 24px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.6);
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.matchup-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  text-align: center;
}

.matchup-code {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.matchup-date {
  margin: 0;
  font-size: 14px;
  color: #94a3b8;
}

.teams-wrapper {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px;
  align-items: start;
}

.team-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: rgba(30, 41, 59, 0.65);
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 16px;
  padding: 18px;
  box-shadow: 0 12px 28px rgba(2, 6, 23, 0.45);
}

.team-heading {
  display: flex;
  flex-direction: column;
  gap: 6px;
  text-align: center;
}

.team-name {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #38bdf8;
}

.team-summary {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin-top: 20px;
}

.team-summary-table {
  border-collapse: collapse;
  width: 100%;
  min-width: 160px;
  background: rgba(15, 23, 42, 0.45);
  border: 1px solid rgba(56, 189, 248, 0.12);
  border-radius: 10px;
  overflow: hidden;
  table-layout: fixed;
}

.team-summary-table th,
.team-summary-table td {
  padding: 6px 10px;
  font-size: 12px;
  text-align: center;
  color: #cbd5f5;
}

.team-summary-table th {
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  background: rgba(15, 23, 42, 0.55);
}

.team-record {
  font-weight: 700;
}

.team-record--positive {
  color: #22c55e;
}

.team-record--negative {
  color: #ef4444;
}

.team-record--neutral {
  color: #ffffff;
}

.team-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.team-section h3 {
  margin: 0;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #f8fafc;
  text-align: center;
}

.market-block {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.market-table-wrapper {
  overflow-x: auto;
}

.team-market-trigger {
  cursor: pointer;
  border-radius: 12px;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.team-market-trigger:hover {
  transform: translateY(-1px);
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.2);
}

.team-market-trigger:focus-visible {
  outline: 2px solid rgba(56, 189, 248, 0.8);
  outline-offset: 4px;
}

.market-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 260px;
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid rgba(56, 189, 248, 0.12);
  border-radius: 12px;
  table-layout: fixed;
}

.market-table thead {
  background: rgba(15, 23, 42, 0.65);
}

.market-table--secondary {
  background: rgba(15, 23, 42, 0.45);
}

.market-table th,
.market-table td {
  padding: 10px 12px;
  font-size: 12px;
  color: #cbd5f5;
  text-align: center;
  letter-spacing: 0.04em;
}

.market-table td {
  font-size: 14px;
  font-weight: 600;
  color: #facc15;
}

.market-value {
  font-weight: 600;
}

.rank-table-wrapper {
  overflow-x: auto;
}

.rank-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 240px;
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid rgba(56, 189, 248, 0.12);
  border-radius: 12px;
  table-layout: fixed;
}

.rank-table th {
  padding: 10px;
  font-size: 12px;
  text-align: center;
  color: #e2e8f0;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 700;
}

.rank-table td {
  padding: 10px;
  font-size: 12px;
  text-align: center;
  color: #cbd5f5;
}

.rank-value {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: #f8fafc;
}

.rank-meta {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: #60a5fa;
}

.player-sections {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.players-table-wrapper {
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid rgba(56, 189, 248, 0.12);
  border-radius: 12px;
  padding: 12px;
}

.players-section-header {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #f8fafc;
}

.players-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 0;
  background: rgba(15, 23, 42, 0.45);
  table-layout: fixed;
}

.players-table th,
.players-table td {
  padding: 10px 12px;
  font-size: 12px;
  text-align: center;
  color: #cbd5f5;
  border-bottom: 1px solid rgba(148, 163, 184, 0.08);
}

.players-table th {
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: rgba(15, 23, 42, 0.55);
}

.players-table th:first-child,
.players-table td:first-child {
  text-align: left;
  width: 36%;
}

.players-table th:not(:first-child),
.players-table td:not(:first-child) {
  width: calc((100% - 36%) / 5);
}

.player-row {
  cursor: pointer;
}

.player-row:nth-child(odd) {
  background: rgba(15, 23, 42, 0.35);
}

.player-row:hover {
  background: rgba(56, 189, 248, 0.08);
}

.player-name {
  font-weight: 600;
  color: #e0f2fe;
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.stat-cell {
  display: inline-flex;
  align-items: baseline;
  justify-content: center;
  gap: 6px;
  width: 100%;
}

.stat-value {
  font-weight: 600;
  color: #f1f5f9;
  cursor: context-menu;
}

.stat-last-five {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.section-helper {
  margin: 0;
  font-size: 12px;
  color: #64748b;
}

.section-helper--note {
  color: #94a3b8;
}

.team-placeholder {
  margin: 0;
  font-size: 13px;
  color: #94a3b8;
  font-style: italic;
}

.injury-list {
  margin-top: 12px;
  background: rgba(71, 85, 105, 0.2);
  border: 1px solid rgba(248, 113, 113, 0.35);
  border-radius: 12px;
  padding: 12px;
}

.injury-header {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #fecaca;
}

.injury-items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.injury-item {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #f8fafc;
}

.injury-name {
  font-weight: 600;
}

.injury-status {
  color: #fda4af;
}

.pick-list__last-five--positive,
.stat-last-five.pick-list__last-five--positive {
  color: #16a34a;
}

.pick-list__last-five--negative,
.stat-last-five.pick-list__last-five--negative {
  color: #dc2626;
}

.pick-list__last-five--neutral,
.stat-last-five.pick-list__last-five--neutral {
  color: #cbd5f5;
}

@media (max-width: 900px) {
  .teams-wrapper {
    grid-template-columns: 1fr;
  }
}
</style>

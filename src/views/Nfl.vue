<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import axios from 'axios';

import TeamStatsModal from '../components/TeamStatsModal.vue';
import PickList from '../components/PickList.vue';
import { buildNflApiUrl } from '../utils/nflApi';

const matchups = ref([]);
const isLoaded = ref(false);
const loading = ref(false);
const errorMessage = ref('');

const rawMatchupsData = ref([]);
const marketsByGameMap = ref(new Map());
const teamAverageMapRef = ref(new Map());
const playerInfoMapRef = ref(new Map());
const playerStatsCache = ref(new Map());
const pickList = ref([]);
const isPickListOpen = ref(false);

const modalVisible = ref(false);
const modalLoading = ref(false);
const modalError = ref('');
const modalPlayer = ref(null);
const modalSection = ref(null);
const modalStats = ref([]);

const modalTargetValues = ref({});
const modalSummary = ref(null);
const modalOpponentDefense = ref([]);
const modalOpponentLabel = ref('');

const teamModalVisible = ref(false);
const teamModalTeamId = ref(null);
const teamModalTeamName = ref('');
const teamModalMarkets = ref([]);

const MATCHUPS_URL = buildNflApiUrl('markets/matchups');
const MARKETS_URL = buildNflApiUrl('markets');
const TEAM_AVERAGES_URL = buildNflApiUrl('teams/stats/averages');
const PLAYER_STATS_URL = (playerId) => buildNflApiUrl(`players/${playerId}/stats`);

const PLAYER_SECTIONS_CONFIG = [
  {
    key: 'passing',
    label: 'Passing Players',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'passing_yards', label: 'Yards', statKey: 'passing_yards' },
      { key: 'pass_completions', label: 'Completes', statKey: 'pass_completions' },
      { key: 'pass_attempts', label: 'Attempts', statKey: 'pass_attempts' },
    ],
  },
  {
    key: 'rushing',
    label: 'Rushing Players',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'rushing_yards', label: 'Yards', statKey: 'rushing_yards' },
      { key: 'carries', label: 'Carries', statKey: 'carries' },
    ],
  },
  {
    key: 'receiving',
    label: 'Receiving Players',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'receiving_yards', label: 'Yards', statKey: 'receiving_yards' },
      { key: 'receptions', label: 'Receptions', statKey: 'receptions' },
    ],
  },
  {
    key: 'defensive',
    label: 'Defensive Players',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'tackles', label: 'Tackles', statKey: 'tackles' },
      { key: 'sacks', label: 'Sacks', statKey: 'sacks' },
    ],
  },
];

const MODAL_SUMMARY_DEFS = {
  passing: {
    columns: [
      { label: 'YARDS', key: 'passing_yards' },
      { label: 'COMPLETES', key: 'pass_completions' },
      { label: 'ATTEMPTS', key: 'pass_attempts' },
    ],
  },
  rushing: {
    columns: [
      { label: 'YARDS', key: 'rushing_yards' },
      { label: 'CARRIES', key: 'carries' },
    ],
  },
  receiving: {
    columns: [
      { label: 'YARDS', key: 'receiving_yards' },
      { label: 'RECEPTIONS', key: 'receptions' },
    ],
  },
  defensive: {
    columns: [
      { label: 'TACKLES', key: 'tackles' },
      { label: 'SACKS', key: 'sacks' },
    ],
  },
};

const modalStatColumns = computed(() => {
  const sectionKey = modalSection.value?.key;
  if (!sectionKey) return [];
  const definition = MODAL_SUMMARY_DEFS[sectionKey];
  if (!definition) return [];
  return definition.columns;
});

const OFFENSE_RANK_DEFS = [
  { label: 'Points', keys: ['points_total'], fallbackKey: 'points_total' },
  { label: 'Passing', keys: ['passing_yards'], fallbackKey: 'passing_yards' },
  { label: 'Rushing', keys: ['rushing_yards'], fallbackKey: 'rushing_yards' },
];

const DEFENSE_RANK_DEFS = [
  { label: 'Points', keys: ['points_total'], fallbackKey: 'points_total' },
  { label: 'Passing', keys: ['passing_yards'], fallbackKey: 'passing_yards' },
  { label: 'Rushing', keys: ['rushing_yards'], fallbackKey: 'rushing_yards' },
  { label: 'Receiving', keys: ['receiving_yards'], fallbackKey: 'receiving_yards' },
];

const SECTION_DEFENSE_CONFIG = {
  passing: { keys: ['Passing'] },
  rushing: { keys: ['Rushing'] },
  receiving: { keys: ['Receiving', 'Passing'] },
};

function toArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  if (payload && typeof payload === 'object' && Array.isArray(payload.results)) return payload.results;
  return [];
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

function resolvePlayerName(player = {}) {
  if (player.full_name) return player.full_name;
  const names = [player.first_name, player.last_name].filter(Boolean);
  if (names.length) return names.join(' ');
  if (player.name) return player.name;
  if (player.nickname) return player.nickname;
  return player.id ? `Jugador ${player.id}` : 'Jugador';
}

function readPlayerPosition(player = {}) {
  return player.position ?? player.pos ?? player.role ?? '-';
}

function formatNumber(value) {
  if (value === null || value === undefined || value === '-') return '-';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return Number.isInteger(numeric) ? numeric : Number(numeric.toFixed(1));
}

function parseNumeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function resolveMarketObject(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const candidate = entry.market ?? entry.markets ?? null;
  if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
    return candidate;
  }
  const possibleKeys = ['handicap', 'total_points', 'favorite_team_id'];
  if (possibleKeys.some((key) => entry[key] !== undefined)) {
    return entry;
  }
  return null;
}

function formatShortDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' });
}

function formatFullDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (num) => num.toString().padStart(2, '0');
  const day = pad(date.getUTCDate());
  const month = pad(date.getUTCMonth() + 1);
  const year = date.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

function resolveStatDate(stat) {
  const value = stat?.played_at ?? stat?.date ?? stat?.game_date ?? stat?.game?.played_at;
  return formatShortDate(value);
}

function resolveStatWeek(stat, index) {
  const candidates = [stat?.week, stat?.game_week, stat?.gameWeek, stat?.game?.week];
  for (const candidate of candidates) {
    if (candidate !== null && candidate !== undefined) return candidate;
  }
  return index + 1;
}

function resolveOpponentCode(stat) {
  const game = stat?.game ?? {};
  const teamId = normalizeId(stat?.team_id ?? stat?.teamId);
  const homeId = normalizeId(game.home_team_id ?? game.home_team?.id);
  const awayId = normalizeId(game.away_team_id ?? game.away_team?.id);

  if (teamId && homeId && teamId === homeId) {
    return game.away_team?.code ?? '-';
  }
  if (teamId && awayId && teamId === awayId) {
    return game.home_team?.code ?? '-';
  }
  return game.away_team?.code ?? game.home_team?.code ?? '-';
}

function determineModalResult(stat, columnKey) {
  const targetMap = modalTargetValues.value ?? {};
  const target = targetMap[columnKey];
  if (target === null || target === undefined) return null;
  const actual = parseNumeric(stat?.[columnKey]);
  if (actual === null) return null;
  return actual >= target;
}

function modalFieldMatchesTarget(columnKey) {
  const targetMap = modalTargetValues.value ?? {};
  return Object.prototype.hasOwnProperty.call(targetMap, columnKey);
}

function resolveModalCellClass(stat, columnKey) {
  if (!modalFieldMatchesTarget(columnKey)) return '';
  const result = determineModalResult(stat, columnKey);
  if (result === null) return '';
  return result ? 'stat-hit-text' : 'stat-miss-text';
}

function filterDefenseBySection(sectionKey, defenseList) {
  if (!Array.isArray(defenseList)) return [];
  const config = SECTION_DEFENSE_CONFIG[sectionKey];
  if (!config || !config.keys?.length) return defenseList;
  const filtered = defenseList.filter((entry) => config.keys.includes(entry.label));
  return filtered.length ? filtered : defenseList;
}


function readMetricValue(row, key) {
  const metric = row?.metrics?.[key];
  if (!metric) return '-';
  return metric.value ?? '-';
}

function buildModalSummary(section, row) {
  if (!section || !row) return null;
  const definition = MODAL_SUMMARY_DEFS[section.key];
  if (!definition) return null;
  const columns = definition.columns.map((column) => ({
    label: column.label,
    value: readMetricValue(row, column.key),
  }));
  return {
    title: 'MARKETS',
    columns,
  };
}

function formatMarketValue(value) {
  if (value === null || value === undefined || value === '') return '-';
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return Number.isInteger(numeric) ? numeric.toString() : numeric.toFixed(1);
  }
  return String(value);
}

function formatTeamName(team = {}) {
  const composed = [team.city, team.nickname ?? team.name].filter(Boolean).join(' ');
  return (
    team.display_name ??
    team.full_name ??
    team.name ??
    (composed ? composed : null) ??
    team.code ??
    'Equipo'
  );
}

function resolveTeamCode(team = {}) {
  return team.code ?? team.abbreviation ?? team.short_name ?? team.nickname ?? team.name ?? 'TEAM';
}

function buildTeamPickKey(teamId, market) {
  const label = market?.label ?? market?.shortLabel ?? 'market';
  const value = market?.value ?? market?.rawValue ?? market?.handicap ?? market?.total_points ?? '';
  return `team:${teamId ?? 'unknown'}:${label}:${value}`;
}

function buildPlayerPickKey(teamId, playerId, sectionKey, statKey) {
  return `player:${teamId ?? 'unknown'}:${playerId ?? 'unknown'}:${sectionKey ?? 'section'}:${statKey ?? 'stat'}`;
}

function computeSignedHandicap(teamId, rawLine, favoriteTeamId) {
  const normalizedTeamId = normalizeId(teamId);
  const normalizedFavoriteId = normalizeId(favoriteTeamId);
  const line = parseNumeric(rawLine);
  if (line === null) return null;
  if (!normalizedTeamId || !normalizedFavoriteId) return line;
  const absolute = Math.abs(line);
  return normalizedTeamId === normalizedFavoriteId ? -absolute : absolute;
}

function computeHandicapForTeam(teamId, marketEntry = {}) {
  const markets = resolveMarketObject(marketEntry);
  if (!markets) return null;
  const favoriteId = markets.favorite_team_id ?? marketEntry?.favorite_team_id;
  return computeSignedHandicap(teamId, markets.handicap, favoriteId);
}

function buildTeamMarkets(teamId, marketEntry) {
  const markets = resolveMarketObject(marketEntry);
  if (!markets) return [];
  const items = [];
  const handicap = computeHandicapForTeam(teamId, marketEntry);
  if (handicap !== null) {
    items.push({ label: 'Handicap', shortLabel: 'HC', value: formatMarketValue(handicap) });
  }
  if (markets.total_points !== null && markets.total_points !== undefined) {
    items.push({ label: 'Total Points', shortLabel: 'PTS', value: formatMarketValue(markets.total_points) });
  }
  if (markets.first_half_handicap !== null && markets.first_half_handicap !== undefined) {
    const firstHalfFavoriteId =
      markets.first_half_favorite_team_id ??
      marketEntry?.first_half_favorite_team_id ??
      markets.favorite_team_id ??
      marketEntry?.favorite_team_id;
    const firstHalfHandicap = computeSignedHandicap(teamId, markets.first_half_handicap, firstHalfFavoriteId);
    items.push({ label: 'H1 Handicap', shortLabel: 'H1 HC', value: formatMarketValue(firstHalfHandicap) });
  }
  if (markets.first_half_points !== null && markets.first_half_points !== undefined) {
    items.push({ label: 'H1 Total Points', shortLabel: 'H1 PTS', value: formatMarketValue(markets.first_half_points) });
  }
  const soloPoints = teamId === normalizeId(marketEntry.away_team_id)
    ? markets.away_team_solo_points
    : markets.home_team_solo_points;
  if (soloPoints !== null && soloPoints !== undefined) {
    items.push({ label: 'Solo Points', shortLabel: 'SOLO', value: formatMarketValue(soloPoints) });
  }
  return items;
}

function extractTeamAverages(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) {
    return payload.flatMap((entry) => {
      if (Array.isArray(entry?.teams)) return entry.teams;
      return entry ? [entry] : [];
    });
  }
  if (Array.isArray(payload?.teams)) return payload.teams;
  return [];
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

async function fetchPlayerStats(playerId) {
  if (!playerId) return null;
  try {
    const response = await axios.get(PLAYER_STATS_URL(playerId));
    const playerData = response.data ?? {};
    return {
      ...playerData,
      stats: toArray(playerData.stats),
    };
  } catch (error) {
    console.error('Unable to load player stats', playerId, error);
    throw error;
  }
}

function computeLastFive(statsList, key, targetValue) {
  const threshold = parseNumeric(targetValue);
  if (threshold === null) return null;
  if (!Array.isArray(statsList) || !statsList.length) return null;
  const sorted = [...statsList].sort((a, b) => {
    const aId = Number(a?.game_id ?? a?.gameId ?? 0);
    const bId = Number(b?.game_id ?? b?.gameId ?? 0);
    return bId - aId;
  });
  const recent = sorted.slice(0, 5);
  if (!recent.length) return null;
  let success = 0;
  recent.forEach((stat) => {
    const statValue = parseNumeric(stat?.[key]);
    if (statValue !== null && statValue >= threshold) success += 1;
  });
  return { success, total: recent.length };
}

function resolveLastFiveClass(lastFive) {
  const baseClass = 'stat-meta';
  if (!lastFive || !lastFive.total) return baseClass;
  const half = lastFive.total / 2;
  if (lastFive.success > half) return `${baseClass} stat-meta--positive`;
  if (lastFive.success < half) return `${baseClass} stat-meta--negative`;
  return baseClass;
}

function describeLastFive(lastFive) {
  if (!lastFive || !lastFive.total) return null;
  const success = Number(lastFive.success ?? 0);
  const total = Number(lastFive.total ?? 0);
  if (!total) return null;
  const half = total / 2;
  let trend = 'neutral';
  if (success > half) trend = 'positive';
  else if (success < half) trend = 'negative';
  return {
    text: `(${success}/${total})`,
    trend,
  };
}

function buildRankList(teamId, defs, averagesMap, branchKey) {
  const normalizedId = normalizeId(teamId);
  if (!normalizedId) return [];
  const averagesEntry = averagesMap.get(normalizedId) ?? {};
  const branch = averagesEntry[branchKey] ?? averagesEntry[branchKey === 'ofensive' ? 'offensive' : 'defensive'];
  return defs
    .map((definition) => {
      const averageData = definition.keys
        .map((key) => branch?.[key])
        .find((value) => value && (value.value !== undefined || value.rank !== undefined));
      const value = averageData?.value;
      if (value === null || value === undefined) return null;
      return {
        label: definition.label,
        value,
        rank: averageData?.rank ?? null,
      };
    })
    .filter(Boolean);
}

function buildPlayerSections(teamId, marketEntry, playerInfoMap, playerStatsMap) {
  if (!marketEntry) return [];
  const playerMarkets = toArray(marketEntry.player_markets);
  if (!playerMarkets.length) return [];
  const sections = PLAYER_SECTIONS_CONFIG.map((section) => ({
    key: section.key,
    label: section.label,
    columns: section.columns,
    rows: [],
  }));

  playerMarkets.forEach((market) => {
    const playerId = normalizeId(market.player_id);
    if (!playerId) return;
    const baseInfo = playerInfoMap.get(playerId) ?? {};
    const statsEntry = playerStatsMap.get(playerId) ?? {};
    const resolvedTeamId = normalizeId(
      baseInfo.team_id ??
      baseInfo.teamId ??
      statsEntry.team_id ??
      statsEntry.teamId
    );
    if (!teamId || resolvedTeamId !== teamId) return;

    const statsList = Array.isArray(statsEntry.stats)
      ? statsEntry.stats
      : Array.isArray(baseInfo.stats)
      ? baseInfo.stats
      : [];

    sections.forEach((section) => {
      const hasMetric = section.columns.some((column) => {
        if (!column.statKey) return false;
        const rawValue = market[column.statKey];
        return rawValue !== null && rawValue !== undefined && rawValue !== '';
      });
      if (!hasMetric) return;

      const metrics = {};
      section.columns.forEach((column) => {
        if (!column.statKey) return;
        const rawValue = market[column.statKey];
        const formatted = rawValue === null || rawValue === undefined || rawValue === ''
          ? '-'
          : formatMarketValue(rawValue);
        metrics[column.key] = {
          value: formatted,
          rawValue,
          lastFive: computeLastFive(statsList, column.statKey, rawValue),
          statKey: column.statKey,
        };
      });

      section.rows.push({
        id: playerId,
        name: resolvePlayerName({ ...baseInfo, ...statsEntry }),
        position: readPlayerPosition({ ...statsEntry, ...baseInfo }),
        teamId,
        metrics,
      });
    });
  });

  return sections.filter((section) => section.rows.length);
}

function createPickEntryId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
  const teamId = normalizeId(teamContext.id ?? teamContext.team_id ?? teamContext.teamId);
  const key = buildTeamPickKey(teamId, market);
  const entry = {
    id: createPickEntryId(),
    key,
    type: 'team',
    teamCode: resolveTeamCode(teamContext),
    teamId,
    playerName: null,
    marketLabel: market.label ?? market.shortLabel ?? 'Market',
    value: market.value ?? '-',
    valueClass: 'pick-list__value--team',
    lastFiveText: '',
    lastFiveClass: '',
  };
  addPickEntry(entry);
}

function handlePlayerPick(event, teamContext, section, row, column) {
  event?.stopPropagation?.();
  if (!row || !column || !teamContext) return;
  const metric = row.metrics?.[column.key];
  if (!metric) return;
  const lastFiveMeta = describeLastFive(metric.lastFive);
  const sectionLabel = typeof section?.key === 'string' ? section.key.toUpperCase() : '';
  const columnLabelSource = column.label ?? column.key;
  const columnLabel = columnLabelSource ? String(columnLabelSource).toUpperCase() : '';
  const marketLabel = [sectionLabel, columnLabel].filter(Boolean).join(' ').trim();
  const teamId = normalizeId(teamContext.id ?? teamContext.team_id ?? teamContext.teamId);
  const playerId = normalizeId(row.id);
  const statKey = column.statKey ?? column.key;
  const key = buildPlayerPickKey(teamId, playerId, section?.key ?? null, statKey);
  const entry = {
    id: createPickEntryId(),
    key,
    type: 'player',
    teamCode: resolveTeamCode(teamContext),
    teamId,
    playerId,
    sectionKey: section?.key ?? null,
    statKey,
    playerName: row.name ?? null,
    marketLabel: marketLabel || columnLabelSource || 'STAT',
    value: metric.value ?? '-',
    valueClass: 'pick-list__value--player',
    lastFiveText: lastFiveMeta?.text ?? '',
    lastFiveClass: lastFiveMeta ? `pick-list__last-five--${lastFiveMeta.trend}` : '',
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

function findTeamSectionRow(teamId, sectionKey, playerId) {
  const normalizedTeamId = normalizeId(teamId);
  if (!normalizedTeamId) return null;
  for (const matchup of matchups.value) {
    const teams = [matchup.away_team, matchup.home_team];
    for (const team of teams) {
      if (!team) continue;
      if (normalizeId(team.id) !== normalizedTeamId) continue;
      if (!sectionKey) {
        return { team };
      }
      const section = team.playerSections?.find((item) => item.key === sectionKey);
      if (!section) return { team };
      if (!playerId) {
        return { team, section };
      }
      const normalizedPlayerId = normalizeId(playerId);
      const row = section.rows?.find((entry) => normalizeId(entry.id) === normalizedPlayerId);
      if (!row) {
        return { team, section };
      }
      return { team, section, row };
    }
  }
  return null;
}

function handlePickEntrySelect(entry) {
  if (!entry) return;
  if (entry.type === 'player') {
    const located = findTeamSectionRow(entry.teamId, entry.sectionKey, entry.playerId);
    if (!located || !located.team || !located.section || !located.row) {
      console.warn('Unable to resolve pick entry for modal', entry);
      return;
    }
    handlePlayerClick(located.row, located.section, located.team);
  } else if (entry.type === 'team') {
    const located = findTeamSectionRow(entry.teamId, null, null);
    if (!located || !located.team) {
      console.warn('Unable to resolve team pick entry', entry);
      return;
    }
    openTeamStatsModal(located.team);
  }
}

function buildEnrichedTeam(rawTeam, marketEntry, averagesMap, playerInfoMap, playerStatsMap, opponentTeam) {
  const teamId = normalizeId(rawTeam?.id ?? rawTeam?.team_id ?? rawTeam?.teamId);
  const opponentId = normalizeId(opponentTeam?.id ?? opponentTeam?.team_id ?? opponentTeam?.teamId);
  return {
    ...rawTeam,
    id: teamId,
    display_name: formatTeamName(rawTeam),
    markets: buildTeamMarkets(teamId, marketEntry),
    offenseRanks: buildRankList(teamId, OFFENSE_RANK_DEFS, averagesMap, 'ofensive'),
    opponentDefenseRanks: buildRankList(opponentId, DEFENSE_RANK_DEFS, averagesMap, 'defensive'),
    playerSections: buildPlayerSections(teamId, marketEntry, playerInfoMap, playerStatsMap),
    opponent_display_name: opponentTeam ? formatTeamName(opponentTeam) : null,
    opponent_code: opponentTeam?.code ?? opponentTeam?.abbreviation ?? null,
  };
}

function enrichMatchups(rawMatchups, marketsByGame, averagesMap, playerInfoMap, playerStatsMap) {
  return rawMatchups.map((rawMatchup) => {
    const matchupKey = getMatchupKey(rawMatchup) ?? normalizeId(rawMatchup.matchup_id);
    const marketEntry = marketsByGame.get(matchupKey) ?? marketsByGame.get(normalizeId(rawMatchup.market_id)) ?? null;
    const homeTeamId = normalizeId(rawMatchup.home_team_id ?? rawMatchup.home_team?.id);
    const awayTeamId = normalizeId(rawMatchup.away_team_id ?? rawMatchup.away_team?.id);
    const scheduledAt = rawMatchup.scheduled_at ?? rawMatchup.played_at ?? rawMatchup.date;
    const homeTeam = buildEnrichedTeam(
      rawMatchup.home_team ?? {},
      marketEntry,
      averagesMap,
      playerInfoMap,
      playerStatsMap,
      rawMatchup.away_team ?? {}
    );
    const awayTeam = buildEnrichedTeam(
      rawMatchup.away_team ?? {},
      marketEntry,
      averagesMap,
      playerInfoMap,
      playerStatsMap,
      rawMatchup.home_team ?? {}
    );
    return {
      ...rawMatchup,
      id: matchupKey ?? normalizeId(rawMatchup.id),
      scheduled_at: scheduledAt,
      scheduled_display: formatFullDateTime(scheduledAt),
      home_team: homeTeam,
      away_team: awayTeam,
    };
  });
}

function rebuildMatchups() {
  matchups.value = enrichMatchups(
    rawMatchupsData.value,
    marketsByGameMap.value,
    teamAverageMapRef.value,
    playerInfoMapRef.value,
    playerStatsCache.value
  );
}

async function loadMatchups() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const matchupsResponse = await axios.get(MATCHUPS_URL);
    const rawMatchups = toArray(matchupsResponse.data ?? matchupsResponse);

    const marketsResponse = await axios.get(MARKETS_URL);
    const rawMarkets = toArray(marketsResponse.data ?? marketsResponse);

    const averagesResponse = await axios.get(TEAM_AVERAGES_URL);
    const teamAverageEntries = extractTeamAverages(averagesResponse.data ?? averagesResponse);
    const teamAverageMap = buildTeamAverageMap(teamAverageEntries);

    const playerInfoMap = new Map();

    rawMatchups.forEach((matchup) => {
      const homeTeamId = normalizeId(matchup.home_team_id ?? matchup.home_team?.id);
      const awayTeamId = normalizeId(matchup.away_team_id ?? matchup.away_team?.id);

      toArray(matchup.home_team?.players).forEach((player) => {
        const playerId = normalizeId(player?.id ?? player?.player_id);
        if (!playerId) return;
        playerInfoMap.set(playerId, { ...player, team_id: homeTeamId });
      });

      toArray(matchup.away_team?.players).forEach((player) => {
        const playerId = normalizeId(player?.id ?? player?.player_id);
        if (!playerId) return;
        playerInfoMap.set(playerId, { ...player, team_id: awayTeamId });
      });
    });

    const marketsByGame = new Map();
    rawMarkets.forEach((entry) => {
      const key = getMatchupKey(entry);
      if (key) marketsByGame.set(key, entry);

      toArray(entry.player_markets).forEach((playerMarket) => {
        const playerId = normalizeId(playerMarket.player_id);
        if (!playerId) return;
        if (!playerInfoMap.has(playerId)) {
          playerInfoMap.set(playerId, { id: playerId });
        }
      });
    });

    rawMatchupsData.value = rawMatchups;
    marketsByGameMap.value = marketsByGame;
    teamAverageMapRef.value = teamAverageMap;
    playerInfoMapRef.value = playerInfoMap;
    playerStatsCache.value = new Map();

    rebuildMatchups();
  } catch (error) {
    console.error('Unable to load NFL data', error);
    matchups.value = [];
    errorMessage.value = 'No se pudo cargar la información de la NFL. Intenta nuevamente más tarde.';
  } finally {
    isLoaded.value = true;
    loading.value = false;
  }
}

onMounted(() => {
  loadMatchups();
  window.addEventListener('keydown', handleGlobalKeydown);
});

async function ensurePlayerStats(playerId) {
  if (!playerId) return null;
  if (playerStatsCache.value.has(playerId)) {
    return playerStatsCache.value.get(playerId);
  }
  const statsEntry = await fetchPlayerStats(playerId);
  if (!statsEntry) return null;
  playerStatsCache.value.set(playerId, statsEntry);
  const existingInfo = playerInfoMapRef.value.get(playerId) ?? {};
  playerInfoMapRef.value.set(playerId, { ...existingInfo, ...statsEntry });
  return statsEntry;
}

function applyPlayerStatsToRow(playerId, statsEntry) {
  if (!playerId || !statsEntry) return;
  const statsList = Array.isArray(statsEntry.stats) ? statsEntry.stats : [];
  matchups.value.forEach((matchup) => {
    [matchup.away_team, matchup.home_team].forEach((team) => {
      if (!team?.playerSections) return;
      team.playerSections.forEach((section) => {
        section.rows.forEach((row) => {
          if (row.id !== playerId) return;
          const baseInfo = playerInfoMapRef.value.get(playerId) ?? {};
          row.name = resolvePlayerName({ ...baseInfo, ...statsEntry });
          row.position = readPlayerPosition({ ...statsEntry, ...baseInfo });
          section.columns.forEach((column) => {
            if (!column.statKey) return;
            const metric = row.metrics?.[column.key];
            if (!metric) return;
            metric.lastFive = computeLastFive(statsList, column.statKey, metric.rawValue);
          });
        });
      });
    });
  });
}

function handlePlayerClick(row, section, teamContext) {
  void openPlayerModal(row, section, teamContext);
}

async function openPlayerModal(row, section, teamContext) {
  if (!row?.id) return;
  modalVisible.value = true;
  modalLoading.value = true;
  modalError.value = '';
  modalSection.value = section
    ? { key: section.key, label: section.label, columns: section.columns }
    : null;
  modalStats.value = [];
  modalTargetValues.value = {};
  modalSummary.value = buildModalSummary(section, row);
  const rawDefense = Array.isArray(teamContext?.opponentDefenseRanks)
    ? teamContext.opponentDefenseRanks.map((entry) => ({ ...entry }))
    : [];
  const opponentNameRaw = teamContext?.opponent_code ?? teamContext?.opponent_display_name ?? 'Opponent';
  const opponentName = typeof opponentNameRaw === 'string' ? opponentNameRaw.toUpperCase() : 'OPPONENT';
  modalOpponentDefense.value = filterDefenseBySection(section?.key, rawDefense);
  modalOpponentLabel.value = `${opponentName} DEFENSIVE RANKS`;

  const baseInfo = playerInfoMapRef.value.get(row.id) ?? {};
  modalPlayer.value = {
    id: row.id,
    name: row.name ?? resolvePlayerName(baseInfo),
    position: row.position ?? readPlayerPosition(baseInfo),
    teamId: row.teamId,
  };

  const targetValues = {};
  Object.entries(row.metrics ?? {}).forEach(([key, metric]) => {
    if (!metric || !metric.statKey) return;
    const numeric = parseNumeric(metric.rawValue);
    if (numeric === null) return;
    targetValues[metric.statKey] = numeric;
  });
  modalTargetValues.value = targetValues;

  try {
    const statsEntry = await ensurePlayerStats(row.id);
    if (!statsEntry) {
      modalError.value = 'No se encontraron estadísticas para este jugador.';
      return;
    }
    applyPlayerStatsToRow(row.id, statsEntry);
    const combinedInfo = playerInfoMapRef.value.get(row.id) ?? {};
    const updatedInfo = { ...combinedInfo, ...statsEntry };
    modalPlayer.value = {
      id: row.id,
      name: resolvePlayerName(updatedInfo),
      position: readPlayerPosition(updatedInfo),
      teamId: row.teamId,
    };
    modalSummary.value = buildModalSummary(section, row);
    modalStats.value = Array.isArray(statsEntry.stats) ? statsEntry.stats : [];
  } catch (error) {
    modalError.value = 'No se pudieron cargar las estadísticas del jugador.';
  } finally {
    modalLoading.value = false;
  }
}

function handleGlobalKeydown(event) {
  if (event.key === 'Escape' || event.key === 'Esc') {
    if (isPickListOpen.value) {
      closePickList();
      return;
    }
    if (modalVisible.value) {
      closeModal();
    }
  }
}

function closeModal() {
  modalVisible.value = false;
  modalLoading.value = false;
  modalError.value = '';
  modalPlayer.value = null;
  modalSection.value = null;
  modalStats.value = [];
  modalTargetValues.value = {};
  modalSummary.value = null;
  modalOpponentDefense.value = [];
  modalOpponentLabel.value = '';
}

function openTeamStatsModal(team) {
  const teamId = normalizeId(team?.id ?? team?.team_id ?? team?.teamId);
  if (!teamId) return;
  teamModalTeamId.value = teamId;
  teamModalTeamName.value = formatTeamName(team ?? {});
  teamModalMarkets.value = Array.isArray(team?.markets) ? team.markets : [];
  teamModalVisible.value = true;
}

function closeTeamStatsModal() {
  teamModalVisible.value = false;
  teamModalMarkets.value = [];
}

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown);
});
</script>

<template>
  <div class="nfl-view">
    <h1 class="page-title">NFL Matchups &amp; Markets</h1>

    <div v-if="!isLoaded" class="status status-loading">
      {{ loading ? 'Cargando datos...' : 'Preparando datos...' }}
    </div>

    <div v-else>
      <div v-if="errorMessage" class="status status-error">
        {{ errorMessage }}
      </div>

      <div v-else-if="!matchups.length" class="status status-empty">
        No hay matchups disponibles por ahora.
      </div>

      <div v-else class="games-wrapper">
        <article
          v-for="matchup in matchups"
          :key="matchup.id ?? matchup.matchup_id ?? matchup.game_id"
          class="game-card"
        >
          <header class="game-header">
            <h2 class="game-title">
              {{ formatTeamName(matchup.away_team) }} vs {{ formatTeamName(matchup.home_team) }}
            </h2>
            <p v-if="matchup.scheduled_display || matchup.scheduled_at" class="game-meta">
              {{ matchup.scheduled_display || formatFullDateTime(matchup.scheduled_at) }}
            </p>
          </header>

          <div class="team-panels">
            <section class="team-panel">
              <h3 class="team-name">{{ formatTeamName(matchup.away_team) }}</h3>
              <p v-if="matchup.away_team?.record" class="team-meta">Record: {{ matchup.away_team.record }}</p>

              <div class="team-section">
                <h4>Mercados</h4>
                <div
                  v-if="matchup.away_team?.markets?.length"
                  class="market-table-wrapper team-market-trigger"
                  role="button"
                  tabindex="0"
                  @click="openTeamStatsModal(matchup.away_team)"
                  @keydown.enter.prevent="openTeamStatsModal(matchup.away_team)"
                  @keydown.space.prevent="openTeamStatsModal(matchup.away_team)"
                >
                  <table class="market-table">
                    <thead>
                      <tr>
                        <th
                          v-for="market in matchup.away_team.markets"
                          :key="`${market.label}-${market.value}`"
                          :title="market.label"
                        >
                          {{ market.shortLabel ?? market.label }}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td
                          v-for="market in matchup.away_team.markets"
                          :key="`${market.label}-${market.value}`"
                          @contextmenu.prevent="handleMarketPick($event, matchup.away_team, market)"
                        >
                          <span class="market-value">{{ market.value }}</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p v-else class="section-placeholder">No hay mercados disponibles.</p>
              </div>

              <div class="team-section">
                <h4>Offensive Ranks</h4>
                <div v-if="matchup.away_team?.offenseRanks?.length" class="rank-table-wrapper">
                  <table class="rank-table">
                    <thead>
                      <tr>
                        <th v-for="rank in matchup.away_team.offenseRanks" :key="rank.label">
                          {{ rank.label }}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td v-for="rank in matchup.away_team.offenseRanks" :key="rank.label">
                          <span class="rank-value">{{ formatNumber(rank.value) }}</span>
                          <span v-if="rank.rank" class="rank-meta">#{{ rank.rank }}</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p v-else class="section-placeholder">Sin datos ofensivos.</p>
              </div>

              <div class="team-section">
                <h4>Enemy Defensive Ranks</h4>
                <div v-if="matchup.away_team?.opponentDefenseRanks?.length" class="rank-table-wrapper">
                  <table class="rank-table">
                    <thead>
                      <tr>
                        <th v-for="rank in matchup.away_team.opponentDefenseRanks" :key="rank.label">
                          {{ rank.label }}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td v-for="rank in matchup.away_team.opponentDefenseRanks" :key="rank.label">
                          <span class="rank-value">{{ formatNumber(rank.value) }}</span>
                          <span v-if="rank.rank" class="rank-meta">#{{ rank.rank }}</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p v-else class="section-placeholder">Sin datos defensivos del rival.</p>
              </div>

              <div class="team-section">
                <h4>Jugadores</h4>
                <p class="section-helper">Haz clic sobre un jugador para ver sus estadísticas.</p>
                <div v-if="matchup.away_team?.playerSections?.length" class="player-sections">
                  <section
                    v-for="section in matchup.away_team.playerSections"
                    :key="section.key"
                    class="players-table-wrapper"
                  >
                    <header class="players-section-header">{{ section.label }}</header>
                    <table class="players-table">
                      <thead>
                        <tr>
                          <th v-for="column in section.columns" :key="column.key">{{ column.label }}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr
                          v-for="row in section.rows"
                          :key="row.id"
                          class="player-row"
                          @click="handlePlayerClick(row, section, matchup.away_team)"
                        >
                          <td v-for="column in section.columns" :key="column.key">
                            <template v-if="column.key === 'name'">
                              {{ row.name }}
                            </template>
                            <template v-else-if="column.key === 'position'">
                              {{ row.position }}
                            </template>
                            <template v-else>
                              <div
                                class="stat-cell"
                                @contextmenu.prevent="handlePlayerPick($event, matchup.away_team, section, row, column)"
                              >
                                <span class="stat-value">
                                  {{ row.metrics[column.key]?.value ?? '-' }}
                                  <span
                                    v-if="row.metrics[column.key]?.lastFive"
                                    :class="resolveLastFiveClass(row.metrics[column.key]?.lastFive)"
                                  >
                                    ({{ row.metrics[column.key].lastFive.success }}/{{ row.metrics[column.key].lastFive.total }})
                                  </span>
                                </span>
                              </div>
                            </template>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </section>
                </div>
                <p v-else class="section-placeholder">Sin información de jugadores.</p>
              </div>
            </section>

            <section class="team-panel">
              <h3 class="team-name">{{ formatTeamName(matchup.home_team) }}</h3>
              <p v-if="matchup.home_team?.record" class="team-meta">Record: {{ matchup.home_team.record }}</p>

              <div class="team-section">
                <h4>Mercados</h4>
                <div
                  v-if="matchup.home_team?.markets?.length"
                  class="market-table-wrapper team-market-trigger"
                  role="button"
                  tabindex="0"
                  @click="openTeamStatsModal(matchup.home_team)"
                  @keydown.enter.prevent="openTeamStatsModal(matchup.home_team)"
                  @keydown.space.prevent="openTeamStatsModal(matchup.home_team)"
                >
                  <table class="market-table">
                    <thead>
                      <tr>
                        <th
                          v-for="market in matchup.home_team.markets"
                          :key="`${market.label}-${market.value}`"
                          :title="market.label"
                        >
                          {{ market.shortLabel ?? market.label }}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td
                          v-for="market in matchup.home_team.markets"
                          :key="`${market.label}-${market.value}`"
                          @contextmenu.prevent="handleMarketPick($event, matchup.home_team, market)"
                        >
                          <span class="market-value">{{ market.value }}</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p v-else class="section-placeholder">No hay mercados disponibles.</p>
              </div>

              <div class="team-section">
                <h4>Offensive Ranks</h4>
                <div v-if="matchup.home_team?.offenseRanks?.length" class="rank-table-wrapper">
                  <table class="rank-table">
                    <thead>
                      <tr>
                        <th v-for="rank in matchup.home_team.offenseRanks" :key="rank.label">
                          {{ rank.label }}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td v-for="rank in matchup.home_team.offenseRanks" :key="rank.label">
                          <span class="rank-value">{{ formatNumber(rank.value) }}</span>
                          <span v-if="rank.rank" class="rank-meta">#{{ rank.rank }}</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p v-else class="section-placeholder">Sin datos ofensivos.</p>
              </div>

              <div class="team-section">
                <h4>Enemy Defensive Ranks</h4>
                <div v-if="matchup.home_team?.opponentDefenseRanks?.length" class="rank-table-wrapper">
                  <table class="rank-table">
                    <thead>
                      <tr>
                        <th v-for="rank in matchup.home_team.opponentDefenseRanks" :key="rank.label">
                          {{ rank.label }}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td v-for="rank in matchup.home_team.opponentDefenseRanks" :key="rank.label">
                          <span class="rank-value">{{ formatNumber(rank.value) }}</span>
                          <span v-if="rank.rank" class="rank-meta">#{{ rank.rank }}</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p v-else class="section-placeholder">Sin datos defensivos del rival.</p>
              </div>

              <div class="team-section">
                <h4>Jugadores</h4>
                <p class="section-helper">Haz clic sobre un jugador para ver sus estadísticas.</p>
                <div v-if="matchup.home_team?.playerSections?.length" class="player-sections">
                  <section
                    v-for="section in matchup.home_team.playerSections"
                    :key="section.key"
                    class="players-table-wrapper"
                  >
                    <header class="players-section-header">{{ section.label }}</header>
                    <table class="players-table">
                      <thead>
                        <tr>
                          <th v-for="column in section.columns" :key="column.key">{{ column.label }}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr
                          v-for="row in section.rows"
                          :key="row.id"
                          class="player-row"
                          @click="handlePlayerClick(row, section, matchup.home_team)"
                        >
                          <td v-for="column in section.columns" :key="column.key">
                            <template v-if="column.key === 'name'">
                              {{ row.name }}
                            </template>
                            <template v-else-if="column.key === 'position'">
                              {{ row.position }}
                            </template>
                            <template v-else>
                              <div
                                class="stat-cell"
                                @contextmenu.prevent="handlePlayerPick($event, matchup.home_team, section, row, column)"
                              >
                                <span class="stat-value">
                                  {{ row.metrics[column.key]?.value ?? '-' }}
                                  <span
                                    v-if="row.metrics[column.key]?.lastFive"
                                    :class="resolveLastFiveClass(row.metrics[column.key]?.lastFive)"
                                  >
                                    ({{ row.metrics[column.key].lastFive.success }}/{{ row.metrics[column.key].lastFive.total }})
                                  </span>
                                </span>
                              </div>
                            </template>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </section>
                </div>
                <p v-else class="section-placeholder">Sin información de jugadores.</p>
              </div>
            </section>
          </div>
        </article>
      </div>
    </div>
  </div>

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
    <div
      v-if="modalVisible"
      class="player-modal-overlay"
      @click.self="closeModal"
    >
      <div class="player-modal">
        <header class="player-modal-header">
          <div class="player-modal-heading">
            <h3 class="player-modal-title">{{ modalPlayer?.name ?? 'Jugador' }}</h3>
            <p v-if="modalPlayer?.position" class="player-modal-subtitle">
              Posición: {{ modalPlayer.position }}
            </p>
          </div>
          <button type="button" class="modal-close-button" @click="closeModal">×</button>
        </header>

        <section class="player-modal-body">
          <div v-if="modalLoading" class="modal-status">Cargando estadísticas...</div>
          <div v-else-if="modalError" class="modal-status modal-status-error">{{ modalError }}</div>
          <div v-else class="modal-stats-wrapper">
            <div
              v-if="modalSummary || (modalOpponentDefense && modalOpponentDefense.length)"
              class="modal-summary-row"
            >
              <section v-if="modalOpponentDefense && modalOpponentDefense.length" class="modal-summary-card">
                <header class="modal-summary-title">{{ modalOpponentLabel }}</header>
                <table class="modal-summary-table rank-table modal-summary-table--defense">
                  <thead>
                    <tr>
                      <th v-for="entry in modalOpponentDefense" :key="entry.label">
                        {{ entry.label?.toUpperCase?.() ?? entry.label }}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td v-for="entry in modalOpponentDefense" :key="`${entry.label}-value`">
                        <span class="rank-value">{{ formatNumber(entry.value) }}</span>
                        <span v-if="entry.rank" class="rank-meta">#{{ entry.rank }}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </section>

              <section v-if="modalSummary" class="modal-summary-card">
                <header class="modal-summary-title">{{ modalSummary.title }}</header>
                <table class="modal-summary-table">
                  <thead>
                    <tr>
                      <th v-for="column in modalSummary.columns" :key="column.label">
                        {{ column.label }}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td v-for="column in modalSummary.columns" :key="`${column.label}-value`">
                        {{ column.value }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </section>
            </div>

            <h4 v-if="modalSection?.label" class="modal-section-title">{{ modalSection.label.toUpperCase() }}</h4>
            <p v-if="!modalStats.length" class="modal-status">Sin estadísticas recientes.</p>
            <div v-else class="modal-stats-table-wrapper">
              <table class="modal-stats-table">
                <thead>
                  <tr>
                    <th>WEEK</th>
                    <th>DATE</th>
                    <th>RIVAL</th>
                    <th v-for="column in modalStatColumns" :key="column.label">
                      {{ column.label }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(stat, index) in modalStats.slice(0, 5)"
                    :key="stat.game_id ?? stat.gameId ?? stat.id ?? stat.date ?? index"
                  >
                    <td>{{ resolveStatWeek(stat, index) }}</td>
                    <td>{{ resolveStatDate(stat) }}</td>
                    <td>{{ resolveOpponentCode(stat) }}</td>
                    <td
                      v-for="column in modalStatColumns"
                      :key="`${column.key}-${index}`"
                    >
                      <span :class="resolveModalCellClass(stat, column.key)">
                        {{ formatNumber(stat?.[column.key]) ?? '-' }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  </transition>

  <transition name="modal-fade">
    <TeamStatsModal
      v-if="teamModalVisible"
      :visible="teamModalVisible"
      :team-id="teamModalTeamId"
      :team-name="teamModalTeamName"
      :markets="teamModalMarkets"
      @close="closeTeamStatsModal"
    />
  </transition>
</template>

<style scoped>
:global(body) {
  background-color: #0f172a;
  color: #e2e8f0;
  font-family: 'Inter', sans-serif;
}

.nfl-view {
  max-width: 1200px;
  margin: 0 auto;
  padding: 32px 16px 64px;
}

.page-title {
  font-size: 28px;
  font-weight: 600;
  margin-bottom: 24px;
  letter-spacing: 0.02em;
}

.status {
  text-align: center;
  padding: 24px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(56, 189, 248, 0.12);
  color: #e2e8f0;
  margin-bottom: 24px;
}

.status-error {
  border-color: rgba(239, 68, 68, 0.45);
  color: #fecaca;
}

.status-loading {
  color: #bae6fd;
}

.status-empty {
  color: #cbd5f5;
}

.games-wrapper {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.game-card {
  background: rgba(15, 23, 42, 0.75);
  border: 1px solid rgba(56, 189, 248, 0.18);
  border-radius: 20px;
  padding: 24px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.6);
}

.game-header {
  margin-bottom: 24px;
}

.game-title {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  color: #f1f5f9;
}

.game-meta {
  margin-top: 6px;
  color: #94a3b8;
  font-size: 14px;
}

.team-panels {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 24px;
  margin-bottom: 24px;
}

.team-panel {
  background: rgba(30, 41, 59, 0.65);
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 16px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.team-name {
  margin: 0;
  font-size: 18px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #38bdf8;
}

.team-meta {
  margin: 0;
  color: #94a3b8;
  font-size: 13px;
}

.team-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.team-section h4 {
  margin: 0;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #f8fafc;
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

.market-table th,
.market-table td {
  padding: 10px 12px;
  font-size: 12px;
  color: #cbd5f5;
  text-align: center;
  letter-spacing: 0.04em;
}

.market-table th {
  text-transform: uppercase;
  font-weight: 700;
}

.market-table td {
  font-size: 14px;
  color: #facc15;
  font-weight: 600;
}

.market-value {
  font-weight: 600;
  color: #facc15;
}

.rank-meta {
  margin-left: 6px;
  font-size: 11px;
  color: #38bdf8;
}

.rank-table-wrapper {
  overflow-x: auto;
}

.rank-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 260px;
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 10px;
  table-layout: fixed;
}

.rank-table thead {
  background: rgba(15, 23, 42, 0.65);
}

.rank-table th,
.rank-table td {
  padding: 10px 12px;
  letter-spacing: 0.02em;
  font-size: 12px;
  color: #cbd5f5;
  text-align: center;
}

.rank-table th {
  text-transform: uppercase;
  font-weight: 700;
}

.rank-table td {
  color: #e2e8f0;
  text-transform: none;
  letter-spacing: normal;
  font-size: 13px;
}

.rank-value {
  font-weight: 700;
  margin-right: 4px;
  font-size: 14px;
}

.player-sections {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.players-section-header {
  margin: 0;
  padding: 10px 12px;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #bae6fd;
  background: rgba(15, 23, 42, 0.55);
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
}

.players-table-wrapper {
  overflow-x: auto;
  border-radius: 12px;
  border: 1px solid rgba(56, 189, 248, 0.12);
}

.players-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 0;
  background: rgba(15, 23, 42, 0.4);
  table-layout: auto;
}

.players-table th,
.players-table td {
  padding: 10px 12px;
  text-align: left;
  font-size: 13px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.08);
  word-break: break-word;
}

.players-table th:first-child,
.players-table td:first-child {
  width: 30%;
  text-align: left;
}

.players-table th:not(:first-child),
.players-table td:not(:first-child) {
  width: auto;
  text-align: center;
}

.players-table thead th {
  text-align: center;
}

.players-table thead th:first-child {
  text-align: left;
}

.players-table th {
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #cbd5f5;
  background: rgba(15, 23, 42, 0.55);
  font-weight: 700;
}

.players-table tbody tr:nth-child(even) {
  background: rgba(15, 23, 42, 0.6);
}

.stat-cell {
  display: flex;
  align-items: baseline;
  justify-content: center;
}

.stat-value {
  font-weight: 600;
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
}

.stat-meta {
  color: #94a3b8;
  font-size: 12px;
}

.stat-meta--positive {
  color: #16a34a;
  font-weight: 700;
}

.stat-meta--negative {
  color: #dc2626;
  font-weight: 700;
}

.player-row {
  transition: background-color 0.2s ease;
  cursor: pointer;
}

.player-row:hover {
  background: rgba(56, 189, 248, 0.08);
}

.player-modal-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.85);
  backdrop-filter: blur(4px);
  z-index: 1000;
}

.player-modal {
  width: min(780px, 100%);
  background: rgba(10, 14, 25, 0.95);
  border: 1px solid rgba(56, 189, 248, 0.25);
  border-radius: 16px;
  box-shadow: 0 18px 48px rgba(2, 6, 23, 0.7);
  overflow: hidden;
}

.player-modal-header {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid rgba(56, 189, 248, 0.12);
  position: relative;
}

.player-modal-heading {
  flex: 1;
  text-align: center;
}

.player-modal-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #f1f5f9;
}

.player-modal-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  color: #94a3b8;
}

.modal-close-button {
  border: none;
  background: transparent;
  color: #94a3b8;
  font-size: 26px;
  line-height: 1;
  cursor: pointer;
  transition: color 0.2s ease;
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
}

.modal-close-button:hover {
  color: #f1f5f9;
}

.player-modal-body {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.modal-status {
  text-align: center;
  font-size: 14px;
  color: #cbd5f5;
  padding: 16px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.18);
}

.modal-status-error {
  color: #fecaca;
  border-color: rgba(239, 68, 68, 0.45);
}

.modal-stats-wrapper {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.modal-summary-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.modal-summary-card {
  flex: 1 1 0;
  min-width: 320px;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 12px;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-x: auto;
}

.modal-summary-title {
  margin: 0;
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #38bdf8;
  font-weight: 700;
}

.modal-summary-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.modal-summary-table th,
.modal-summary-table td {
  padding: 8px 10px;
  font-size: 12px;
  text-align: center;
  color: #e2e8f0;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
  background: rgba(15, 23, 42, 0.55);
}

.modal-summary-table th {
  font-weight: 700;
  color: #bae6fd;
  text-transform: uppercase;
}

.modal-summary-table tbody td {
  background: transparent;
  color: #facc15;
  font-weight: 600;
}

.modal-section-title {
  margin: 0;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #38bdf8;
  font-weight: 700;
}

.modal-stats-table-wrapper {
  max-height: 320px;
  overflow-x: auto;
}

.modal-stats-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 480px;
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid rgba(56, 189, 248, 0.12);
}

.modal-stats-table thead {
  background: rgba(15, 23, 42, 0.65);
}

.modal-stats-table th,
.modal-stats-table td {
  padding: 10px 12px;
  font-size: 12px;
  color: #cbd5f5;
  text-align: center;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
}

.modal-stats-table th {
  text-transform: uppercase;
  font-weight: 700;
}

.modal-stats-table td {
  font-size: 13px;
  color: #e2e8f0;
}
.stat-hit-text {
  color: #16a34a;
  font-weight: 700;
}

.stat-miss-text {
  color: #dc2626;
  font-weight: 700;
}

@media (max-width: 560px) {
  .modal-summary-card {
    flex: 1 1 100%;
    width: 100%;
  }
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.section-placeholder {
  margin: 0;
  font-size: 13px;
  color: #94a3b8;
  font-style: italic;
}

.section-helper {
  margin: 0;
  font-size: 12px;
  color: #64748b;
}
</style>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import axios from 'axios';

const matchups = ref([]);
const isLoaded = ref(false);
const loading = ref(false);
const errorMessage = ref('');

const rawMatchupsData = ref([]);
const marketsByGameMap = ref(new Map());
const teamAverageMapRef = ref(new Map());
const teamStatsMapRef = ref(new Map());
const playerInfoMapRef = ref(new Map());
const playerStatsCache = ref(new Map());

const modalVisible = ref(false);
const modalLoading = ref(false);
const modalError = ref('');
const modalPlayer = ref(null);
const modalSection = ref(null);
const modalStats = ref([]);

const HOVER_DELAY_MS = 3000;
const hoverTimers = new Map();

const API_BASE_URL = 'http://localhost/api/nfl';
const MATCHUPS_URL = `${API_BASE_URL}/markets/matchups`;
const MARKETS_URL = `${API_BASE_URL}/markets`;
const TEAM_AVERAGES_URL = `${API_BASE_URL}/teams/stats/averages`;
const PLAYER_STATS_URL = (playerId) => `${API_BASE_URL}/players/${playerId}/stats`;
const TEAM_STATS_URL = (teamId) => `${API_BASE_URL}/teams/${teamId}/stats`;

const PLAYER_SECTIONS_CONFIG = [
  {
    key: 'passing',
    label: 'Passing Players',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'position', label: 'Position' },
      { key: 'passing_yards', label: 'Passing Yards', statKey: 'passing_yards' },
      { key: 'pass_completions', label: 'Pass Completions', statKey: 'pass_completions' },
      { key: 'pass_attempts', label: 'Pass Attempts', statKey: 'pass_attempts' },
      { key: 'rushing_yards', label: 'Rushing Yards', statKey: 'rushing_yards' },
      { key: 'carries', label: 'Carries', statKey: 'carries' },
    ],
  },
  {
    key: 'rushing',
    label: 'Rushing Players',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'position', label: 'Position' },
      { key: 'rushing_yards', label: 'Rushing Yards', statKey: 'rushing_yards' },
      { key: 'carries', label: 'Carries', statKey: 'carries' },
      { key: 'receiving_yards', label: 'Receiving Yards', statKey: 'receiving_yards' },
      { key: 'receptions', label: 'Receptions', statKey: 'receptions' },
    ],
  },
  {
    key: 'receiving',
    label: 'Receiving Players',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'position', label: 'Position' },
      { key: 'receiving_yards', label: 'Receiving Yards', statKey: 'receiving_yards' },
      { key: 'receptions', label: 'Receptions', statKey: 'receptions' },
      { key: 'receiving_targets', label: 'Targets', statKey: 'receiving_targets' },
    ],
  },
  {
    key: 'defensive',
    label: 'Defensive Players',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'position', label: 'Position' },
      { key: 'tackles', label: 'Tackles', statKey: 'tackles' },
      { key: 'sacks', label: 'Sacks', statKey: 'sacks' },
    ],
  },
];

const OFFENSE_RANK_DEFS = [
  { label: 'Points', keys: ['points_total'], fallbackKey: 'points_total' },
  { label: 'Total Yards', keys: ['total_yards'], fallbackKey: 'total_yards' },
  { label: 'Passing', keys: ['passing_yards'], fallbackKey: 'passing_yards' },
  { label: 'Rushing', keys: ['rushing_yards'], fallbackKey: 'rushing_yards' },
  { label: 'Scoring', keys: ['points_total'], fallbackKey: 'points_total' },
];

const DEFENSE_RANK_DEFS = [
  { label: 'Points', keys: ['points_total'], fallbackKey: 'points_total' },
  { label: 'Total Yards', keys: ['total_yards'], fallbackKey: 'total_yards' },
  { label: 'Passing', keys: ['passing_yards'], fallbackKey: 'passing_yards' },
  { label: 'Rushing', keys: ['rushing_yards'], fallbackKey: 'rushing_yards' },
  { label: 'Scoring', keys: ['points_total'], fallbackKey: 'points_total' },
];

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

function computeHandicapForTeam(teamId, marketEntry = {}) {
  const line = parseNumeric(marketEntry?.markets?.handicap);
  if (line === null) return null;
  const favoriteId = normalizeId(
    marketEntry?.markets?.favorite_team_id ??
    marketEntry?.favorite_team_id
  );
  if (!teamId || !favoriteId) return line;
  const absolute = Math.abs(line);
  return teamId === favoriteId ? -absolute : absolute;
}

function buildTeamMarkets(teamId, marketEntry) {
  if (!marketEntry || !marketEntry.markets) return [];
  const { markets } = marketEntry;
  const items = [];
  const handicap = computeHandicapForTeam(teamId, marketEntry);
  if (handicap !== null) items.push({ label: 'Handicap', value: formatMarketValue(handicap) });
  if (markets.total_points !== null && markets.total_points !== undefined) {
    items.push({ label: 'Total Points', value: formatMarketValue(markets.total_points) });
  }
  if (markets.first_half_handicap !== null && markets.first_half_handicap !== undefined) {
    items.push({ label: 'H1 Handicap', value: formatMarketValue(markets.first_half_handicap) });
  }
  if (markets.first_half_points !== null && markets.first_half_points !== undefined) {
    items.push({ label: 'H1 Total Points', value: formatMarketValue(markets.first_half_points) });
  }
  const soloPoints = teamId === normalizeId(marketEntry.away_team_id)
    ? markets.away_team_solo_points
    : markets.home_team_solo_points;
  if (soloPoints !== null && soloPoints !== undefined) {
    items.push({ label: 'Solo Points', value: formatMarketValue(soloPoints) });
  }
  return items;
}

function buildMatchupMarkets(marketEntry) {
  if (!marketEntry?.markets) return [];
  const { markets } = marketEntry;
  const list = [];
  if (markets.handicap !== null && markets.handicap !== undefined) {
    list.push({ label: 'Handicap', value: formatMarketValue(markets.handicap) });
  }
  if (markets.total_points !== null && markets.total_points !== undefined) {
    list.push({ label: 'Total Points', value: formatMarketValue(markets.total_points) });
  }
  if (markets.first_half_handicap !== null && markets.first_half_handicap !== undefined) {
    list.push({ label: 'H1 Handicap', value: formatMarketValue(markets.first_half_handicap) });
  }
  if (markets.first_half_points !== null && markets.first_half_points !== undefined) {
    list.push({ label: 'H1 Total Points', value: formatMarketValue(markets.first_half_points) });
  }
  if (markets.away_team_solo_points !== null && markets.away_team_solo_points !== undefined) {
    list.push({
      label: `${formatTeamName(marketEntry.away_team ?? {})} Solo Points`,
      value: formatMarketValue(markets.away_team_solo_points),
    });
  }
  if (markets.home_team_solo_points !== null && markets.home_team_solo_points !== undefined) {
    list.push({
      label: `${formatTeamName(marketEntry.home_team ?? {})} Solo Points`,
      value: formatMarketValue(markets.home_team_solo_points),
    });
  }
  return list;
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

function calculateAverage(values = []) {
  if (!values.length) return null;
  const sum = values.reduce((acc, val) => acc + val, 0);
  return Number((sum / values.length).toFixed(1));
}

async function fetchTeamStatsMap(teamIds) {
  const result = new Map();
  for (const teamId of teamIds) {
    try {
      const response = await axios.get(TEAM_STATS_URL(teamId));
      const teamData = response.data ?? {};
      const scores = toArray(teamData.scores);
      if (!scores.length) {
        result.set(teamId, { averages: {} });
        continue;
      }
      const keys = ['points_total', 'total_yards', 'passing_yards', 'rushing_yards', 'sacks', 'tackles'];
      const averages = {};
      keys.forEach((key) => {
        const numericValues = scores
          .map((score) => parseNumeric(score?.[key]))
          .filter((value) => value !== null);
        const average = calculateAverage(numericValues);
        if (average !== null) averages[key] = average;
      });
      result.set(teamId, { averages });
    } catch (error) {
      console.error('Unable to load team stats', teamId, error);
    }
  }
  return result;
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

function buildRankList(teamId, defs, averagesMap, teamStatsMap, branchKey) {
  const normalizedId = normalizeId(teamId);
  if (!normalizedId) return [];
  const averagesEntry = averagesMap.get(normalizedId) ?? {};
  const branch = averagesEntry[branchKey] ?? averagesEntry[branchKey === 'ofensive' ? 'offensive' : 'defensive'];
  const fallback = teamStatsMap.get(normalizedId)?.averages ?? {};
  return defs
    .map((definition) => {
      const averageData = definition.keys
        .map((key) => branch?.[key])
        .find((value) => value && (value.value !== undefined || value.rank !== undefined));
      const value = averageData?.value ?? fallback[definition.fallbackKey];
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

function buildEnrichedTeam(rawTeam, marketEntry, averagesMap, teamStatsMap, playerInfoMap, playerStatsMap, opponentId) {
  const teamId = normalizeId(rawTeam?.id ?? rawTeam?.team_id ?? rawTeam?.teamId);
  return {
    ...rawTeam,
    id: teamId,
    display_name: formatTeamName(rawTeam),
    markets: buildTeamMarkets(teamId, marketEntry),
    offenseRanks: buildRankList(teamId, OFFENSE_RANK_DEFS, averagesMap, teamStatsMap, 'ofensive'),
    opponentDefenseRanks: buildRankList(opponentId, DEFENSE_RANK_DEFS, averagesMap, teamStatsMap, 'defensive'),
    playerSections: buildPlayerSections(teamId, marketEntry, playerInfoMap, playerStatsMap),
  };
}

function enrichMatchups(rawMatchups, marketsByGame, averagesMap, teamStatsMap, playerInfoMap, playerStatsMap) {
  return rawMatchups.map((rawMatchup) => {
    const matchupKey = getMatchupKey(rawMatchup) ?? normalizeId(rawMatchup.matchup_id);
    const marketEntry = marketsByGame.get(matchupKey) ?? marketsByGame.get(normalizeId(rawMatchup.market_id)) ?? null;
    const homeTeamId = normalizeId(rawMatchup.home_team_id ?? rawMatchup.home_team?.id);
    const awayTeamId = normalizeId(rawMatchup.away_team_id ?? rawMatchup.away_team?.id);
    const homeTeam = buildEnrichedTeam(
      rawMatchup.home_team ?? {},
      marketEntry,
      averagesMap,
      teamStatsMap,
      playerInfoMap,
      playerStatsMap,
      awayTeamId
    );
    const awayTeam = buildEnrichedTeam(
      rawMatchup.away_team ?? {},
      marketEntry,
      averagesMap,
      teamStatsMap,
      playerInfoMap,
      playerStatsMap,
      homeTeamId
    );
    return {
      ...rawMatchup,
      id: matchupKey ?? normalizeId(rawMatchup.id),
      scheduled_at: rawMatchup.scheduled_at ?? rawMatchup.played_at ?? rawMatchup.date,
      home_team: homeTeam,
      away_team: awayTeam,
      matchup_markets: buildMatchupMarkets(marketEntry),
    };
  });
}

function rebuildMatchups() {
  matchups.value = enrichMatchups(
    rawMatchupsData.value,
    marketsByGameMap.value,
    teamAverageMapRef.value,
    teamStatsMapRef.value,
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

    const teamIds = new Set();
    const playerInfoMap = new Map();

    rawMatchups.forEach((matchup) => {
      const homeTeamId = normalizeId(matchup.home_team_id ?? matchup.home_team?.id);
      const awayTeamId = normalizeId(matchup.away_team_id ?? matchup.away_team?.id);
      if (homeTeamId) teamIds.add(homeTeamId);
      if (awayTeamId) teamIds.add(awayTeamId);

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

      const homeTeamId = normalizeId(entry.home_team_id ?? entry.home_team?.id);
      const awayTeamId = normalizeId(entry.away_team_id ?? entry.away_team?.id);
      if (homeTeamId) teamIds.add(homeTeamId);
      if (awayTeamId) teamIds.add(awayTeamId);

      toArray(entry.player_markets).forEach((playerMarket) => {
        const playerId = normalizeId(playerMarket.player_id);
        if (!playerId) return;
        if (!playerInfoMap.has(playerId)) {
          playerInfoMap.set(playerId, { id: playerId });
        }
      });
    });

    const teamStatsMap = await fetchTeamStatsMap(teamIds);

    rawMatchupsData.value = rawMatchups;
    marketsByGameMap.value = marketsByGame;
    teamAverageMapRef.value = teamAverageMap;
    teamStatsMapRef.value = teamStatsMap;
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
});

function clearHoverTimer(playerId) {
  if (!playerId) return;
  const timerId = hoverTimers.get(playerId);
  if (timerId) {
    clearTimeout(timerId);
    hoverTimers.delete(playerId);
  }
}

function clearAllHoverTimers() {
  hoverTimers.forEach((timerId) => clearTimeout(timerId));
  hoverTimers.clear();
}

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

function handlePlayerHoverStart(row, section) {
  const playerId = normalizeId(row?.id);
  if (!playerId) return;
  clearHoverTimer(playerId);
  const timeoutId = setTimeout(() => {
    hoverTimers.delete(playerId);
    void openPlayerModal(row, section);
  }, HOVER_DELAY_MS);
  hoverTimers.set(playerId, timeoutId);
}

function handlePlayerHoverEnd(playerId) {
  clearHoverTimer(normalizeId(playerId));
}

async function openPlayerModal(row, section) {
  if (!row?.id) return;
  modalVisible.value = true;
  modalLoading.value = true;
  modalError.value = '';
  modalSection.value = section
    ? { key: section.key, label: section.label, columns: section.columns }
    : null;
  modalStats.value = [];

  const baseInfo = playerInfoMapRef.value.get(row.id) ?? {};
  modalPlayer.value = {
    id: row.id,
    name: row.name ?? resolvePlayerName(baseInfo),
    position: row.position ?? readPlayerPosition(baseInfo),
    teamId: row.teamId,
  };

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
    modalStats.value = Array.isArray(statsEntry.stats) ? statsEntry.stats : [];
  } catch (error) {
    modalError.value = 'No se pudieron cargar las estadísticas del jugador.';
  } finally {
    modalLoading.value = false;
  }
}

function closeModal() {
  modalVisible.value = false;
  modalLoading.value = false;
  modalError.value = '';
  modalPlayer.value = null;
  modalSection.value = null;
  modalStats.value = [];
}

onUnmounted(() => {
  clearAllHoverTimers();
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
            <p v-if="matchup.scheduled_at" class="game-meta">
              {{ matchup.scheduled_at }}
            </p>
          </header>

          <div class="team-panels">
            <section class="team-panel">
              <h3 class="team-name">{{ formatTeamName(matchup.away_team) }}</h3>
              <p v-if="matchup.away_team?.record" class="team-meta">Record: {{ matchup.away_team.record }}</p>

              <div class="team-section">
                <h4>Mercados</h4>
                <div v-if="matchup.away_team?.markets?.length" class="market-list">
                  <div
                    v-for="market in matchup.away_team.markets"
                    :key="`${market.label}-${market.value}`"
                    class="market-item"
                  >
                    <span>{{ market.label }}</span>
                    <span class="market-value">{{ market.value }}</span>
                  </div>
                </div>
                <p v-else class="section-placeholder">No hay mercados disponibles.</p>
              </div>

              <div class="team-section">
                <h4>Offensive Ranks</h4>
                <ul v-if="matchup.away_team?.offenseRanks?.length" class="rank-list">
                  <li v-for="rank in matchup.away_team.offenseRanks" :key="rank.label">
                    <span>{{ rank.label }}</span>
                    <span>
                      {{ formatNumber(rank.value) }}
                      <span v-if="rank.rank" class="rank-meta">#{{ rank.rank }}</span>
                    </span>
                  </li>
                </ul>
                <p v-else class="section-placeholder">Sin datos ofensivos.</p>
              </div>

              <div class="team-section">
                <h4>Enemy Defensive Ranks</h4>
                <ul v-if="matchup.away_team?.opponentDefenseRanks?.length" class="rank-list">
                  <li v-for="rank in matchup.away_team.opponentDefenseRanks" :key="rank.label">
                    <span>{{ rank.label }}</span>
                    <span>
                      {{ formatNumber(rank.value) }}
                      <span v-if="rank.rank" class="rank-meta">#{{ rank.rank }}</span>
                    </span>
                  </li>
                </ul>
                <p v-else class="section-placeholder">Sin datos defensivos del rival.</p>
              </div>

              <div class="team-section">
                <h4>Jugadores</h4>
                <p class="section-helper">Mantén el cursor 3 segundos sobre un jugador para ver sus estadísticas.</p>
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
                          @mouseenter="handlePlayerHoverStart(row, section)"
                          @mouseleave="handlePlayerHoverEnd(row.id)"
                        >
                          <td v-for="column in section.columns" :key="column.key">
                            <template v-if="column.key === 'name'">
                              {{ row.name }}
                            </template>
                            <template v-else-if="column.key === 'position'">
                              {{ row.position }}
                            </template>
                            <template v-else>
                              <div class="stat-cell">
                                <span class="stat-value">{{ row.metrics[column.key]?.value ?? '-' }}</span>
                                <small
                                  v-if="row.metrics[column.key]?.lastFive"
                                  class="stat-meta"
                                >
                                  Last 5 games: {{ row.metrics[column.key].lastFive.success }}/{{ row.metrics[column.key].lastFive.total }}
                                </small>
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
                <div v-if="matchup.home_team?.markets?.length" class="market-list">
                  <div
                    v-for="market in matchup.home_team.markets"
                    :key="`${market.label}-${market.value}`"
                    class="market-item"
                  >
                    <span>{{ market.label }}</span>
                    <span class="market-value">{{ market.value }}</span>
                  </div>
                </div>
                <p v-else class="section-placeholder">No hay mercados disponibles.</p>
              </div>

              <div class="team-section">
                <h4>Offensive Ranks</h4>
                <ul v-if="matchup.home_team?.offenseRanks?.length" class="rank-list">
                  <li v-for="rank in matchup.home_team.offenseRanks" :key="rank.label">
                    <span>{{ rank.label }}</span>
                    <span>
                      {{ formatNumber(rank.value) }}
                      <span v-if="rank.rank" class="rank-meta">#{{ rank.rank }}</span>
                    </span>
                  </li>
                </ul>
                <p v-else class="section-placeholder">Sin datos ofensivos.</p>
              </div>

              <div class="team-section">
                <h4>Enemy Defensive Ranks</h4>
                <ul v-if="matchup.home_team?.opponentDefenseRanks?.length" class="rank-list">
                  <li v-for="rank in matchup.home_team.opponentDefenseRanks" :key="rank.label">
                    <span>{{ rank.label }}</span>
                    <span>
                      {{ formatNumber(rank.value) }}
                      <span v-if="rank.rank" class="rank-meta">#{{ rank.rank }}</span>
                    </span>
                  </li>
                </ul>
                <p v-else class="section-placeholder">Sin datos defensivos del rival.</p>
              </div>

              <div class="team-section">
                <h4>Jugadores</h4>
                <p class="section-helper">Mantén el cursor 3 segundos sobre un jugador para ver sus estadísticas.</p>
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
                          @mouseenter="handlePlayerHoverStart(row, section)"
                          @mouseleave="handlePlayerHoverEnd(row.id)"
                        >
                          <td v-for="column in section.columns" :key="column.key">
                            <template v-if="column.key === 'name'">
                              {{ row.name }}
                            </template>
                            <template v-else-if="column.key === 'position'">
                              {{ row.position }}
                            </template>
                            <template v-else>
                              <div class="stat-cell">
                                <span class="stat-value">{{ row.metrics[column.key]?.value ?? '-' }}</span>
                                <small
                                  v-if="row.metrics[column.key]?.lastFive"
                                  class="stat-meta"
                                >
                                  Last 5 games: {{ row.metrics[column.key].lastFive.success }}/{{ row.metrics[column.key].lastFive.total }}
                                </small>
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

          <div v-if="matchup.matchup_markets?.length" class="team-section">
            <h4>Mercados del Partido</h4>
            <div class="market-list">
              <div
                v-for="market in matchup.matchup_markets"
                :key="`${market.label}-${market.value}`"
                class="market-item"
              >
                <span>{{ market.label }}</span>
                <span class="market-value">{{ market.value }}</span>
              </div>
            </div>
          </div>
        </article>
      </div>
    </div>
  </div>

  <transition name="modal-fade">
    <div
      v-if="modalVisible"
      class="player-modal-overlay"
      @click.self="closeModal"
    >
      <div class="player-modal">
        <header class="player-modal-header">
          <div>
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
            <h4 v-if="modalSection?.label" class="modal-section-title">{{ modalSection.label }}</h4>
            <p v-if="!modalStats.length" class="modal-status">Sin estadísticas recientes.</p>
            <div v-else class="modal-stats-list">
              <article
                v-for="(stat, index) in modalStats.slice(0, 5)"
                :key="stat.game_id ?? stat.gameId ?? stat.id ?? stat.date ?? index"
                class="modal-stat-card"
              >
                <header class="modal-stat-header">
                  <span v-if="stat.date">{{ stat.date }}</span>
                  <span v-else-if="stat.game_id || stat.gameId">
                    Juego #{{ stat.game_id ?? stat.gameId }}
                  </span>
                  <span v-else>
                    Registro {{ index + 1 }}
                  </span>
                </header>
                <ul class="modal-stat-metrics">
                  <li
                    v-for="column in (modalSection ? modalSection.columns : [])"
                    v-if="column.statKey"
                    :key="column.key"
                  >
                    <span>{{ column.label }}</span>
                    <span>{{ formatNumber(stat?.[column.statKey]) ?? '-' }}</span>
                  </li>
                </ul>
              </article>
            </div>
          </div>
        </section>
      </div>
    </div>
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

.market-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.market-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(15, 23, 42, 0.65);
  border: 1px solid rgba(56, 189, 248, 0.12);
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 14px;
}

.market-value {
  font-weight: 600;
  color: #facc15;
}

.rank-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 8px;
}

.rank-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 13px;
}

.rank-meta {
  margin-left: 6px;
  font-size: 11px;
  color: #38bdf8;
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
  min-width: 560px;
  background: rgba(15, 23, 42, 0.4);
}

.players-table th,
.players-table td {
  padding: 10px 12px;
  text-align: left;
  font-size: 13px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.08);
}

.players-table th {
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #cbd5f5;
  background: rgba(15, 23, 42, 0.55);
}

.players-table tbody tr:nth-child(even) {
  background: rgba(15, 23, 42, 0.35);
}

.stat-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-value {
  font-weight: 600;
}

.stat-meta {
  color: #94a3b8;
  font-size: 11px;
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
  width: min(600px, 100%);
  background: rgba(10, 14, 25, 0.95);
  border: 1px solid rgba(56, 189, 248, 0.25);
  border-radius: 16px;
  box-shadow: 0 18px 48px rgba(2, 6, 23, 0.7);
  overflow: hidden;
}

.player-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid rgba(56, 189, 248, 0.12);
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

.modal-section-title {
  margin: 0;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #38bdf8;
}

.modal-stats-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.modal-stat-card {
  padding: 16px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid rgba(56, 189, 248, 0.12);
}

.modal-stat-header {
  margin-bottom: 12px;
  font-size: 13px;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.modal-stat-metrics {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 8px;
}

.modal-stat-metrics li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  color: #e2e8f0;
}

.modal-stat-metrics span:last-child {
  font-weight: 600;
  color: #facc15;
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

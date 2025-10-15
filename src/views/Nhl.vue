<script setup>
import { computed, ref, onMounted, watch } from 'vue';
import axios from 'axios';
import { useRoute } from 'vue-router';

import NhlTeamStatsModal from '../components/NhlTeamStatsModal.vue';
import NhlPlayerStatsModal from '../components/NhlPlayerStatsModal.vue';
import PickList from '../components/PickList.vue';
import { buildNhlApiUrl } from '../utils/nhlApi';

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
  playerName: '',
  playerPosition: '',
  teamCode: '',
  opponentCode: '',
  opponentDefense: [],
  market: {},
  initialStats: [],
  playerType: 'offensive',
});

const teamModalState = ref({
  visible: false,
  teamId: null,
  teamName: '',
  markets: [],
});

const playerStatsCache = new Map();

const MATCHUPS_URL = buildNhlApiUrl('markets/matchups');
const MARKETS_URL = buildNhlApiUrl('markets');
const TEAM_AVERAGES_URL = buildNhlApiUrl('teams/stats/averages');

const route = useRoute();
const queryDate = computed(() => {
  const rawDate = route?.query?.date;
  if (rawDate === null || rawDate === undefined || rawDate === '') return null;
  return String(rawDate);
});

const PLAYER_STATS_BASE_URL = import.meta.env?.VITE_NHL_PLAYER_STATS_URL ?? 'http://localhost/nhl/players';
const PLAYER_STATS_ENDPOINT = (playerId) => {
  const normalizedBase = PLAYER_STATS_BASE_URL.replace(/\/$/, '');
  return `${normalizedBase}/${encodeURIComponent(playerId)}/stats`;
};

const PLAYER_SECTIONS_CONFIG = [
  {
    key: 'goalkeepers',
    label: 'Goalkeepers',
    columns: [
      { key: 'name', label: 'Player' },
      { key: 'saves', label: 'Saves', statKey: 'saves' },
    ],
    filter: ({ market }) => hasValidMarketValue(market?.saves),
  },
  {
    key: 'offensive',
    label: 'Offensive Players',
    columns: [
      { key: 'name', label: 'Player' },
      { key: 'points', label: 'Points', statKey: 'points' },
      { key: 'goals', label: 'Goals', statKey: 'goals' },
      { key: 'shots', label: 'Shots', statKey: 'shots' },
    ],
    filter: ({ market }) => !hasValidMarketValue(market?.saves),
  },
];

const OFFENSE_RANK_DEFS = [
  { label: 'Goals', key: 'goals' },
  { label: 'Shots', key: 'shots' },
];

const DEFENSE_RANK_DEFS = [
  { label: 'Goals Allowed', key: 'goals' },
  { label: 'Shots Allowed', key: 'shots' },
];

onMounted(() => {
  loadMatchups();
});

watch(
  () => queryDate.value,
  () => {
    loadMatchups();
  }
);

async function loadMatchups() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const configFactory = () => (queryDate.value ? { params: { date: queryDate.value } } : undefined);
    const [matchupsResponse, marketsResponse, averagesResponse] = await Promise.all([
      axios.get(MATCHUPS_URL, configFactory()),
      axios.get(MARKETS_URL, configFactory()),
      axios.get(TEAM_AVERAGES_URL),
    ]);

    const rawMatchups = toArray(matchupsResponse.data ?? matchupsResponse);
    const rawMarkets = toArray(marketsResponse.data ?? marketsResponse);
    const averagesEntries = extractTeamAverages(averagesResponse.data ?? averagesResponse);

    const averagesMap = buildTeamAverageMap(averagesEntries);
    const marketsMap = buildMarketsMap(rawMarkets);

    matchups.value = rawMatchups.map((rawMatchup) => enrichMatchup(rawMatchup, marketsMap, averagesMap));
  } catch (error) {
    console.error('Unable to load NHL data', error);
    matchups.value = [];
    errorMessage.value = 'Unable to load NHL information. Please try again later.';
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

function enrichMatchup(rawMatchup, marketsMap, averagesMap) {
  const matchupKey = getMatchupKey(rawMatchup);
  const marketEntry = matchupKey ? marketsMap.get(matchupKey) ?? null : null;

  const homeTeam = buildTeam(rawMatchup.home_team, marketEntry, averagesMap, rawMatchup.away_team);
  const awayTeam = buildTeam(rawMatchup.away_team, marketEntry, averagesMap, rawMatchup.home_team);

  return {
    id: matchupKey ?? normalizeId(rawMatchup.id),
    externalId: rawMatchup.external_id ?? null,
    startAt: rawMatchup.start_at ?? rawMatchup.scheduled_at ?? null,
    displayDate: formatFullDateTime(rawMatchup.start_at ?? rawMatchup.scheduled_at),
    homeTeam,
    awayTeam,
  };
}

function buildTeam(teamPayload = {}, marketEntry, averagesMap, opponentPayload) {
  const teamId = normalizeId(teamPayload.id ?? teamPayload.team_id);
  const opponentId = normalizeId(opponentPayload?.id ?? opponentPayload?.team_id);
  const markets = buildTeamMarkets(teamId, marketEntry);
  const offenseRanks = buildRankList(teamId, OFFENSE_RANK_DEFS, averagesMap, 'ofensive');
  const opponentDefenseRanks = buildRankList(opponentId, DEFENSE_RANK_DEFS, averagesMap, 'defensive');
  const playerSections = buildPlayerSections(teamPayload, marketEntry, teamId);

  return {
    id: teamId,
    code: resolveTeamCode(teamPayload),
    name: formatTeamName(teamPayload),
    opponentCode: resolveTeamCode(opponentPayload),
    markets,
    offenseRanks,
    opponentDefenseRanks,
    playerSections,
  };
}

function buildPlayerSections(teamPayload, marketEntry, teamId) {
  if (!marketEntry) return [];
  const markets = resolvePlayerMarkets(marketEntry, teamId);
  if (!markets.size) return [];

  const sections = PLAYER_SECTIONS_CONFIG.map((section) => ({
    key: section.key,
    label: section.label,
    columns: section.columns,
    filter: section.filter,
    rows: [],
  }));

  toArray(teamPayload.players).forEach((player) => {
    const playerId = normalizeId(player.id ?? player.player_id);
    if (!playerId) return;

    const market = markets.get(playerId);
    if (!market) return;

    const stats = Array.isArray(player.stats) ? player.stats : [];

    sections.forEach((section) => {
      if (typeof section.filter === 'function' && !section.filter({ player, market })) return;

      const metrics = {};
      let hasMetrics = false;

      section.columns.forEach((column) => {
        if (!column.statKey) return;
        const rawValue = market[column.statKey];
        if (!hasValidMarketValue(rawValue)) {
          metrics[column.key] = { value: '-', rawValue: null, lastFive: null };
          return;
        }
        hasMetrics = true;
        const numericValue = parseNumeric(rawValue);
        metrics[column.key] = {
          value: formatMarketValue(rawValue),
          rawValue,
          lastFive: computeLastFive(stats, column.statKey, numericValue),
        };
      });

      if (!hasMetrics) return;

      section.rows.push({
        id: playerId,
        name: resolvePlayerName(player),
        position: readPlayerPosition(player),
        teamId,
        market,
        stats,
        metrics,
      });
    });
  });

  return sections
    .filter((section) => section.rows.length)
    .map(({ filter, ...section }) => section);
}

function resolvePlayerMarkets(marketEntry, teamId) {
  const map = new Map();
  toArray(marketEntry?.player_markets).forEach((entry) => {
    const normalizedTeamId = normalizeId(entry.team_id ?? entry.teamId);
    if (normalizedTeamId && normalizeId(teamId) && normalizedTeamId !== normalizeId(teamId)) return;
    const playerId = normalizeId(entry.player_id ?? entry.playerId);
    if (!playerId) return;
    map.set(playerId, entry);
  });
  return map;
}

function resolvePlayerType(player = {}, market = {}) {
  const position = String(player.position ?? player.pos ?? '').trim().toUpperCase();
  if (position === 'G' || position === 'GK' || position === 'GOALTENDER') {
    return 'goalkeeper';
  }
  if (hasValidMarketValue(market?.saves)) {
    return 'goalkeeper';
  }
  return 'offensive';
}

function buildTeamMarkets(teamId, marketEntry) {
  const market = resolveMarketObject(marketEntry);
  if (!market) return [];
  const normalizedTeamId = normalizeId(teamId);
  const favoriteId = normalizeId(market.favorite_team_id);
  const handicap = computeSignedHandicap(teamId, market.handicap, favoriteId);
  const items = [];
  if (handicap !== null) {
    items.push({ label: 'Handicap', shortLabel: 'HC', value: formatMarketValue(handicap) });
  }
  if (market.total_points !== null && market.total_points !== undefined) {
    items.push({ label: 'Total Goals', shortLabel: 'TOTAL GOALS', value: formatMarketValue(market.total_points) });
  }
  if (market.away_team_solo_points !== undefined || market.home_team_solo_points !== undefined) {
    const awayId = normalizeId(marketEntry?.away_team_id ?? marketEntry?.away_team?.id);
    const soloKey = normalizedTeamId && awayId && normalizedTeamId === awayId ? 'away_team_solo_points' : 'home_team_solo_points';
    const soloValue = market[soloKey];
    if (soloValue !== null && soloValue !== undefined) {
      items.push({ label: 'Solo Goals', shortLabel: 'SOLO', value: formatMarketValue(soloValue) });
    }
  }
  return items;
}

function buildRankList(teamId, defs, averagesMap, branchKey) {
  const normalizedId = normalizeId(teamId);
  if (!normalizedId) return [];
  const averagesEntry = averagesMap.get(normalizedId) ?? {};
  const branch = averagesEntry[branchKey] ?? {};
  return defs
    .map((definition) => {
      const metric = branch?.[definition.key];
      if (!metric || (metric.value === undefined && metric.rank === undefined)) return null;
      return {
        label: definition.label,
        value: metric.value,
        rank: metric.rank,
      };
    })
    .filter(Boolean);
}

async function openPlayerModal(team, player) {
  if (!player?.id) return;
  const playerId = normalizeId(player.id);
  if (!playerId) return;

  const teamId = normalizeId(player.teamId ?? team?.id);
  const baselineStats = Array.isArray(player.stats) ? player.stats : [];
  const playerType = resolvePlayerType(player, player.market);
  const teamCode = resolveTeamCode(team);
  const opponentCode = team?.opponentCode ?? '';
  const opponentDefense = Array.isArray(team?.opponentDefenseRanks) ? team.opponentDefenseRanks : [];
  const playerPosition = readPlayerPosition(player);

  playerModalState.value = {
    visible: true,
    playerId,
    teamId,
    playerName: player.name ?? resolvePlayerName(player),
    playerPosition,
    teamCode,
    opponentCode,
    opponentDefense,
    market: player.market,
    initialStats: baselineStats,
    playerType,
  };

  let modalStats = [];
  try {
    modalStats = await fetchPlayerStatsForModal(playerId);
  } catch (error) {
    console.error('Unable to load player stats for modal', playerId, error);
    modalStats = [];
  }

  if (playerModalState.value.playerId === playerId) {
    playerModalState.value = {
      ...playerModalState.value,
      initialStats: modalStats.length ? modalStats : baselineStats,
      playerType,
      playerPosition,
      teamCode,
      opponentCode,
      opponentDefense,
    };
  }
}

function closePlayerModal() {
  playerModalState.value = {
    visible: false,
    playerId: null,
    teamId: null,
    playerName: '',
    playerPosition: '',
    teamCode: '',
    opponentCode: '',
    opponentDefense: [],
    market: {},
    initialStats: [],
    playerType: 'offensive',
  };
}

function openTeamModal(team) {
  if (!team?.id) return;
  teamModalState.value = {
    visible: true,
    teamId: team.id,
    teamName: team.name,
    markets: team.markets,
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

function togglePickList() {
  isPickListOpen.value = !isPickListOpen.value;
}

function closePickList() {
  isPickListOpen.value = false;
}

function handleMarketPick(team, market) {
  const pickId = `team:${team.id}:${market.label}:${market.value}`;
  if (pickList.value.some((entry) => entry.id === pickId)) return;
  pickList.value = [
    ...pickList.value,
    {
      id: pickId,
      type: 'team',
      teamId: team.id,
      teamCode: team.code,
      marketLabel: market.label,
      value: market.value,
      valueClass: 'pick-list__value--team',
    },
  ];
}

function handlePlayerPick(event, team, section, row, column) {
  event?.stopPropagation?.();
  if (!team || !row || !column) return;
  const statKey = column.statKey;
  if (!statKey) return;
  const sectionKey = section?.key ?? 'all';
  const pickId = `player:${team.id}:${row.id}:${sectionKey}:${statKey}`;
  if (pickList.value.some((entry) => entry.id === pickId)) return;

  const metric = row.metrics?.[column.key];
  if (!metric) return;

  const lastFive = metric.lastFive;
  const sectionLabel = section?.label ? section.label.toUpperCase() : '';
  const columnLabel = column.label ? column.label.toUpperCase() : '';
  const marketLabel = [sectionLabel, columnLabel].filter(Boolean).join(' - ');

  pickList.value = [
    ...pickList.value,
    {
      id: pickId,
      type: 'player',
      teamId: team.id,
      teamCode: team.code,
      playerId: row.id,
      sectionKey: section?.key ?? null,
      statKey,
      playerName: row.name,
      marketLabel: marketLabel || column.label,
      value: metric.value ?? '-',
      valueClass: 'pick-list__value--player',
      lastFiveText: formatLastFiveText(lastFive),
      lastFiveClass: resolveLastFiveClass(lastFive),
    },
  ];
}

function handlePickEntrySelect(entry) {
  if (entry.type === 'team') {
    const matchupTeam = findTeamById(entry.teamId);
    if (matchupTeam) {
      openTeamModal(matchupTeam);
    }
    return;
  }
  if (entry.type === 'player') {
    const located = findPlayerById(entry.playerId, entry.teamId, entry.sectionKey);
    if (located?.team && located?.row) {
      openPlayerModal(located.team, located.row);
    }
  }
}

function handlePickEntryRemove(entry) {
  pickList.value = pickList.value.filter((item) => item.id !== entry.id);
}

function findTeamById(teamId) {
  const normalizedId = normalizeId(teamId);
  for (const matchup of matchups.value) {
    if (normalizeId(matchup.homeTeam.id) === normalizedId) return matchup.homeTeam;
    if (normalizeId(matchup.awayTeam.id) === normalizedId) return matchup.awayTeam;
  }
  return null;
}

function findPlayerById(playerId, teamId, sectionKey = null) {
  const normalizedPlayerId = normalizeId(playerId);
  const normalizedTeamId = normalizeId(teamId);
  const normalizedSectionKey = sectionKey ? String(sectionKey) : null;
  if (!normalizedPlayerId) return null;

  for (const matchup of matchups.value) {
    const candidates = [matchup.homeTeam, matchup.awayTeam];
    for (const team of candidates) {
      if (!team) continue;
      if (normalizedTeamId && normalizeId(team.id) !== normalizedTeamId) continue;
      const sections = Array.isArray(team.playerSections) ? team.playerSections : [];
      for (const section of sections) {
        if (normalizedSectionKey && section.key !== normalizedSectionKey) continue;
        const row = section.rows.find((entry) => normalizeId(entry.id) === normalizedPlayerId);
        if (row) {
          return { team, section, row };
        }
      }
    }
  }
  return null;
}

async function fetchPlayerStatsForModal(playerId) {
  const normalizedId = normalizeId(playerId);
  if (!normalizedId) return [];
  if (playerStatsCache.has(normalizedId)) {
    return playerStatsCache.get(normalizedId) ?? [];
  }

  const requestUrl = PLAYER_STATS_ENDPOINT(normalizedId);
  const { data } = await axios.get(requestUrl);
  const stats = toArray(data?.stats ?? data);
  playerStatsCache.set(normalizedId, stats);
  return stats;
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

function computeSignedHandicap(teamId, rawLine, favoriteTeamId) {
  const line = parseNumeric(rawLine);
  if (line === null) return null;
  const normalizedTeamId = normalizeId(teamId);
  const normalizedFavoriteId = normalizeId(favoriteTeamId);
  if (!normalizedTeamId || !normalizedFavoriteId) return formatNumber(line);
  const absolute = Math.abs(line);
  const signed = normalizedTeamId === normalizedFavoriteId ? -absolute : absolute;
  return formatNumber(signed);
}

function computeLastFive(statsList, key, targetValue) {
  if (targetValue === null || targetValue === undefined) return null;
  if (!Array.isArray(statsList) || !statsList.length) return null;
  const recent = statsList.slice(0, 5);
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

function extractTeamAverages(payload) {
  if (Array.isArray(payload)) return payload;
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

function resolveMarketObject(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const marketCandidate = entry.market ?? entry.markets ?? null;
  if (marketCandidate && typeof marketCandidate === 'object') {
    return marketCandidate;
  }
  if (entry.handicap !== undefined || entry.total_points !== undefined) {
    return entry;
  }
  return null;
}

function resolvePlayerName(player = {}) {
  if (player.full_name) return player.full_name;
  const names = [player.first_name, player.last_name].filter(Boolean);
  if (names.length) return names.join(' ');
  if (player.name) return player.name;
  return player.id ? `Player ${player.id}` : 'Player';
}

function readPlayerPosition(player = {}) {
  return player.position ?? player.pos ?? '-';
}

function resolveTeamCode(team = {}) {
  return team.code ?? team.abbreviation ?? team.short_name ?? team.nickname ?? team.name ?? 'TEAM';
}

function formatTeamName(team = {}) {
  const composed = [team.city, team.nickname ?? team.name].filter(Boolean).join(' ');
  const fallback = composed || team.code;
  const resolved = team.full_name ?? fallback ?? team.name ?? team.code;
  return resolved || 'Team';
}

function formatMarketValue(value) {
  if (value === null || value === undefined || value === '') return '-';
  const numeric = Number(value);
  if (!Number.isNaN(numeric)) {
    return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
  }
  return String(value);
}

function hasValidMarketValue(value) {
  return value !== null && value !== undefined && value !== '';
}

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
    entity.external_id,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeId(candidate);
    if (normalized) return normalized;
  }
  return null;
}

function parseNumeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatNumber(value) {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return value;
  return Number.isInteger(numeric) ? numeric : Number(numeric.toFixed(1));
}

function formatFullDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-US', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
</script>

<template>
  <div class="nhl-view">
    <header class="page-header">
      <h1 class="page-title">NHL Markets</h1>
      <p class="page-subtitle">Daily games with team and player lines.</p>
    </header>

    <div v-if="loading" class="status-message">Loading data...</div>
    <div v-else-if="errorMessage" class="status-message status-message--error">{{ errorMessage }}</div>

    <section v-if="isLoaded && matchups.length" class="matchups-grid">
      <article v-for="matchup in matchups" :key="matchup.id" class="matchup-card">
        <header class="matchup-header">
          <span class="matchup-code">{{ matchup.externalId ?? matchup.id }}</span>
          <span class="matchup-date">{{ matchup.displayDate }}</span>
        </header>

        <div class="teams-wrapper">
          <section class="team-panel">
            <header class="team-header">
              <h2 class="team-name">{{ matchup.awayTeam.name }}</h2>
            </header>

            <div class="team-section">
              <h3>Markets</h3>
              <div
                v-if="matchup.awayTeam.markets.length"
                class="market-table-wrapper team-market-trigger"
                @click="openTeamModal(matchup.awayTeam)"
              >
                <table class="market-table">
                  <thead>
                    <tr>
                      <th v-for="market in matchup.awayTeam.markets" :key="`${market.label}-${market.value}`">
                        {{ market.shortLabel ?? market.label }}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td
                        v-for="market in matchup.awayTeam.markets"
                        :key="`val-${market.label}-${market.value}`"
                        @contextmenu.prevent="handleMarketPick(matchup.awayTeam, market)"
                      >
                        <span class="market-value">{{ market.value }}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-else class="team-placeholder">No team markets available.</p>
            </div>

            <div class="team-section">
              <h3>Offense</h3>
              <div v-if="matchup.awayTeam.offenseRanks.length" class="rank-table-wrapper">
                <table class="rank-table">
                  <thead>
                    <tr>
                      <th v-for="rank in matchup.awayTeam.offenseRanks" :key="rank.label">{{ rank.label }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td v-for="rank in matchup.awayTeam.offenseRanks" :key="`rank-${rank.label}`">
                        <span class="rank-value">{{ formatMarketValue(rank.value) }}</span>
                        <span v-if="rank.rank" class="rank-meta">#{{ rank.rank }}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-else class="team-placeholder">No offense metrics available.</p>
            </div>

            <div class="team-section">
              <h3>Opponent Defense</h3>
              <div v-if="matchup.awayTeam.opponentDefenseRanks.length" class="rank-table-wrapper">
                <table class="rank-table">
                  <thead>
                    <tr>
                      <th v-for="rank in matchup.awayTeam.opponentDefenseRanks" :key="`opp-${rank.label}`">
                        {{ rank.label }}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td v-for="rank in matchup.awayTeam.opponentDefenseRanks" :key="`opp-val-${rank.label}`">
                        <span class="rank-value">{{ formatMarketValue(rank.value) }}</span>
                        <span v-if="rank.rank" class="rank-meta">#{{ rank.rank }}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-else class="team-placeholder">No opponent defense metrics available.</p>
            </div>

            <div class="team-section">
              <h3>Players</h3>
              <p class="section-helper">Click a player to open the modal, right-click to add to picks.</p>
              <div v-if="matchup.awayTeam.playerSections?.length" class="player-sections">
                <section
                  v-for="section in matchup.awayTeam.playerSections"
                  :key="`away-section-${section.key}`"
                  class="players-table-wrapper"
                >
                  <header class="players-section-header">{{ section.label }}</header>
                  <table class="players-table">
                    <thead>
                      <tr>
                        <th v-for="column in section.columns" :key="`away-head-${section.key}-${column.key}`">
                          {{ column.label }}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="row in section.rows"
                        :key="`away-row-${section.key}-${row.id}`"
                        class="player-row"
                        @click="openPlayerModal(matchup.awayTeam, row)"
                      >
                        <td
                          v-for="column in section.columns"
                          :key="`away-cell-${section.key}-${row.id}-${column.key}`"
                          @contextmenu.prevent="handlePlayerPick($event, matchup.awayTeam, section, row, column)"
                        >
                          <template v-if="column.key === 'name'">
                            <span class="player-name">{{ row.name }}</span>
                          </template>
                          <template v-else-if="column.key === 'position'">
                            <span class="player-position">{{ row.position }}</span>
                          </template>
                          <template v-else>
                            <div class="stat-cell">
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
              <p v-else class="team-placeholder">No player markets available.</p>
            </div>
          </section>

          <section class="team-panel">
            <header class="team-header">
              <h2 class="team-name">{{ matchup.homeTeam.name }}</h2>
            </header>

            <div class="team-section">
              <h3>Markets</h3>
              <div
                v-if="matchup.homeTeam.markets.length"
                class="market-table-wrapper team-market-trigger"
                @click="openTeamModal(matchup.homeTeam)"
              >
                <table class="market-table">
                  <thead>
                    <tr>
                      <th v-for="market in matchup.homeTeam.markets" :key="`${market.label}-${market.value}`">
                        {{ market.shortLabel ?? market.label }}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td
                        v-for="market in matchup.homeTeam.markets"
                        :key="`home-${market.label}-${market.value}`"
                        @contextmenu.prevent="handleMarketPick(matchup.homeTeam, market)"
                      >
                        <span class="market-value">{{ market.value }}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-else class="team-placeholder">No team markets available.</p>
            </div>

            <div class="team-section">
              <h3>Offense</h3>
              <div v-if="matchup.homeTeam.offenseRanks.length" class="rank-table-wrapper">
                <table class="rank-table">
                  <thead>
                    <tr>
                      <th v-for="rank in matchup.homeTeam.offenseRanks" :key="`home-rank-${rank.label}`">{{ rank.label }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td v-for="rank in matchup.homeTeam.offenseRanks" :key="`home-rank-val-${rank.label}`">
                        <span class="rank-value">{{ formatMarketValue(rank.value) }}</span>
                        <span v-if="rank.rank" class="rank-meta">#{{ rank.rank }}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-else class="team-placeholder">No offense metrics available.</p>
            </div>

            <div class="team-section">
              <h3>Opponent Defense</h3>
              <div v-if="matchup.homeTeam.opponentDefenseRanks.length" class="rank-table-wrapper">
                <table class="rank-table">
                  <thead>
                    <tr>
                      <th v-for="rank in matchup.homeTeam.opponentDefenseRanks" :key="`home-opp-${rank.label}`">
                        {{ rank.label }}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td v-for="rank in matchup.homeTeam.opponentDefenseRanks" :key="`home-opp-val-${rank.label}`">
                        <span class="rank-value">{{ formatMarketValue(rank.value) }}</span>
                        <span v-if="rank.rank" class="rank-meta">#{{ rank.rank }}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-else class="team-placeholder">No opponent defense metrics available.</p>
            </div>

            <div class="team-section">
              <h3>Players</h3>
              <p class="section-helper">Click a player to open the modal, right-click to add to picks.</p>
              <div v-if="matchup.homeTeam.playerSections?.length" class="player-sections">
                <section
                  v-for="section in matchup.homeTeam.playerSections"
                  :key="`home-section-${section.key}`"
                  class="players-table-wrapper"
                >
                  <header class="players-section-header">{{ section.label }}</header>
                  <table class="players-table">
                    <thead>
                      <tr>
                        <th v-for="column in section.columns" :key="`home-head-${section.key}-${column.key}`">
                          {{ column.label }}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="row in section.rows"
                        :key="`home-row-${section.key}-${row.id}`"
                        class="player-row"
                        @click="openPlayerModal(matchup.homeTeam, row)"
                      >
                        <td
                          v-for="column in section.columns"
                          :key="`home-cell-${section.key}-${row.id}-${column.key}`"
                          @contextmenu.prevent="handlePlayerPick($event, matchup.homeTeam, section, row, column)"
                        >
                          <template v-if="column.key === 'name'">
                            <span class="player-name">{{ row.name }}</span>
                          </template>
                          <template v-else-if="column.key === 'position'">
                            <span class="player-position">{{ row.position }}</span>
                          </template>
                          <template v-else>
                            <div class="stat-cell">
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
              <p v-else class="team-placeholder">No player markets available.</p>
            </div>
          </section>
        </div>
      </article>
    </section>

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
      <NhlPlayerStatsModal
        v-if="playerModalState.visible"
        :visible="playerModalState.visible"
        :player-id="playerModalState.playerId"
        :team-id="playerModalState.teamId"
        :player-name="playerModalState.playerName"
        :player-position="playerModalState.playerPosition"
        :team-code="playerModalState.teamCode"
        :opponent-code="playerModalState.opponentCode"
        :opponent-defense="playerModalState.opponentDefense"
        :player-type="playerModalState.playerType"
        :market="playerModalState.market"
        :initial-stats="playerModalState.initialStats"
        :auto-fetch="false"
        @close="closePlayerModal"
      />
    </transition>

    <transition name="modal-fade">
      <NhlTeamStatsModal
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

.nhl-view {
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
  gap: 20px;
}

.matchup-header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 24px;
}

.matchup-title {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  color: #f1f5f9;
}

.matchup-code {
  font-size: 22px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: #f1f5f9;
}

.matchup-date {
  margin-top: 6px;
  font-size: 14px;
  color: #94a3b8;
}

.teams-wrapper {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 24px;
  margin-bottom: 24px;
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

.team-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.team-name {
  margin: 0;
  font-size: 18px;
  color: #38bdf8;
  text-align: center;
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
}

.section-helper {
  margin: 0;
  font-size: 12px;
  color: #64748b;
}

.team-placeholder {
  margin: 0;
  font-size: 13px;
  color: #94a3b8;
  font-style: italic;
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
  color: #e2e8f0;
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

.players-table th {
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #cbd5f5;
  background: rgba(15, 23, 42, 0.55);
  font-weight: 700;
}

.players-table th:first-child,
.players-table td:first-child {
  width: 32%;
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

.players-table tbody tr:nth-child(even) {
  background: rgba(15, 23, 42, 0.6);
}

.player-row {
  transition: background-color 0.2s ease;
  cursor: pointer;
}

.player-row:hover {
  background: rgba(56, 189, 248, 0.08);
}

.player-name {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  font-weight: 600;
  color: #f1f5f9;
}

.player-position {
  font-size: 12px;
  color: #94a3b8;
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
  color: #f1f5f9;
}

.stat-last-five {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: #94a3b8;
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
  color: #94a3b8;
}

.status-message + .matchups-grid {
  margin-top: 24px;
}

@media (max-width: 768px) {
  .matchup-card {
    padding: 20px;
  }

  .teams-wrapper {
    grid-template-columns: 1fr;
  }
}
</style>

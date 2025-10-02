<template>
  <div class="modal-backdrop" @click.self="close">
    <div class="modal-content">
      <header class="modal-header">
        <div class="modal-header__title">
          <h2 class="modal-title">{{ teamDisplayName }}</h2>
          <p v-if="recordLabel" class="modal-subtitle modal-record">{{ recordLabel }}</p>
        </div>
        <button type="button" class="close-button" @click="close">×</button>
      </header>

      <section v-if="teamMarkets.length" class="modal-section market-section">
        <h3>Mercados</h3>
        <div class="market-table-wrapper">
          <table class="market-table">
            <thead>
              <tr>
                <th
                  v-for="market in teamMarkets"
                  :key="market.label ?? market.shortLabel ?? market.value"
                  :title="market.label"
                >
                  {{ market.shortLabel ?? market.label }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td
                  v-for="market in teamMarkets"
                  :key="`value-${market.label ?? market.shortLabel ?? market.value}`"
                >
                  <span class="market-value">{{ market.value ?? '-' }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="modal-section stats-section">
        <h3>Games</h3>
        <div v-if="loading" class="modal-state">Cargando historial...</div>
        <div v-else-if="error" class="modal-state error">{{ error }}</div>
        <div v-else-if="!parsedGames.length" class="modal-state">Sin juegos registrados.</div>
        <div v-else class="table-wrapper games-table-wrapper">
          <table class="games-table">
            <thead>
              <tr>
                <th>Week</th>
                <th>Date</th>
                <th>Rival</th>
                <th>Scores</th>
                <th>Handicap</th>
                <th>Points</th>
                <th>Solo</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="game in visibleGames" :key="game.id">
                <td>{{ game.week }}</td>
                <td>{{ game.date }}</td>
                <td>{{ game.rival }}</td>
                <td class="score-cell">
                  <strong>{{ game.points.team ?? '-' }}</strong>
                  <span class="score-separator">-</span>
                  <span>{{ game.points.opponent ?? '-' }}</span>
                </td>
                <td>
                  <span :class="['metric', game.handicap.class]">
                    {{ game.handicap.value }}
                  </span>
                </td>
                <td>
                  <span :class="['metric', game.totals.class]">
                    {{ game.totals.value }}
                  </span>
                </td>
                <td>
                  <span :class="['metric', game.solo.class]">
                    {{ game.solo.value }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import axios from 'axios';

import { buildNflApiUrl } from '../utils/nflApi';

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
  teamId: {
    type: [Number, String],
    required: true,
  },
  teamName: {
    type: String,
    default: '',
  },
  limit: {
    type: Number,
    default: 10,
  },
  markets: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(['close']);

const TEAM_GAMES_URL = (teamId) => buildNflApiUrl(`games?team=${encodeURIComponent(teamId)}`);

const rawGames = ref([]);
const loading = ref(false);
const error = ref('');
const lastLoadedTeam = ref(null);

const normalizedTeamId = computed(() => normalizeId(props.teamId));

const teamDisplayName = computed(() => {
  if (props.teamName) return props.teamName;
  const teamId = normalizedTeamId.value;
  return teamId ? `Equipo ${teamId}` : 'Equipo';
});

const teamMarkets = computed(() => {
  if (!Array.isArray(props.markets)) return [];
  return props.markets.filter((entry) => entry && typeof entry === 'object');
});

const parsedGames = computed(() => {
  const teamId = normalizedTeamId.value;
  if (!teamId) return [];
  return rawGames.value
    .map((game) => transformGame(game, teamId))
    .filter(Boolean)
    .sort((a, b) => {
      if (a.timestamp && b.timestamp) return b.timestamp - a.timestamp;
      if (a.timestamp) return -1;
      if (b.timestamp) return 1;
      return Number(b.week ?? 0) - Number(a.week ?? 0);
    });
});

const visibleGames = computed(() => {
  const limitValue = Number(props.limit);
  if (!Number.isFinite(limitValue) || limitValue <= 0) {
    return parsedGames.value;
  }
  return parsedGames.value.slice(0, limitValue);
});

const teamRecord = computed(() => {
  const record = { wins: 0, losses: 0, ties: 0 };
  parsedGames.value.forEach((game) => {
    if (game.points.team === null || game.points.opponent === null) return;
    if (game.points.team > game.points.opponent) record.wins += 1;
    else if (game.points.team < game.points.opponent) record.losses += 1;
    else record.ties += 1;
  });
  return record;
});

const recordLabel = computed(() => {
  const { wins, losses, ties } = teamRecord.value;
  if (!wins && !losses && !ties) return '';
  return `${wins}-${losses}${ties ? `-${ties}` : ''}`;
});

watch(
  () => props.visible,
  (isVisible) => {
    if (isVisible) {
      fetchTeamGames();
    }
  },
  { immediate: true }
);

watch(
  () => props.teamId,
  () => {
    if (props.visible) {
      fetchTeamGames(true);
    } else {
      rawGames.value = [];
      lastLoadedTeam.value = null;
    }
  }
);

async function fetchTeamGames(force = false) {
  const teamId = normalizedTeamId.value;
  if (!teamId) return;
  if (!force && lastLoadedTeam.value === teamId && rawGames.value.length) return;

  const requestTeamId = teamId;
  loading.value = true;
  error.value = '';
  try {
    const { data } = await axios.get(TEAM_GAMES_URL(requestTeamId));
    if (requestTeamId !== normalizedTeamId.value) return;
    const payload = data ?? [];
    rawGames.value = Array.isArray(payload) ? payload : toArray(payload);
    lastLoadedTeam.value = requestTeamId;
  } catch (err) {
    if (requestTeamId !== normalizedTeamId.value) return;
    error.value = 'No se pudo cargar el historial del equipo.';
    rawGames.value = [];
  } finally {
    if (requestTeamId === normalizedTeamId.value) {
      loading.value = false;
    }
  }
}

function transformGame(game, teamId) {
  if (!game) return null;
  const statsList = Array.isArray(game.stats) ? game.stats : [];
  const teamEntry = statsList.find((entry) => normalizeId(entry?.team_id) === teamId);
  if (!teamEntry) return null;
  const opponentEntry = statsList.find((entry) => normalizeId(entry?.team_id) !== teamId) ?? null;

  const isAway = teamEntry.is_away === 1 || teamEntry.is_away === true;
  const opponentCode = isAway ? game.home_team?.code : game.away_team?.code;
  const rivalLabel = opponentCode ? `${isAway ? '@' : ''}${opponentCode}` : '-';

  const teamPoints = parseNumeric(teamEntry.points_total);
  const opponentPoints = parseNumeric(opponentEntry?.points_total);
  const combinedPoints =
    teamPoints !== null && opponentPoints !== null ? teamPoints + opponentPoints : null;

  const market = resolveMarketObject(game.market);
  const handicapValue = computeHandicapValue(market, teamId, isAway);
  const handicapOutcome = evaluateHandicap(handicapValue?.line, teamPoints, opponentPoints);

  const totalsValue = parseNumeric(market?.total_points);
  const totalsOutcome = evaluateTotals(totalsValue, combinedPoints);

  const soloValue = determineSoloPoints(market, isAway);
  const soloOutcome = evaluateSolo(soloValue, teamPoints);

  const playedAt = game.played_at ?? game.updated_at ?? game.created_at ?? null;

  return {
    id: game.id ?? game.external_id ?? `${teamId}-${game.week ?? 'game'}`,
    week: game.week ?? '-',
    date: formatShortDate(playedAt),
    timestamp: readTimestamp(playedAt),
    rival: rivalLabel,
    points: {
      team: teamPoints,
      opponent: opponentPoints,
    },
    scoreLabel:
      teamPoints !== null && opponentPoints !== null
        ? `${teamPoints} - ${opponentPoints}`
        : '-',
    handicap: {
      value: handicapValue?.display ?? '-',
      class: handicapOutcome,
    },
    totals: {
      value: totalsValue !== null ? formatNumber(totalsValue) : '-',
      class: totalsOutcome,
    },
    solo: {
      value: soloValue !== null ? formatNumber(soloValue) : '-',
      class: soloOutcome,
    },
  };
}

function normalizeId(value) {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

function toArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  if (payload && typeof payload === 'object' && Array.isArray(payload.results)) return payload.results;
  return [];
}

function parseNumeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatNumber(value) {
  if (value === null || value === undefined) return '-';
  if (!Number.isFinite(value)) return value;
  return Number.isInteger(value) ? value : Number(value.toFixed(1));
}

function formatShortDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' });
}

function readTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  const timestamp = date.getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function resolveMarketObject(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const candidate = entry.market ?? entry.markets ?? null;
  if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
    return candidate;
  }
  const keys = ['handicap', 'total_points', 'favorite_team_id'];
  if (keys.some((key) => entry[key] !== undefined)) {
    return entry;
  }
  return null;
}

function computeHandicapValue(market, teamId, isAway) {
  if (!market) return null;
  const rawLine = parseNumeric(market.handicap);
  if (rawLine === null) return null;
  const favoriteId = normalizeId(market.favorite_team_id);
  const absLine = Math.abs(rawLine);
  const isFavorite = favoriteId && normalizeId(teamId) === favoriteId;
  const normalizedLine = isFavorite ? -absLine : absLine;
  const display = `${normalizedLine > 0 ? '+' : ''}${formatNumber(normalizedLine)}`;
  return { line: normalizedLine, display, isFavorite, isAway };
}

function evaluateHandicap(line, teamPoints, opponentPoints) {
  if (line === null || teamPoints === null || opponentPoints === null) return 'metric--neutral';
  const margin = teamPoints - opponentPoints;
  const adjusted = margin + line;
  if (adjusted > 0) return 'metric--positive';
  if (adjusted < 0) return 'metric--negative';
  return 'metric--neutral';
}

function evaluateTotals(totalLine, combinedPoints) {
  if (totalLine === null || combinedPoints === null) return 'metric--neutral';
  if (totalLine < combinedPoints) return 'metric--positive';
  if (totalLine > combinedPoints) return 'metric--negative';
  return 'metric--neutral';
}

function determineSoloPoints(market, isAway) {
  if (!market) return null;
  const key = isAway ? 'away_team_solo_points' : 'home_team_solo_points';
  return parseNumeric(market[key]);
}

function evaluateSolo(soloLine, teamPoints) {
  if (soloLine === null || teamPoints === null) return 'metric--neutral';
  if (soloLine < teamPoints) return 'metric--positive';
  if (soloLine > teamPoints) return 'metric--negative';
  return 'metric--neutral';
}

const close = () => emit('close');
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background-color: rgba(15, 23, 42, 0.8);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 70;
}

.modal-content {
  background: #0f172a;
  color: #e2e8f0;
  padding: 24px;
  border-radius: 12px;
  max-height: 85vh;
  overflow-y: auto;
  min-width: 900px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.8);
}

.modal-header {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: 16px;
}

.modal-header__title {
  text-align: center;
}

.modal-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  text-transform: uppercase;
}

.modal-record {
  margin: 4px 0 0;
  color: #60a5fa;
}

.modal-subtitle {
  font-size: 12px;
  color: #94a3b8;
  margin: 4px 0 0;
}

.close-button {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 24px;
  cursor: pointer;
  position: absolute;
  top: 0;
  right: 0;
}

.modal-section {
  margin-bottom: 24px;
}

.modal-section h3 {
  margin: 0 0 8px;
  font-size: 14px;
  text-transform: uppercase;
  color: #38bdf8;
  text-align: center;
}

.market-section .market-table-wrapper {
  display: flex;
  justify-content: center;
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

.stats-section {
  border-top: 1px solid rgba(148, 163, 184, 0.1);
  padding-top: 16px;
}

.games-table-wrapper {
  overflow-x: auto;
}

.games-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  min-width: 560px;
}

.games-table thead {
  background: rgba(30, 41, 59, 0.8);
}

.games-table th,
.games-table td {
  border: 1px solid rgba(71, 85, 105, 0.4);
  padding: 8px;
  text-align: center;
  font-size: 12px;
}

.score-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.score-separator {
  color: #94a3b8;
}

.metric {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 48px;
  padding: 0 4px;
  font-weight: 600;
  font-size: 12px;
  color: #e2e8f0;
  transition: color 0.2s ease;
}

.metric--positive {
  color: #22c55e;
}

.metric--negative {
  color: #ef4444;
}

.metric--neutral {
  color: #f8fafc;
}

.modal-state {
  padding: 16px;
  text-align: center;
  color: #94a3b8;
}

.modal-state.error {
  color: #ef4444;
}
</style>

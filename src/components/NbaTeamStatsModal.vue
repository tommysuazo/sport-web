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
        <h3>Juegos</h3>
        <div v-if="loading" class="modal-state">Cargando historial...</div>
        <div v-else-if="error" class="modal-state error">{{ error }}</div>
        <div v-else-if="!parsedGames.length" class="modal-state">Sin juegos registrados.</div>
        <div v-else class="table-wrapper games-table-wrapper">
          <table class="games-table">
            <thead>
              <tr>
                <th>Juego</th>
                <th>Fecha</th>
                <th>Rival</th>
                <th>Marcador</th>
                <th>1H</th>
                <th>2H</th>
                <th>Reb</th>
                <th>Ast</th>
                <th>Pérd</th>
                <th>FG%</th>
                <th>3P%</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="game in visibleGames" :key="game.id">
                <td>{{ game.game }}</td>
                <td>{{ game.date }}</td>
                <td>{{ game.rival }}</td>
                <td class="score-cell">
                  <strong>{{ game.points.team ?? '-' }}</strong>
                  <span class="score-separator">-</span>
                  <span>{{ game.points.opponent ?? '-' }}</span>
                </td>
                <td>{{ game.firstHalf }}</td>
                <td>{{ game.secondHalf }}</td>
                <td>{{ game.rebounds }}</td>
                <td>{{ game.assists }}</td>
                <td>{{ game.turnovers }}</td>
                <td>{{ game.fieldGoalPct }}</td>
                <td>{{ game.threePointPct }}</td>
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

import { buildNbaApiUrl } from '../utils/nbaApi';

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

const TEAM_GAMES_URL = (teamId) => buildNbaApiUrl(`games?team=${encodeURIComponent(teamId)}`);

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
      return Number(b.game ?? 0) - Number(a.game ?? 0);
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
  const record = { wins: 0, losses: 0, ot: 0 };
  parsedGames.value.forEach((game) => {
    if (game.points.team === null || game.points.opponent === null) return;
    if (game.points.team > game.points.opponent) record.wins += 1;
    else if (game.points.team < game.points.opponent) record.losses += 1;
    else record.ot += 1;
  });
  return record;
});

const recordLabel = computed(() => {
  const { wins, losses, ot } = teamRecord.value;
  if (!wins && !losses && !ot) return '';
  return `${wins}-${losses}${ot ? `-${ot}` : ''}`;
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
    const games = Array.isArray(payload) ? payload : toArray(payload);
    rawGames.value = games;
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
  const opponentShort = isAway ? game.home_team?.short_name : game.away_team?.short_name;
  const rivalLabel = opponentShort ? `${isAway ? '@' : ''}${opponentShort}` : '-';

  const teamPoints = parseNumeric(teamEntry.points);
  const opponentPoints = parseNumeric(opponentEntry?.points);

  const firstHalf = parseNumeric(teamEntry.first_half_points);
  const secondHalf = parseNumeric(teamEntry.second_half_points);
  const rebounds = parseNumeric(teamEntry.rebounds);
  const assists = parseNumeric(teamEntry.assists);
  const turnovers = parseNumeric(teamEntry.turnovers);

  const fgMade = parseNumeric(teamEntry.field_goals_made);
  const fgAttempted = parseNumeric(teamEntry.field_goals_attempted);
  const threeMade = parseNumeric(teamEntry.three_pointers_made);
  const threeAttempted = parseNumeric(teamEntry.three_pointers_attempted);

  const fieldGoalPct = calculatePercentage(fgMade, fgAttempted);
  const threePointPct = calculatePercentage(threeMade, threeAttempted);

  const playedAt = game.start_at ?? game.played_at ?? game.updated_at ?? null;

  return {
    id: game.id ?? game.external_id ?? `${teamId}-${playedAt ?? 'game'}`,
    game: game.external_id ?? game.id ?? '-',
    date: formatShortDate(playedAt),
    timestamp: readTimestamp(playedAt),
    rival: rivalLabel,
    points: {
      team: teamPoints,
      opponent: opponentPoints,
    },
    firstHalf: formatNumber(firstHalf),
    secondHalf: formatNumber(secondHalf),
    rebounds: formatNumber(rebounds),
    assists: formatNumber(assists),
    turnovers: formatNumber(turnovers),
    fieldGoalPct,
    threePointPct,
  };
}

function calculatePercentage(made, attempted) {
  if (made === null || attempted === null || attempted <= 0) return '-';
  const pct = (made / attempted) * 100;
  return `${formatNumber(pct)}%`;
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
  background: #0a0e1a;
  color: #e2e8f0;
  padding: 24px;
  border-radius: 12px;
  max-height: 85vh;
  overflow-y: auto;
  width: 800px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.8);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
}

.modal-header__title {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.modal-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #38bdf8;
}

.modal-subtitle {
  margin: 0;
  font-size: 13px;
  color: #94a3b8;
}

.modal-record {
  font-weight: 500;
  letter-spacing: 0.05em;
}

.close-button {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 24px;
  cursor: pointer;
  transition: color 0.2s ease;
}

.close-button:hover {
  color: #f8fafc;
}

.modal-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 16px;
}

.modal-section h3 {
  margin: 0;
  font-size: 14px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #f8fafc;
}

.market-table-wrapper {
  overflow-x: auto;
}

.market-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 320px;
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid rgba(56, 189, 248, 0.12);
  border-radius: 12px;
  table-layout: fixed;
}

.market-table th,
.market-table td {
  padding: 8px;
  text-align: center;
  font-size: 13px;
  border: 1px solid rgba(56, 189, 248, 0.08);
  color: #cbd5f5;
}

.market-table th {
  font-weight: 600;
  text-transform: uppercase;
}

.market-value {
  font-weight: 600;
  color: #facc15;
}

.modal-state {
  padding: 24px;
  background: rgba(15, 23, 42, 0.4);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 12px;
  text-align: center;
  font-size: 14px;
  color: #cbd5f5;
}

.modal-state.error {
  color: #f87171;
  border-color: rgba(248, 113, 113, 0.4);
}

.games-table-wrapper {
  overflow-x: auto;
}

.games-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 640px;
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid rgba(56, 189, 248, 0.12);
  border-radius: 12px;
  font-size: 13px;
}

.games-table thead {
  background: rgba(15, 23, 42, 0.7);
}

.games-table th,
.games-table td {
  padding: 10px;
  text-align: center;
  border: 1px solid rgba(56, 189, 248, 0.08);
  color: #e2e8f0;
}

.games-table th {
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
  color: #9ca3af;
}

.score-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: #f8fafc;
}

.score-separator {
  font-weight: 400;
  color: #94a3b8;
}
</style>

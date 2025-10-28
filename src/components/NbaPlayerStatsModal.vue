<template>
  <div class="modal-backdrop" @click.self="close">
    <div class="modal-content player-modal">
      <header class="player-modal-header">
        <div class="player-modal-heading">
          <h3 class="player-modal-title">{{ playerName }}</h3>
          <p v-if="playerSubtitle" class="player-modal-subtitle">{{ playerSubtitle }}</p>
        </div>
        <button type="button" class="modal-close-button" @click="close">×</button>
      </header>

      <section class="player-modal-body">
        <div class="modal-summary-row">
          <section class="modal-summary-card">
            <header class="modal-summary-title">{{ defenseTitle }}</header>
            <div v-if="defenseStats.length" class="modal-summary-table-wrapper market-table-wrapper">
              <table class="modal-summary-table market-table rank-table">
                <thead>
                  <tr>
                    <th v-for="stat in defenseStats" :key="`def-head-${stat.label}`">
                      {{ stat.label }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td v-for="stat in defenseStats" :key="`def-val-${stat.label}`">
                      <span class="rank-value">{{ stat.value }}</span>
                      <span v-if="stat.rank" class="rank-meta">#{{ stat.rank }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="modal-placeholder">Sin datos defensivos.</p>
          </section>

          <section class="modal-summary-card">
            <header class="modal-summary-title">Mercados</header>
            <div v-if="marketColumns.length" class="modal-summary-table-wrapper market-table-wrapper">
              <table class="modal-summary-table market-table">
                <thead>
                  <tr>
                    <th v-for="column in marketColumns" :key="`market-head-${column.key}`">
                      {{ column.label }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td v-for="column in marketColumns" :key="`market-val-${column.key}`">
                      <span class="market-value">{{ marketRow[column.key] ?? '-' }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="modal-placeholder">Sin mercados activos.</p>
          </section>
        </div>

        <h4 class="modal-section-title">{{ sectionTitle }}</h4>

        <div class="modal-stats-table-wrapper games-table-wrapper">
          <div v-if="loading" class="modal-state">Cargando estadísticas...</div>
          <div v-else-if="error" class="modal-state error">{{ error }}</div>
          <template v-else>
            <table v-if="performanceRows.length" class="modal-stats-table games-table">
              <thead>
                <tr>
                  <th>DATE</th>
                  <th>VS</th>
                  <th>MIN</th>
                  <th v-for="stat in STAT_TYPES" :key="`stat-head-${stat}`">
                    {{ STAT_LABELS[stat] }}
                  </th>
                  <th>FG</th>
                  <th>FT</th>
                  <th>FOULS</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in performanceRows"
                  :key="row.id"
                  :class="['game-row', { 'game-row--active': row.id === selectedGameId }]"
                  @click="selectGame(row.id)"
                >
                  <td>{{ row.date }}</td>
                  <td>{{ row.versus }}</td>
                  <td>{{ row.minutes }}</td>
                  <td
                    v-for="stat in STAT_TYPES"
                    :key="`metric-${row.id}-${stat}`"
                    :class="['value-cell', resolveMetricClass(stat, row.metrics[stat])]"
                  >
                    {{ row.metrics[stat]?.display ?? '-' }}
                  </td>
                  <td class="value-cell stat-neutral-text">{{ row.fieldGoals }}</td>
                  <td class="value-cell stat-neutral-text">{{ row.freeThrows }}</td>
                  <td class="value-cell stat-neutral-text">{{ row.fouls }}</td>
                </tr>
              </tbody>
            </table>
            <p v-else class="modal-placeholder">Sin registros de juegos.</p>
            <section v-if="selectedGameDetails" class="game-details-card">
              <header class="game-details-header">
                <div class="game-details-meta">
                  <p class="game-details-date">{{ selectedGameDetails.date }}</p>
                  <p class="game-details-matchup">
                    {{ selectedGameDetails.teamLabel }}
                    <span class="game-details-score" v-if="selectedGameDetails.score">
                      {{ selectedGameDetails.score }}
                    </span>
                    vs
                    {{ selectedGameDetails.opponentLabel }}
                  </p>
                  <p class="game-details-minutes">MIN {{ selectedGameDetails.minutes }}</p>
                </div>
              </header>
              <div class="game-details-grid">
                <div
                  v-for="stat in selectedGameDetails.primaryStats"
                  :key="`detail-${stat.label}`"
                  class="game-details-item"
                >
                  <p class="game-details-label">{{ stat.label }}</p>
                  <p class="game-details-value">{{ stat.value }}</p>
                </div>
              </div>
              <div class="game-details-grid secondary">
                <div
                  v-for="stat in selectedGameDetails.secondaryStats"
                  :key="`secondary-${stat.label}`"
                  class="game-details-item"
                >
                  <p class="game-details-label">{{ stat.label }}</p>
                  <p class="game-details-value">{{ stat.value }}</p>
                </div>
              </div>
            </section>
          </template>
        </div>
      </section>
    </div>
  </div>
</template>




<script setup>
import { computed, ref, watch } from 'vue';
import axios from 'axios';

import { buildNbaApiUrl } from '../utils/nbaApi';

const STAT_TYPES = ['points', 'rebounds', 'assists', 'pra', 'pt3'];

const STAT_LABELS = {
  points: 'PTS',
  rebounds: 'REB',
  assists: 'AST',
  pra: 'PRA',
  pt3: 'PT3',
};

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
  playerId: {
    type: [Number, String],
    required: true,
  },
  teamId: {
    type: [Number, String],
    default: null,
  },
  teamCode: {
    type: String,
    default: '',
  },
  opponentCode: {
    type: String,
    default: '',
  },
  playerName: {
    type: String,
    default: '',
  },
  playerPosition: {
    type: String,
    default: '',
  },
  market: {
    type: Object,
    default: () => ({}),
  },
  initialStats: {
    type: Array,
    default: () => [],
  },
  opponentDefense: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(['close']);

const playerStats = ref([]);
const loading = ref(false);
const error = ref('');
const selectedGameId = ref(null);

const normalizedPlayerId = computed(() => normalizeId(props.playerId));

const playerSubtitle = computed(() => {
  const tokens = [];
  const team = formatCode(props.teamCode);
  const opponent = formatCode(props.opponentCode);
  if (team && opponent) {
    tokens.push(`${team} vs ${opponent}`);
  } else if (team) {
    tokens.push(team);
  } else if (opponent) {
    tokens.push(`vs ${opponent}`);
  }
  if (props.playerPosition) {
    tokens.push(props.playerPosition.toUpperCase());
  }
  return tokens.join(' • ');
});

const currentMarkets = computed(() => {
  const snapshot = {};
  STAT_TYPES.forEach((key) => {
    const rawValue = props.market?.[key];
    const numeric = parseNumeric(
      typeof rawValue === 'object' && rawValue !== null ? rawValue.value ?? rawValue.line : rawValue
    );
    if (numeric !== null) {
      snapshot[key] = numeric;
    }
  });
  return snapshot;
});

const defenseTitle = computed(() => {
  const code = (props.opponentCode ?? '').toString().trim().toUpperCase();
  return code ? `${code} Defensive Ranks` : 'Defensive Ranks';
});

const defenseStats = computed(() =>
  toArray(props.opponentDefense)
    .map((entry, index) => ({
      key: entry.label ?? `def-${index}`,
      label: (entry.label ?? 'STAT').toUpperCase(),
      value: formatNumericDisplay(parseNumeric(entry.value)),
      rank: entry.rank ?? null,
    }))
    .filter((entry) => entry.value !== '-')
);

const marketColumns = computed(() =>
  STAT_TYPES.map((key) => ({
    key,
    label: STAT_LABELS[key] ?? key.toUpperCase(),
  }))
);

const marketRow = computed(() => {
  const row = {};
  STAT_TYPES.forEach((key) => {
    const rawValue = props.market?.[key];
    const valueToUse =
      typeof rawValue === 'object' && rawValue !== null ? rawValue.value ?? rawValue.line : rawValue;
    row[key] = formatNumericDisplay(parseNumeric(valueToUse));
  });
  return row;
});

const sectionTitle = computed(() => 'Last 16 games');

const resolvedStats = computed(() => {
  if (playerStats.value.length) return playerStats.value;
  return toArray(props.initialStats);
});

const performanceRows = computed(() =>
  resolvedStats.value
    .map((entry) => transformStatEntry(entry, currentMarkets.value))
    .filter(Boolean)
    .sort((a, b) => {
      if (a.timestamp && b.timestamp) return b.timestamp - a.timestamp;
      if (a.timestamp) return -1;
      if (b.timestamp) return 1;
      return 0;
    })
);

const selectedGameDetails = computed(() => {
  if (!selectedGameId.value) return null;
  return performanceRows.value.find((row) => row.id === selectedGameId.value)?.details ?? null;
});

watch(
  () => props.visible,
  (isVisible) => {
    if (isVisible) {
      loadPlayerStats(true);
    } else {
      selectedGameId.value = null;
    }
  }
);

watch(
  () => props.playerId,
  () => {
    if (props.visible) {
      loadPlayerStats(true);
    } else {
      playerStats.value = [];
      loading.value = false;
      error.value = '';
      selectedGameId.value = null;
    }
  }
);

watch(
  () => performanceRows.value,
  () => {
    if (!performanceRows.value.some((row) => row.id === selectedGameId.value)) {
      selectedGameId.value = null;
    }
  }
);

async function loadPlayerStats(force = false) {
  const playerId = normalizedPlayerId.value;
  if (!playerId) return;
  if (!force && playerStats.value.length) return;
  loading.value = true;
  error.value = '';
  try {
    const { data } = await axios.get(buildNbaApiUrl(`players/${encodeURIComponent(playerId)}/stats`));
    playerStats.value = toArray(data?.stats ?? data);
  } catch (err) {
    console.warn('Unable to load NBA player stats', playerId, err);
    playerStats.value = toArray(props.initialStats);
    error.value = 'No se pudieron cargar las estadísticas del jugador.';
  } finally {
    loading.value = false;
    if (!playerStats.value.some((entry) => entry?.id === selectedGameId.value)) {
      selectedGameId.value = null;
    }
  }
}

function transformStatEntry(entry, markets) {
  if (!entry) return null;
  const game = entry.game ?? {};
  const isAway = entry.is_away === 1 || entry.is_away === true;

  const opponentTeam = isAway ? game.home_team ?? {} : game.away_team ?? {};
  const opponentCode = formatCode(opponentTeam.short_name ?? opponentTeam.code ?? opponentTeam.name);
  const opponentLabel = opponentCode ? (isAway ? `@${opponentCode}` : opponentCode) : '-';

  const playerTeam = isAway ? game.away_team ?? {} : game.home_team ?? {};
  const playerTeamCode = formatCode(playerTeam.short_name ?? playerTeam.code ?? playerTeam.name);
  const teamTotals = findTeamTotals(game, entry.team_id, true);
  const opponentTotals = findTeamTotals(game, entry.team_id, false);
  const score =
    teamTotals.points !== null && opponentTotals.points !== null
      ? `${formatNumericDisplay(teamTotals.points)}-${formatNumericDisplay(opponentTotals.points)}`
      : null;

  const timestamp = readTimestamp(game.start_at ?? entry.updated_at ?? entry.created_at);
  const date = formatShortDate(game.start_at ?? entry.updated_at ?? entry.created_at);
  const minutes = formatMinutes(entry.mins ?? entry.minutes);

  const points = parseNumeric(entry.points);
  const rebounds = parseNumeric(entry.rebounds);
  const assists = parseNumeric(entry.assists);
  const threesMade = parseNumeric(entry.three_pointers_made);
  const pra = safeSum(points, rebounds, assists);
  const fouls = parseNumeric(entry.fouls);

  const metrics = {
    points: buildMetric(points, markets.points),
    rebounds: buildMetric(rebounds, markets.rebounds),
    assists: buildMetric(assists, markets.assists),
    pt3: buildMetric(threesMade, markets.pt3),
    pra: buildMetric(pra, markets.pra),
  };

  const fieldGoals = formatAttemptLine(entry.field_goals_made, entry.field_goals_attempted);
  const threePointers = formatAttemptLine(entry.three_pointers_made, entry.three_pointers_attempted);
  const freeThrows = formatAttemptLine(entry.free_throws_made, entry.free_throws_attempted);
  if (threePointers !== '-') {
    metrics.pt3.display = threePointers;
  }

  const details = {
    date,
    teamLabel: playerTeamCode || 'TEAM',
    opponentLabel: opponentCode || '-',
    minutes: minutes === '-' ? '--' : minutes,
    score,
    primaryStats: [
      { label: 'PTS', value: formatNumericDisplay(points) },
      { label: 'REB', value: formatNumericDisplay(rebounds) },
      { label: 'AST', value: formatNumericDisplay(assists) },
      { label: 'PRA', value: formatNumericDisplay(pra) },
      { label: 'PT3', value: metrics.pt3.display },
      { label: 'FOULS', value: formatNumericDisplay(fouls) },
    ],
    secondaryStats: [
      { label: 'STL', value: formatNumericDisplay(parseNumeric(entry.steals)) },
      { label: 'BLK', value: formatNumericDisplay(parseNumeric(entry.blocks)) },
      { label: 'TOV', value: formatNumericDisplay(parseNumeric(entry.turnovers)) },
      { label: 'FG', value: fieldGoals },
      { label: '3P', value: threePointers },
      { label: 'FT', value: freeThrows },
    ],
  };

  return {
    id: entry.id ?? entry.game_id ?? `${opponentLabel}-${timestamp ?? Math.random()}`,
    versus: opponentLabel,
    date,
    minutes,
    metrics,
    fieldGoals,
    freeThrows,
    fouls: formatNumericDisplay(fouls),
    timestamp,
    details,
  };
}

function selectGame(id) {
  if (selectedGameId.value === id) {
    selectedGameId.value = null;
  } else {
    selectedGameId.value = id;
  }
}

function buildMetric(value, market) {
  if (value === null || value === undefined) {
    return { value: null, market, display: '-' };
  }
  return {
    value,
    market: market ?? null,
    display: formatNumericDisplay(value),
  };
}

function resolveMetricClass(_statKey, metric) {
  if (!metric || metric.value === null || metric.value === undefined) return 'stat-neutral-text';
  if (metric.market === null || metric.market === undefined) return 'stat-neutral-text';
  if (metric.value > metric.market) return 'stat-hit-text';
  if (metric.value < metric.market) return 'stat-miss-text';
  return 'stat-push-text';
}

function formatNumericDisplay(value) {
  if (value === null || value === undefined) return '-';
  if (!Number.isFinite(value)) return String(value);
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function findTeamTotals(game, playerTeamId, sameTeam) {
  const totals = Array.isArray(game.stats) ? game.stats : [];
  const normalizedPlayerTeam = normalizeId(playerTeamId);
  const entry = totals.find((teamStat) => {
    const normalizedTeamId = normalizeId(teamStat?.team_id);
    return sameTeam ? normalizedTeamId === normalizedPlayerTeam : normalizedTeamId !== normalizedPlayerTeam;
  });
  return {
    points: parseNumeric(entry?.points),
  };
}

function formatMinutes(value) {
  if (!value) return '-';
  if (typeof value === 'number') {
    const minutes = Math.floor(value);
    const seconds = Math.round((value - minutes) * 60);
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }
  return String(value);
}

function formatAttemptLine(made, attempted) {
  const madeValue = parseNumeric(made);
  const attemptedValue = parseNumeric(attempted);
  if (madeValue === null || attemptedValue === null) return '-';
  return `${formatNumericDisplay(madeValue)}-${formatNumericDisplay(attemptedValue)}`;
}

function safeSum(...values) {
  let total = 0;
  let hasValue = false;
  values.forEach((value) => {
    const numeric = parseNumeric(value);
    if (numeric !== null) {
      total += numeric;
      hasValue = true;
    }
  });
  return hasValue ? total : null;
}

function close() {
  emit('close');
}

function normalizeId(value) {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

function toArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  return [];
}

function parseNumeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatShortDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: '2-digit',
  });
}

function readTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  const timestamp = date.getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function formatCode(value) {
  if (!value) return '';
  return String(value).toUpperCase();
}
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
  width: 900px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.8);
}

.player-modal-header {
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.player-modal-header::before {
  content: '';
  width: 24px;
  height: 24px;
}

.player-modal-heading {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  text-align: center;
}

.player-modal-title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.player-modal-subtitle {
  margin: 0;
  font-size: 12px;
  color: #94a3b8;
}

.modal-close-button {
  position: absolute;
  right: 0;
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 24px;
  cursor: pointer;
}

.player-modal-body {
  display: flex;
  flex-direction: column;
  gap: 24px;
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
  margin: 0 0 8px;
  font-size: 14px;
  text-transform: uppercase;
  color: #38bdf8;
  text-align: center;
  font-weight: bold;
}

.modal-summary-table-wrapper {
  overflow-x: auto;
}

.modal-summary-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.modal-summary-table thead {
  background: rgba(30, 41, 59, 0.8);
}

.modal-summary-table th,
.modal-summary-table td {
  border: 1px solid rgba(71, 85, 105, 0.4);
  padding: 6px;
  text-align: center;
}

.modal-summary-table th {
  text-transform: uppercase;
  color: #cbd5f5;
}

.modal-summary-table td {
  font-weight: 600;
  color: #f8fafc;
}

.market-table-wrapper {
  display: flex;
  justify-content: center;
}

.market-table {
  width: 100%;
  border-collapse: collapse;
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid rgba(56, 189, 248, 0.12);
  border-radius: 12px;
  table-layout: fixed;
}

.market-table thead {
  text-transform: uppercase;
  background: #111b31;
}

.market-table th,
.market-table td {
  padding: 10px 12px;
  font-size: 12px;
  color: #cbd5f5;
  text-align: center;
  letter-spacing: 0.04em;
  border: none;
}

.market-value {
  font-weight: 700;
  color: #facc15;
  font-size: 14px;
}

.rank-table td {
  color: #f8fafc;
}

.rank-value {
  font-weight: 600;
  color: #facc15;
}

.rank-meta {
  margin-left: 4px;
  font-size: 11px;
  color: #38bdf8;
}

.modal-placeholder {
  margin: 0;
  font-size: 12px;
  color: #94a3b8;
  font-style: italic;
}

.modal-section-title {
  margin: 0;
  font-size: 14px;
  text-transform: uppercase;
  color: #38bdf8;
  text-align: center;
  font-weight: bold;
}

.modal-stats-table-wrapper {
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
  padding-top: 12px;
}

.modal-stats-table,
.games-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.games-table {
  min-width: 720px;
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid rgba(56, 189, 248, 0.12);
  border-radius: 12px;
  table-layout: fixed;
  overflow: hidden;
}

.modal-stats-table thead,
.games-table thead {
  background: #111b31;
}

.modal-stats-table th,
.modal-stats-table td,
.games-table th,
.games-table td {
  padding: 10px 12px;
  text-align: center;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border: none;
  color: #cbd5f5;
}

.games-table tbody tr {
  border-top: 1px solid rgba(56, 189, 248, 0.12);
}

.games-table tbody tr:first-child {
  border-top: none;
}

.games-table tbody tr:hover {
  background: rgba(59, 130, 246, 0.08);
}

.game-row {
  cursor: pointer;
  transition: background 0.2s ease;
}

.game-row--active {
  background: rgba(59, 130, 246, 0.18);
}

.value-cell {
  font-weight: 600;
}

.value-cell.stat-hit-text {
  color: #22c55e;
}

.value-cell.stat-miss-text {
  color: #ef4444;
}

.value-cell.stat-push-text {
  color: #facc15;
}

.value-cell.stat-neutral-text {
  color: #cbd5f5;
}

.game-details-card {
  background: rgba(15, 23, 42, 0.65);
  border: 1px solid rgba(56, 189, 248, 0.18);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.game-details-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(56, 189, 248, 0.12);
  padding-bottom: 8px;
}

.game-details-meta {
  text-align: left;
}

.game-details-date {
  margin: 0;
  font-size: 13px;
  color: #cbd5f5;
}

.game-details-matchup {
  margin: 4px 0 0;
  font-size: 14px;
  font-weight: 600;
  color: #38bdf8;
}

.game-details-score {
  margin: 0 6px;
  color: #f8fafc;
}

.game-details-minutes {
  margin: 4px 0 0;
  font-size: 12px;
  color: #94a3b8;
}

.game-details-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  gap: 12px;
}

.game-details-grid.secondary {
  border-top: 1px solid rgba(148, 163, 184, 0.1);
  padding-top: 12px;
}

.game-details-item {
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(56, 189, 248, 0.12);
  border-radius: 8px;
  padding: 8px;
  text-align: center;
}

.game-details-label {
  margin: 0;
  font-size: 11px;
  color: #94a3b8;
  letter-spacing: 0.04em;
}

.game-details-value {
  margin: 4px 0 0;
  font-size: 16px;
  font-weight: 600;
  color: #f8fafc;
}

.modal-state {
  padding: 16px;
  text-align: center;
  color: #94a3b8;
  font-size: 13px;
}

.modal-state.error {
  color: #ef4444;
}

@media (max-width: 1024px) {
  .modal-content {
    width: 95vw;
  }

  .modal-summary-row {
    flex-direction: column;
  }
}
</style>

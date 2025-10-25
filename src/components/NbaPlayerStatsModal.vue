<template>
  <div class="modal-backdrop" @click.self="close">
    <div class="modal-content">
      <header class="modal-header">
        <div class="modal-header__title">
          <h3 class="modal-title">{{ playerName }}</h3>
          <p v-if="playerSubtitle" class="modal-subtitle">{{ playerSubtitle }}</p>
        </div>
        <button type="button" class="close-button" @click="close">×</button>
      </header>

      <section class="modal-body">
        <div class="modal-summary-row">
          <section class="modal-summary-card">
            <header class="modal-summary-heading">Mercados</header>
            <div v-if="marketColumns.length" class="summary-table-wrapper">
              <table class="summary-table">
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

          <section class="modal-summary-card">
            <header class="modal-summary-heading">Promedios L5</header>
            <div v-if="recentAverages.length" class="summary-table-wrapper">
              <table class="summary-table">
                <thead>
                  <tr>
                    <th v-for="item in recentAverages" :key="`avg-head-${item.key}`">
                      {{ item.label }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td v-for="item in recentAverages" :key="`avg-val-${item.key}`">
                      {{ item.value }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="modal-placeholder">Sin datos suficientes.</p>
          </section>
        </div>

        <h4 class="modal-section-title">Últimos Juegos</h4>

        <div class="games-table-wrapper">
          <div v-if="loading" class="modal-state">Cargando estadísticas...</div>
          <div v-else-if="error" class="modal-state error">{{ error }}</div>
          <template v-else>
            <table v-if="performanceRows.length" class="games-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Rival</th>
                  <th>Min</th>
                  <th v-for="stat in STAT_TYPES" :key="`stat-head-${stat}`">
                    {{ STAT_LABELS[stat] }}
                  </th>
                  <th>FG</th>
                  <th>3P</th>
                  <th>FT</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in performanceRows" :key="row.id">
                  <td>{{ row.date }}</td>
                  <td>{{ row.opponent }}</td>
                  <td>{{ row.minutes }}</td>
                  <td
                    v-for="stat in STAT_TYPES"
                    :key="`metric-${row.id}-${stat}`"
                    :class="['metric-cell', resolveMetricClass(stat, row.metrics[stat])]"
                  >
                    {{ row.metrics[stat]?.display ?? '-' }}
                  </td>
                  <td>{{ row.fieldGoals }}</td>
                  <td>{{ row.threePointers }}</td>
                  <td>{{ row.freeThrows }}</td>
                </tr>
              </tbody>
            </table>
            <p v-else class="modal-placeholder">Sin registros de juegos.</p>
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

const STAT_TYPES = ['points', 'rebounds', 'assists', 'pt3', 'pra'];

const STAT_LABELS = {
  points: 'PTS',
  rebounds: 'REB',
  assists: 'AST',
  pt3: '3PT',
  pra: 'PRA',
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
});

const emit = defineEmits(['close']);

const playerStats = ref([]);
const loading = ref(false);
const error = ref('');

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

const recentAverages = computed(() => {
  if (!performanceRows.value.length) return [];
  const window = performanceRows.value.slice(0, 5);
  return STAT_TYPES.map((key) => {
    const sum = window.reduce((acc, row) => acc + (row.metrics[key]?.value ?? 0), 0);
    const avg = window.length ? sum / window.length : null;
    return {
      key,
      label: STAT_LABELS[key] ?? key.toUpperCase(),
      value: formatNumericDisplay(avg),
    };
  }).filter((item) => item.value !== '-');
});

watch(
  () => props.visible,
  (isVisible) => {
    if (isVisible) {
      loadPlayerStats(true);
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
  }
}

function transformStatEntry(entry, markets) {
  if (!entry) return null;
  const game = entry.game ?? {};
  const isAway = entry.is_away === 1 || entry.is_away === true;

  const opponentTeam = isAway ? game.home_team ?? {} : game.away_team ?? {};
  const opponentCode = formatCode(opponentTeam.short_name ?? opponentTeam.code ?? opponentTeam.name);
  const opponentLabel = opponentCode ? `${isAway ? '@' : 'vs'} ${opponentCode}` : '-';

  const timestamp = readTimestamp(game.start_at ?? entry.updated_at ?? entry.created_at);
  const date = formatShortDate(game.start_at ?? entry.updated_at ?? entry.created_at);
  const minutes = formatMinutes(entry.mins ?? entry.minutes);

  const points = parseNumeric(entry.points);
  const rebounds = parseNumeric(entry.rebounds);
  const assists = parseNumeric(entry.assists);
  const threesMade = parseNumeric(entry.three_pointers_made);
  const pra = safeSum(points, rebounds, assists);

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

  return {
    id: entry.id ?? entry.game_id ?? `${opponentLabel}-${timestamp ?? Math.random()}`,
    opponent: opponentLabel,
    date,
    minutes,
    metrics,
    fieldGoals,
    threePointers,
    freeThrows,
    timestamp,
  };
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

function resolveMetricClass(statKey, metric) {
  if (!metric || metric.value === null || metric.value === undefined) return 'metric--neutral';
  if (metric.market === null || metric.market === undefined) return 'metric--neutral';
  if (metric.value > metric.market) return 'metric--positive';
  if (metric.value < metric.market) return 'metric--negative';
  return 'metric--neutral';
}

function formatNumericDisplay(value) {
  if (value === null || value === undefined) return '-';
  if (!Number.isFinite(value)) return String(value);
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
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
  background: rgba(15, 23, 42, 0.82);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 75;
}

.modal-content {
  background: #0a0e1a;
  color: #e2e8f0;
  padding: 24px;
  border-radius: 12px;
  max-height: 85vh;
  overflow-y: auto;
  width: 860px;
  box-shadow: 0 24px 60px rgba(2, 6, 23, 0.7);
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
  gap: 6px;
}

.modal-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #38bdf8;
}

.modal-subtitle {
  margin: 0;
  font-size: 13px;
  color: #94a3b8;
  letter-spacing: 0.04em;
}

.close-button {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 26px;
  cursor: pointer;
  line-height: 1;
  transition: color 0.2s ease;
}

.close-button:hover {
  color: #f8fafc;
}

.modal-summary-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.modal-summary-card {
  flex: 1 1 280px;
  min-width: 260px;
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid rgba(56, 189, 248, 0.12);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.modal-summary-heading {
  margin: 0;
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #f8fafc;
  text-align: center;
}

.summary-table-wrapper {
  overflow-x: auto;
}

.summary-table {
  width: 100%;
  border-collapse: collapse;
  background: rgba(10, 19, 40, 0.6);
  border-radius: 10px;
  table-layout: fixed;
}

.summary-table th,
.summary-table td {
  padding: 8px;
  text-align: center;
  font-size: 13px;
  color: #cbd5f5;
  border: 1px solid rgba(56, 189, 248, 0.08);
}

.market-value {
  font-weight: 600;
  color: #facc15;
}

.modal-placeholder {
  margin: 0;
  font-size: 13px;
  color: #94a3b8;
  text-align: center;
}

.modal-section-title {
  margin: 24px 0 12px;
  font-size: 14px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #f8fafc;
}

.games-table-wrapper {
  overflow-x: auto;
}

.games-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 720px;
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

.games-table td:first-child,
.games-table td:nth-child(2) {
  font-weight: 600;
  color: #f8fafc;
}

.metric-cell {
  font-weight: 600;
}

.metric--positive {
  color: #16a34a;
}

.metric--negative {
  color: #ef4444;
}

.metric--neutral {
  color: #e2e8f0;
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

@media (max-width: 768px) {
  .modal-content {
    width: 95vw;
    padding: 20px;
  }

  .modal-summary-row {
    flex-direction: column;
  }
}
</style>

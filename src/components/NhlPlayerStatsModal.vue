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
            <div v-if="defenseStats.length" class="modal-summary-table-wrapper">
              <table class="modal-summary-table rank-table">
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
            <p v-else class="modal-placeholder">No defensive data available.</p>
          </section>

          <section class="modal-summary-card">
            <header class="modal-summary-title">MARKETS</header>
            <div v-if="marketColumns.length" class="modal-summary-table-wrapper">
              <table class="modal-summary-table">
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
                      {{ marketRow[column.key] ?? '-' }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="modal-placeholder">No market data available.</p>
          </section>
        </div>

        <h4 class="modal-section-title">{{ sectionTitle }}</h4>

        <div class="modal-stats-table-wrapper">
          <div v-if="loading" class="modal-state">Loading statistics...</div>
          <div v-else-if="error" class="modal-state error">{{ error }}</div>
          <template v-else>
            <table v-if="performanceRows.length" class="modal-stats-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Opponent</th>
                  <th v-for="stat in statTypes" :key="`perf-head-${stat}`">
                    {{ statLabels[stat] }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in performanceRows" :key="row.id ?? row.gameId">
                  <td>{{ row.date }}</td>
                  <td>{{ row.opponent }}</td>
                  <td
                    v-for="stat in statTypes"
                    :key="`perf-cell-${row.id ?? row.gameId}-${stat}`"
                    :class="['value-cell', resolveMetricClass(stat, row.metrics[stat])]"
                  >
                    {{ row.metrics[stat]?.display ?? '-' }}
                  </td>
                </tr>
              </tbody>
            </table>
            <p v-else class="modal-placeholder">No game data available.</p>
          </template>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import axios from 'axios';

const GOALKEEPER_KEYS = ['saves'];
const OFFENSIVE_KEYS = ['points', 'goals', 'shots'];

const STAT_METADATA = {
  goals: { label: 'Goals', title: 'Goals' },
  points: { label: 'Points', title: 'Points' },
  shots: { label: 'Shots', title: 'Shots on goal' },
  saves: { label: 'Saves', title: 'Saves' },
};

const props = defineProps({
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
  opponentDefense: {
    type: Array,
    default: () => [],
  },
  playerName: {
    type: String,
    default: '',
  },
  playerPosition: {
    type: String,
    default: '',
  },
  playerType: {
    type: String,
    default: 'offensive',
    validator: (value) => ['goalkeeper', 'offensive'].includes(value),
  },
  visible: {
    type: Boolean,
    default: false,
  },
  market: {
    type: Object,
    default: () => ({}),
  },
  initialStats: {
    type: Array,
    default: () => [],
  },
  autoFetch: {
    type: Boolean,
    default: true,
  },
});

const emit = defineEmits(['close']);

const playerStats = ref([]);
const loading = ref(false);
const error = ref('');

const DEFAULT_STATS_BASE = import.meta.env?.VITE_NHL_PLAYER_STATS_URL ?? 'http://localhost/nhl/players';

const normalizedTeamId = computed(() => normalizeId(props.teamId));
const isGoalkeeper = computed(() => props.playerType === 'goalkeeper');
const statTypes = computed(() => (isGoalkeeper.value ? GOALKEEPER_KEYS : OFFENSIVE_KEYS));

const statLabels = computed(() =>
  statTypes.value.reduce((acc, key) => {
    acc[key] = STAT_METADATA[key]?.label ?? formatStatLabel(key);
    return acc;
  }, {})
);

const playerSubtitle = computed(() => {
  if (!props.playerPosition) return '';
  return `Position: ${props.playerPosition}`;
});

const defenseTitle = computed(() => {
  const code = (props.opponentCode ?? '').toString().trim();
  return code ? `${code} Defensive Ranks` : 'Opponent Defensive Ranks';
});

const defenseStats = computed(() =>
  toArray(props.opponentDefense)
    .map((entry) => ({
      label: String(entry?.label ?? entry?.Label ?? '').toUpperCase() || 'STAT',
      value: formatNumber(entry?.value),
      rank: entry?.rank ?? entry?.Rank ?? null,
    }))
    .filter((entry) => entry.value !== null && entry.value !== undefined)
);

const sectionTitle = computed(() => (isGoalkeeper.value ? 'GOALKEEPERS' : 'OFFENSIVE PLAYERS'));

const marketColumns = computed(() =>
  statTypes.value.map((key) => ({
    key,
    label: STAT_METADATA[key]?.label ?? formatStatLabel(key),
  }))
);

const currentMarkets = computed(() => {
  const snapshot = {};
  statTypes.value.forEach((stat) => {
    const marketEntry = props.market?.[stat];
    const valueToUse = typeof marketEntry === 'object' ? marketEntry?.value : marketEntry;
    const numeric = Number(valueToUse);
    if (!Number.isNaN(numeric)) {
      snapshot[stat] = numeric;
    }
  });
  return snapshot;
});

const marketRow = computed(() => {
  const row = {};
  statTypes.value.forEach((key) => {
    const marketEntry = props.market?.[key];
    const valueToUse = typeof marketEntry === 'object' ? marketEntry?.value : marketEntry;
    row[key] = formatValue(valueToUse);
  });
  return row;
});

const performanceRows = computed(() => {
  if (!Array.isArray(playerStats.value)) return [];
  return [...playerStats.value]
    .map((entry) => {
      const timestamp = resolveTimestamp(entry);
      const dateLabel = formatGameDate(entry);
      const opponentLabel = resolveOpponentLabel(entry);
      const metrics = {};
      statTypes.value.forEach((stat) => {
        metrics[stat] = buildMetricEntry(entry?.[stat]);
      });
      return {
        id: entry.id ?? `${entry.game_id ?? 'game'}-${entry.player_id ?? 'player'}`,
        gameId: entry.game_id ?? null,
        date: dateLabel,
        opponent: opponentLabel,
        metrics,
        timestamp,
      };
    })
    .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
});

const PLAYER_STATS_URL = (playerId) => {
  const base = (DEFAULT_STATS_BASE || '').replace(/\/$/, '');
  return `${base}/${encodeURIComponent(playerId)}/stats`;
};

async function fetchPlayerStats() {
  if (!props.playerId) return;

  loading.value = true;
  error.value = '';
  try {
    const { data } = await axios.get(PLAYER_STATS_URL(props.playerId));
    const parsedStats = Array.isArray(data?.stats) ? data.stats : toArray(data);
    playerStats.value = parsedStats;
  } catch (err) {
    error.value = 'Unable to load player statistics';
    playerStats.value = [];
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.initialStats,
  (stats) => {
    if (Array.isArray(stats) && stats.length) {
      playerStats.value = stats;
      loading.value = false;
      error.value = '';
    } else if (!props.autoFetch) {
      playerStats.value = [];
    }
  },
  { immediate: true, deep: true }
);

watch(
  () => props.visible,
  (isVisible) => {
    if (props.autoFetch && isVisible && !playerStats.value.length) {
      fetchPlayerStats();
    }
  }
);

const close = () => emit('close');

function formatStatLabel(label) {
  return label.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '-';
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return String(value);
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
}

function buildMetricEntry(rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === '') {
    return { display: '-', raw: null };
  }
  const numeric = Number(rawValue);
  if (Number.isNaN(numeric)) {
    return { display: String(rawValue), raw: null };
  }
  return {
    display: Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1),
    raw: numeric,
  };
}

function resolveMetricClass(statKey, metricEntry) {
  if (!metricEntry || metricEntry.raw === null || metricEntry.raw === undefined) return 'stat-neutral-text';
  const line = currentMarkets.value?.[statKey];
  if (line === null || line === undefined) return 'stat-neutral-text';
  if (metricEntry.raw > line) return 'stat-hit-text';
  if (metricEntry.raw < line) return 'stat-miss-text';
  return 'stat-push-text';
}

function colorByLine() {
  return 'stat-neutral-text';
}

function formatGameDate(statRow) {
  const game = statRow?.game ?? {};
  const candidates = [game.start_at, statRow.start_at, statRow.created_at, statRow.updated_at];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const date = new Date(candidate);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
      });
    }
  }
  return '-';
}

function resolveTimestamp(statRow) {
  const game = statRow?.game ?? {};
  const candidates = [game.start_at, statRow.start_at, statRow.created_at, statRow.updated_at];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const date = new Date(candidate);
    if (!Number.isNaN(date.getTime())) {
      return date.getTime();
    }
  }
  return null;
}

function resolveOpponentLabel(statRow) {
  const game = statRow?.game ?? {};
  const teamIdCandidates = [
    normalizedTeamId.value,
    normalizeId(statRow.team_id ?? statRow.teamId),
    normalizeId(statRow.team?.id),
  ].filter(Boolean);
  const playerTeamId = teamIdCandidates.length ? teamIdCandidates[0] : null;

  const homeTeam = readTeamInfo(game.home_team, game.home_team_id);
  const awayTeam = readTeamInfo(game.away_team, game.away_team_id);

  let opponent = null;
  let opponentWasHome = false;

  if (playerTeamId && homeTeam.id && playerTeamId === homeTeam.id) {
    opponent = awayTeam;
    opponentWasHome = false;
  } else if (playerTeamId && awayTeam.id && playerTeamId === awayTeam.id) {
    opponent = homeTeam;
    opponentWasHome = true;
  } else if (homeTeam.id && awayTeam.id) {
    opponent = playerTeamId === homeTeam.id ? awayTeam : homeTeam;
    opponentWasHome = opponent.id === homeTeam.id;
  } else {
    opponent = homeTeam.id ? homeTeam : awayTeam;
    opponentWasHome = opponent.id === homeTeam.id;
  }

  const opponentCode = opponent?.code ?? '-';
  if (!opponentCode || opponentCode === '-') return '-';
  return `${opponentWasHome ? '@' : ''}${opponentCode}`;
}

function readTeamInfo(team = {}, fallbackId = null) {
  const id = normalizeId(team?.id ?? fallbackId);
  const code =
    team?.code ??
    team?.abbreviation ??
    team?.short_name ??
    team?.nickname ??
    team?.name ??
    null;
  return { id, code };
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

function formatNumber(value) {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return null;
  return Number.isInteger(numeric) ? numeric : Number(numeric.toFixed(1));
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
  background: #0f172a;
  color: #e2e8f0;
  padding: 24px;
  border-radius: 12px;
  max-height: 85vh;
  overflow-y: auto;
  min-width: 960px;
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
  margin: 4px 0 0;
  font-size: 12px;
  color: #94a3b8;
}

.modal-close-button {
  margin-left: auto;
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
  flex: 1 1 280px;
  min-width: 240px;
  background: rgba(30, 41, 59, 0.9);
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.modal-summary-title {
  margin: 0;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #38bdf8;
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
  font-size: 13px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #38bdf8;
}

.modal-stats-table-wrapper {
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
  padding-top: 16px;
}

.modal-stats-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.modal-stats-table thead {
  background: rgba(30, 41, 59, 0.8);
}

.modal-stats-table th,
.modal-stats-table td {
  border: 1px solid rgba(71, 85, 105, 0.4);
  padding: 6px;
  text-align: center;
}

.modal-stats-table th {
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #cbd5f5;
}

.modal-stats-table td:first-child,
.modal-stats-table th:first-child {
  text-align: left;
}

.modal-stats-table td:nth-child(2),
.modal-stats-table th:nth-child(2) {
  text-align: left;
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

.modal-state {
  padding: 16px;
  text-align: center;
  color: #94a3b8;
  font-size: 13px;
}

.modal-state.error {
  color: #ef4444;
}
</style>

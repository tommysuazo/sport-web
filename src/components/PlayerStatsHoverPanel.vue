<template>
  <div class="hover-panel" v-if="player">
    <div class="panel-header">
      <div>
        <h4>{{ player.full_name || `${player.first_name} ${player.last_name}` }}</h4>
        <p class="panel-subtitle">{{ player.position || 'N/A' }} · {{ marketKeys.length }} markets</p>
      </div>
      <span
        v-if="statType"
        class="highlighted-stat"
        :title="getStatTitle(statType)"
      >
        {{ getStatLabel(statType) }}
      </span>
    </div>

    <div v-if="marketKeys.length" class="market-adjustments">
      <div
        v-for="key in marketKeys"
        :key="key"
        class="market-adjustment"
        :class="{ active: key === statType }"
      >
        <div class="market-title" :title="getStatTitle(key)">{{ getStatLabel(key) }}</div>
        <div class="market-options">
          <button
            v-for="option in generateLineOptions(marketsState[key])"
            :key="`${key}-${option}`"
            type="button"
            class="market-option"
            :class="{ selected: selectedLines[key] === option }"
            @click.stop="selectLine(key, option)"
          >
            {{ option }}
          </button>
        </div>
      </div>
    </div>

    <div class="stats-content">
      <div v-if="loading" class="loading-state">Cargando últimos juegos...</div>
      <div v-else-if="error" class="error-state">{{ error }}</div>
      <table v-else class="stats-table">
        <thead>
          <tr>
            <th>Game</th>
            <th
              v-for="key in statTypes"
              :key="`head-${key}`"
              :class="{ active: key === statType }"
              :title="getStatTitle(key)"
            >
              {{ getStatLabel(key) }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!playerStats.length">
            <td :colspan="statTypes.length + 1" class="empty-state">Sin estadísticas recientes</td>
          </tr>
          <tr v-for="stat in playerStats" :key="stat.id">
            <td class="game-cell">#{{ stat.game_id }}</td>
            <td
              v-for="key in statTypes"
              :key="`${stat.id}-${key}`"
              :class="['stat-value', key === statType ? 'active' : '', colorByLine(stat[key], selectedLines[key]) ]"
              :title="getStatTitle(key)"
            >
              {{ formatValue(stat[key]) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import axios from 'axios';

const STAT_TYPES = [
  'passing_yards',
  'pass_completions',
  'pass_attempts',
  'receiving_yards',
  'receptions',
  'receiving_targets',
  'rushing_yards',
  'carries',
  'sacks',
  'tackles',
];

const STAT_METADATA = {
  passing_yards: { label: 'Pass Yds', title: 'Passing Yards' },
  pass_completions: { label: 'Pass Comp', title: 'Pass Completions' },
  pass_attempts: { label: 'Pass Att', title: 'Pass Attempts' },
  receiving_yards: { label: 'Rec Yds', title: 'Receiving Yards' },
  receptions: { label: 'Receptions', title: 'Receptions' },
  receiving_targets: { label: 'Targets', title: 'Receiving Targets' },
  rushing_yards: { label: 'Rush Yds', title: 'Rushing Yards' },
  carries: { label: 'Carries', title: 'Carries' },
  sacks: { label: 'Sacks', title: 'Sacks' },
  tackles: { label: 'Tackles', title: 'Tackles' },
};

const props = defineProps({
  player: {
    type: Object,
    required: true,
  },
  statType: {
    type: String,
    default: null,
  },
  market: {
    type: Object,
    default: () => ({}),
  },
});

const playerStats = ref([]);
const loading = ref(false);
const error = ref('');
const selectedLines = ref({});
const marketsState = ref({});
const cache = new Map();

const statTypes = computed(() => STAT_TYPES);

const marketKeys = computed(() => Object.keys(marketsState.value));

function formatStatLabel(key) {
  return key.replace(/_/g, ' ');
}

function getStatLabel(key) {
  return STAT_METADATA[key]?.label ?? formatStatLabel(key);
}

function getStatTitle(key) {
  return STAT_METADATA[key]?.title ?? formatStatLabel(key);
}

function generateLineOptions(baseLine) {
  const numeric = Number(baseLine);
  if (Number.isNaN(numeric)) return [];

  const options = [];
  options.push(Number(numeric.toFixed(1)));

  for (let i = 1; i <= 5; i += 1) {
    const down = Number(Math.max(0.5, numeric - i).toFixed(1));
    if (!options.includes(down)) options.push(down);
    const up = Number((numeric + i).toFixed(1));
    if (!options.includes(up)) options.push(up);
  }

  return options.sort((a, b) => a - b);
}

function selectLine(key, option) {
  selectedLines.value = {
    ...selectedLines.value,
    [key]: option,
  };
}

function formatValue(value) {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'number') return value;
  const numeric = Number(value);
  return Number.isNaN(numeric) ? value : numeric;
}

function colorByLine(value, line) {
  const numericLine = Number(line);
  const numericValue = Number(value);

  if (Number.isNaN(numericLine) || Number.isNaN(numericValue)) {
    return 'neutral';
  }

  if (numericValue > numericLine) return 'stat-over';
  if (numericValue < numericLine) return 'stat-under';
  return 'stat-equal';
}

async function fetchPlayerStats(playerId) {
  if (!playerId) return;
  const cached = cache.get(playerId);
  if (cached) {
    playerStats.value = cached;
    return;
  }

  loading.value = true;
  error.value = '';
  try {
    const { data } = await axios.get(`http://localhost/api/nfl/players/${playerId}/stats`);
    playerStats.value = Array.isArray(data.stats) ? data.stats : [];
    cache.set(playerId, playerStats.value);
  } catch (err) {
    error.value = 'No fue posible cargar estadísticas recientes';
    playerStats.value = [];
  } finally {
    loading.value = false;
  }
}

function bootstrapMarkets() {
  const localMarkets = {};
  statTypes.value.forEach((type) => {
    const marketEntry = props.market?.[type];
    const valueToUse = typeof marketEntry === 'object' ? marketEntry?.value : marketEntry;
    if (valueToUse !== undefined && valueToUse !== null) {
      const numericValue = Number(valueToUse);
      if (!Number.isNaN(numericValue)) {
        localMarkets[type] = Number(numericValue.toFixed(1));
      }
    }
  });
  marketsState.value = localMarkets;
  selectedLines.value = Object.fromEntries(Object.entries(localMarkets).map(([key, value]) => [key, value]));
}

watch(
  () => props.player,
  (player) => {
    if (player && Array.isArray(player.stats) && player.stats.length) {
      playerStats.value = player.stats;
      cache.set(player.id, player.stats);
      loading.value = false;
      error.value = '';
    } else if (player?.id) {
      fetchPlayerStats(player.id);
    } else {
      playerStats.value = [];
      loading.value = false;
      error.value = '';
    }
  },
  { immediate: true, deep: true }
);

watch(
  () => props.market,
  () => {
    bootstrapMarkets();
  },
  { immediate: true, deep: true }
);

watch(
  () => props.statType,
  (type) => {
    if (type && marketsState.value[type] !== undefined) {
      selectedLines.value = {
        ...selectedLines.value,
        [type]: marketsState.value[type],
      };
    }
  }
);
</script>

<style scoped>
.hover-panel {
  background: rgba(15, 23, 42, 0.95);
  color: #e2e8f0;
  padding: 16px;
  border-radius: 8px;
  width: 480px;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.7);
  backdrop-filter: blur(8px);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.panel-header h4 {
  margin: 0;
  font-size: 16px;
}

.panel-subtitle {
  margin: 0;
  font-size: 12px;
  color: #94a3b8;
}

.highlighted-stat {
  background: #1d4ed8;
  color: #fff;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 12px;
  text-transform: uppercase;
}

.market-adjustments {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
}

.market-adjustment {
  background: rgba(30, 41, 59, 0.9);
  border-radius: 6px;
  padding: 8px;
}

.market-adjustment.active {
  border: 1px solid #38bdf8;
}

.market-title {
  font-size: 12px;
  text-transform: uppercase;
  color: #f8fafc;
  margin-bottom: 4px;
}

.market-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.market-option {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid transparent;
  color: #cbd5f5;
  padding: 4px 6px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.market-option.selected {
  border-color: #22d3ee;
  color: #22d3ee;
}

.stats-content {
  max-height: 260px;
  overflow-y: auto;
}

.loading-state,
.error-state,
.empty-state {
  text-align: center;
  padding: 12px;
  font-size: 12px;
  color: #94a3b8;
}

.stats-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.stats-table thead {
  background: rgba(30, 41, 59, 0.8);
}

th,
td {
  border: 1px solid rgba(71, 85, 105, 0.6);
  padding: 4px;
  text-align: center;
}

th.active,
td.active {
  background: rgba(59, 130, 246, 0.15);
}

.stat-value.stat-over {
  color: #22c55e;
}

.stat-value.stat-under {
  color: #ef4444;
}

.stat-value.stat-equal {
  color: #facc15;
}

.stat-value.neutral {
  color: #cbd5f5;
}

.stat-value {
  color: #cbd5f5;
}

.game-cell {
  font-weight: 600;
  color: #cbd5f5;
}
</style>

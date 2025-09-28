<template>
  <div class="modal-backdrop" @click.self="close">
    <div class="modal-content">
      <header class="modal-header">
        <div>
          <h2>{{ playerName }}</h2>
          <p class="modal-subtitle">Últimos registros NFL</p>
        </div>
        <button type="button" class="close-button" @click="close">×</button>
      </header>

      <section class="modal-section">
        <h3>Mercados actuales</h3>
        <div class="market-grid">
          <div v-for="stat in statTypes" :key="`market-${stat}`" class="market-item">
            <span class="market-label" :title="getStatTitle(stat)">{{ getStatLabel(stat) }}</span>
            <span class="market-value">{{ currentMarkets[stat] ?? '-' }}</span>
          </div>
        </div>
      </section>

      <section class="modal-section stats-section">
        <h3>Estadísticas recientes</h3>
        <div v-if="loading" class="modal-state">Cargando estadísticas...</div>
        <div v-else-if="error" class="modal-state error">{{ error }}</div>
        <table v-else class="stats-table">
          <thead>
            <tr>
              <th>Juego</th>
              <th>Sede</th>
              <th
                v-for="stat in statTypes"
                :key="`head-${stat}`"
                :title="getStatTitle(stat)"
              >
                {{ getStatLabel(stat) }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!playerStats.length">
              <td :colspan="statTypes.length + 2" class="modal-state">Sin datos disponibles</td>
            </tr>
            <tr v-for="statRow in playerStats" :key="statRow.id">
              <td class="game-cell">#{{ statRow.game_id }}</td>
              <td class="game-cell">{{ statRow.is_away ? 'Away' : 'Home' }}</td>
              <td
                v-for="stat in statTypes"
                :key="`${statRow.id}-${stat}`"
                :class="['value-cell', colorByLine(statRow[stat], currentMarkets[stat]) ]"
                :title="getStatTitle(stat)"
              >
                {{ formatValue(statRow[stat]) }}
              </td>
            </tr>
          </tbody>
        </table>
      </section>
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
  playerId: {
    type: Number,
    required: true,
  },
  teamId: {
    type: Number,
    default: null,
  },
  playerName: {
    type: String,
    default: '',
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
});

const emit = defineEmits(['close']);

const playerStats = ref([]);
const loading = ref(false);
const error = ref('');

const statTypes = computed(() => STAT_TYPES);

function formatStatLabel(label) {
  return label.replace(/_/g, ' ');
}

function getStatLabel(stat) {
  return STAT_METADATA[stat]?.label ?? formatStatLabel(stat);
}

function getStatTitle(stat) {
  return STAT_METADATA[stat]?.title ?? formatStatLabel(stat);
}

const currentMarkets = computed(() => {
  const snapshot = {};
  statTypes.value.forEach((stat) => {
    const marketEntry = props.market?.[stat];
    const valueToUse = typeof marketEntry === 'object' ? marketEntry?.value : marketEntry;
    const numeric = Number(valueToUse);
    if (!Number.isNaN(numeric)) {
      snapshot[stat] = Number(numeric.toFixed(1));
    }
  });
  return snapshot;
});

function formatValue(value) {
  if (value === null || value === undefined) return '-';
  const numeric = Number(value);
  return Number.isNaN(numeric) ? value : numeric;
}

function colorByLine(value, line) {
  const numericLine = Number(line);
  const numericValue = Number(value);

  if (Number.isNaN(numericLine) || Number.isNaN(numericValue)) return 'neutral';
  if (numericValue > numericLine) return 'stat-over';
  if (numericValue < numericLine) return 'stat-under';
  return 'stat-equal';
}

async function fetchPlayerStats() {
  if (!props.playerId) return;

  loading.value = true;
  error.value = '';
  try {
    const { data } = await axios.get(`http://localhost/api/nfl/players/${props.playerId}/stats`);
    const parsedStats = Array.isArray(data.stats) ? data.stats : [];
    playerStats.value = parsedStats;
  } catch (err) {
    error.value = 'No se pudieron cargar las estadísticas del jugador';
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
    }
  },
  { immediate: true, deep: true }
);

watch(
  () => props.visible,
  (isVisible) => {
    if (isVisible && !playerStats.value.length) {
      fetchPlayerStats();
    }
  }
);

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
  min-width: 960px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.8);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.modal-header h2 {
  margin: 0;
}

.modal-subtitle {
  margin: 4px 0 0;
  font-size: 12px;
  color: #94a3b8;
}

.close-button {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 24px;
  cursor: pointer;
}

.modal-section {
  margin-bottom: 24px;
}

.modal-section h3 {
  margin: 0 0 8px;
  font-size: 14px;
  text-transform: uppercase;
  color: #38bdf8;
}

.market-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}

.market-item {
  background: rgba(30, 41, 59, 0.9);
  padding: 10px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.market-label {
  font-size: 12px;
  color: #cbd5f5;
  text-transform: uppercase;
}

.market-value {
  font-size: 16px;
  font-weight: 600;
  color: #f8fafc;
}

.stats-section {
  border-top: 1px solid rgba(148, 163, 184, 0.1);
  padding-top: 16px;
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
  border: 1px solid rgba(71, 85, 105, 0.4);
  padding: 6px;
  text-align: center;
}

.value-cell.stat-over {
  color: #22c55e;
}

.value-cell.stat-under {
  color: #ef4444;
}

.value-cell.stat-equal {
  color: #facc15;
}

.value-cell.neutral {
  color: #cbd5f5;
}

.modal-state {
  padding: 16px;
  text-align: center;
  color: #94a3b8;
}

.modal-state.error {
  color: #ef4444;
}

.game-cell {
  font-weight: 600;
}
</style>

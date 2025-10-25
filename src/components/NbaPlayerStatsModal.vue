<template>
  <div class="modal-backdrop" @click.self="close">
    <div class="modal-content">
      <!-- HEADER -->
      <header class="modal-header">
        <h2 class="modal-title">{{ playerName }}</h2>
        <button type="button" class="close-button" @click="close">×</button>
      </header>
      <p v-if="playerSubtitle" class="modal-subtitle">{{ playerSubtitle }}</p>

      <!-- TOP ROW (como la imagen: izquierda DEFENSA, derecha MARKETS) -->
      <section class="top-row">
        <!-- IZQ: DEFENSA RIVAL -->
        <div class="card">
          <h3 class="card-title">Defensa Rival</h3>

          <template v-if="opponentDefenseRows.length">
            <!-- GRID de métricas como en el mock -->
            <div class="defense-grid">
              <div
                v-for="row in opponentDefenseRows"
                :key="row.key"
                class="defense-col"
              >
                <div class="def-label">{{ row.label }}</div>

                <div class="def-line">
                  <span class="def-value">{{ row.value }}</span>
                  <span class="def-rank">{{ row.rank }}</span>
                </div>
              </div>
            </div>
          </template>

          <p v-else class="modal-state">Sin datos defensivos.</p>
        </div>


        <!-- DER: MERCADO ACTUAL -->
        <!-- <div class="card">
          <h3 class="card-title">Mercado Actual</h3>
          <div v-if="marketEntries.length" class="market-grid">
            <article
              v-for="entry in marketEntries"
              :key="entry.key"
              class="market-item"
            >
              <span class="market-label">{{ entry.label }}</span>
              <span class="market-value">{{ entry.value }}</span>
            </article>
          </div>
          <p v-else class="modal-state">Sin mercados activos.</p>
        </div> -->
        <div class="markets-card">
          <h3 class="markets-title">MARKETS</h3>

          <div class="markets-table-wrap">
            <table class="markets-table">
              <thead>
                <tr>
                  <th v-for="entry in marketEntries" :key="`head-${entry.key}`">
                    {{ entry.label }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td
                    v-for="entry in marketEntries"
                    :key="`val-${entry.key}`"
                    class="market-value-cell"
                  >
                    {{ entry.value }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- ÚLTIMOS JUEGOS (abajo como en el mockup) -->
      <section class="table-section stats-section">
        <h3 class="card-title">Últimos Juegos</h3>
        <div class="stats-table-wrapper">
          <div v-if="loading" class="modal-state">Cargando estadísticas...</div>
          <div v-else-if="error" class="modal-state error">{{ error }}</div>

          <template v-else>
            <table v-if="performanceRows.length" class="stats-table">
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
                  <td class="game-cell">{{ row.date }}</td>
                  <td class="game-cell">{{ row.opponent }}</td>
                  <td>{{ row.minutes }}</td>
                  <td
                    v-for="stat in STAT_TYPES"
                    :key="`metric-${row.id}-${stat}`"
                    :class="['value-cell', resolveMetricClass(stat, row.metrics[stat])]"
                  >
                    {{ row.metrics[stat]?.display ?? '-' }}
                  </td>
                  <td class="value-cell neutral">{{ row.fieldGoals }}</td>
                  <td class="value-cell neutral">{{ row.threePointers }}</td>
                  <td class="value-cell neutral">{{ row.freeThrows }}</td>
                </tr>
              </tbody>
            </table>
            <p v-else class="modal-state">Sin registros de juegos.</p>
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
  opponentDefense: {
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

const marketEntries = computed(() =>
  STAT_TYPES.map((key) => {
    const rawValue = props.market?.[key];
    const valueToUse =
      typeof rawValue === 'object' && rawValue !== null ? rawValue.value ?? rawValue.line : rawValue;
    return {
      key,
      label: STAT_LABELS[key] ?? key.toUpperCase(),
      value: formatNumericDisplay(parseNumeric(valueToUse)),
    };
  }).filter((entry) => entry.value !== '-')
);

const opponentDefenseRows = computed(() =>
  toArray(props.opponentDefense).map((entry, index) => ({
    key: entry.label ?? `def-${index}`,
    label: (entry.label ?? 'STAT').toUpperCase(),
    value: formatNumericDisplay(parseNumeric(entry.value)),
    rank: entry.rank !== null && entry.rank !== undefined ? `#${entry.rank}` : '-',
  }))
);

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

function resolveMetricClass(_statKey, metric) {
  if (!metric || metric.value === null || metric.value === undefined) return 'neutral';
  if (metric.market === null || metric.market === undefined) return 'neutral';
  if (metric.value > metric.market) return 'stat-over';
  if (metric.value < metric.market) return 'stat-under';
  return 'stat-equal';
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
/* ====== base existentes ====== */
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
  max-width: 1100px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.8);
}
.modal-header {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: 8px;
}
.modal-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  text-align: center;
}
.modal-subtitle {
  margin: 0 0 16px;
  font-size: 12px;
  color: #94a3b8;
  text-align: center;
}
.close-button {
  position: absolute;
  right: 0;
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 24px;
  cursor: pointer;
  line-height: 1;
}

/* ====== NUEVA ESTRUCTURA (mockup) ====== */
.top-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 20px;
}
.card {
  background: rgba(17, 24, 39, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 12px;
  padding: 16px;
}
.card-title {
  margin: 0 0 12px;
  font-size: 14px;
  color: #38bdf8;
  text-transform: uppercase;
}

/* bloque grande del ranking (como PASSING 200.2 #6) */
.rank-box {
  background: rgba(30, 41, 59, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 10px;
  padding: 18px 16px;
}
.rank-metric {
  text-transform: uppercase;
  font-size: 12px;
  color: #cbd5f5;
  letter-spacing: 0.08em;
  margin-bottom: 6px;
}
.rank-line {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.rank-value {
  font-size: 20px;
  font-weight: 800;
  color: #f8fafc;
}
.rank-hash {
  font-size: 12px;
  color: #cbd5f5;
}

/* markets a la derecha */
.market-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.market-item {
  background: rgba(30, 41, 59, 0.9);
  padding: 12px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.12);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.market-label {
  font-size: 11px;
  color: #cbd5f5;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.market-value {
  font-size: 18px;
  font-weight: 700;
  color: #f8fafc;
}

/* tabla de abajo */
.table-section {
  border-top: 1px solid rgba(148, 163, 184, 0.1);
  padding-top: 16px;
}
.stats-table-wrapper { overflow-x: auto; }
.stats-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  min-width: 720px;
}
.stats-table thead {
  background: rgba(30, 41, 59, 0.8);
}
th, td {
  border: 1px solid rgba(71, 85, 105, 0.4);
  padding: 6px;
  text-align: center;
}
.value-cell { font-weight: 600; }
.value-cell.stat-over { color: #22c55e; }
.value-cell.stat-under { color: #ef4444; }
.value-cell.stat-equal { color: #facc15; }
.value-cell.neutral { color: #cbd5f5; }
.modal-state {
  padding: 16px;
  text-align: center;
  color: #94a3b8;
  background: rgba(15, 23, 42, 0.45);
  border-radius: 8px;
}
.modal-state.error { color: #ef4444; }
.game-cell { font-weight: 600; }

.mt-12 { margin-top: 12px; }

@media (max-width: 1024px) {
  .modal-content { min-width: auto; width: 95vw; }
  .top-row { grid-template-columns: 1fr; }
}

/* --- Card y título --- */
.markets-card {
  background: rgba(17, 24, 39, 0.9);            /* fondo del card */
  border: 1px solid rgba(148, 163, 184, 0.12);  /* borde tenue */
  border-radius: 12px;
  padding: 12px 12px 6px;
}

.markets-title {
  margin: 0 0 8px;
  font-size: 12px;
  letter-spacing: 0.12em;
  color: #38bdf8;             /* cian del mock */
  text-transform: uppercase;
  text-align: center;
}

/* --- Tabla --- */
.markets-table-wrap {
  overflow-x: auto;
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.6); /* panel interno oscuro */
  border: 1px solid rgba(148, 163, 184, 0.1);
}

.markets-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.markets-table thead th {
  background: rgba(30, 41, 59, 0.9);   /* banda superior como el mock */
  color: #cbd5f5;
  font-size: 12px;
  text-transform: uppercase;
  padding: 10px 8px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
  text-align: center;
}

.markets-table tbody td {
  padding: 12px 8px;
  text-align: center;
  border-top: 1px solid rgba(148, 163, 184, 0.06);
}

/* valor en amarillo, más grueso */
.market-value-cell {
  color: #facc15;
  font-weight: 700;
  font-size: 14px;
}

/* bordes suaves alrededor de todo el módulo (look del mock) */
.markets-card,
.markets-table-wrap {
  box-shadow: inset 0 0 0 1px rgba(2, 6, 23, 0.2);
}

/* Responsivo: columnas estrechas mantienen legibilidad */
@media (max-width: 480px) {
  .markets-table thead th,
  .markets-table tbody td {
    font-size: 11px;
    padding: 10px 6px;
  }
}

/* Contenedor en columnas (3 en desktop, responsive) */
.defense-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0; /* el mock no muestra separación visible entre columnas */
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.10);
  border-radius: 10px;
  overflow: hidden;
}

/* Cada “columna” */
.defense-col {
  padding: 12px 16px;
  border-right: 1px solid rgba(148, 163, 184, 0.08);
}
.defense-col:last-child {
  border-right: 0;
}

/* Encabezado de cada columna (LABEL) */
.def-label {
  background: rgba(30, 41, 59, 0.9);
  color: #cbd5f5;
  text-transform: uppercase;
  font-size: 12px;
  letter-spacing: .08em;
  font-weight: 700;
  padding: 10px 12px;
  margin: -12px -16px 10px;  /* ocupa todo el ancho de la columna */
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
  text-align: center;
}

/* Línea con valor a la izquierda y #rank a la derecha (en la misma fila) */
.def-line {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 12px;
  padding: 2px 0 4px;
}

.def-value {
  color: #f8fafc;
  font-weight: 700;
  font-size: 14px;    /* súbelo a 18–20 si quieres más presencia */
}

.def-rank {
  color: #60a5fa;       /* azul “link” del mock */
  font-size: 12px;
  font-weight: 600;
}

/* Responsive: 2 columnas en tablets, 1 en móviles */
@media (max-width: 900px) {
  .defense-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 520px) {
  .defense-grid { grid-template-columns: 1fr; }
}


</style>

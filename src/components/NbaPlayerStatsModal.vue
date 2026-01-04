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
                  class="game-row"
                  @click="handleGameRowClick(row, $event)"
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
          </template>
        </div>
      </section>

      <div
        v-if="tooltipVisible && activeTooltipRow"
        class="team-comparison-tooltip"
        :style="tooltipStyle"
      >
        <button type="button" class="team-comparison-tooltip__close" @click.stop="resetTooltipState">×</button>
        <p class="team-comparison-tooltip__title">
          {{ activeTooltipRow.teamComparison.teamLabel }} vs {{ activeTooltipRow.teamComparison.opponentLabel }}
        </p>
        <table class="team-comparison-tooltip__table">
          <thead>
            <tr>
              <th>STAT</th>
              <th>{{ activeTooltipRow.teamComparison.teamLabel }}</th>
              <th>{{ activeTooltipRow.teamComparison.opponentLabel }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in activeTooltipRow.teamComparison.rows" :key="`team-cmp-${row.label}`">
              <th>{{ row.label }}</th>
              <td>{{ row.team }}</td>
              <td>{{ row.opponent }}</td>
            </tr>
          </tbody>
        </table>

        <div v-if="activeTooltipRow.injuries" class="team-comparison-tooltip__injuries">
          <div class="injury-column">
            <p class="injury-column-title">{{ activeTooltipRow.injuries.team.label }}</p>
            <ul class="injury-list">
              <li v-if="!activeTooltipRow.injuries.team.players.length" class="injury-item injury-item--empty">
                Sin reportes
              </li>
              <li
                v-for="player in activeTooltipRow.injuries.team.players"
                :key="`inj-team-${player}`"
                class="injury-item"
              >
                {{ player }}
              </li>
            </ul>
          </div>
          <div class="injury-column">
            <p class="injury-column-title">{{ activeTooltipRow.injuries.opponent.label }}</p>
            <ul class="injury-list">
              <li v-if="!activeTooltipRow.injuries.opponent.players.length" class="injury-item injury-item--empty">
                Sin reportes
              </li>
              <li
                v-for="player in activeTooltipRow.injuries.opponent.players"
                :key="`inj-opp-${player}`"
                class="injury-item"
              >
                {{ player }}
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>




<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import axios from 'axios';

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

const DEFAULT_STATS_BASE = import.meta.env?.VITE_NBA_PLAYER_STATS_URL ?? 'http://localhost/nba/players';

const playerStats = ref([]);
const loading = ref(false);
const error = ref('');
const activeTooltipRow = ref(null);
const tooltipVisible = ref(false);
const tooltipPosition = ref({ x: 0, y: 0 });

const TOOLTIP_OFFSET = 16;
const TOOLTIP_WIDTH = 320;
const TOOLTIP_HEIGHT = 300;

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

const tooltipStyle = computed(() => ({
  top: `${tooltipPosition.value.y}px`,
  left: `${tooltipPosition.value.x}px`,
}));

const PLAYER_STATS_URL = (playerId) => {
  const normalizedBase = (DEFAULT_STATS_BASE || '').replace(/\/$/, '');
  return `${normalizedBase}/${encodeURIComponent(playerId)}/stats`;
};

watch(
  () => props.visible,
  (isVisible) => {
    if (isVisible) {
      loadPlayerStats(true);
    } else {
      resetTooltipState();
    }
  },
  { immediate: true }
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
      resetTooltipState();
    }
  }
);

watch(
  () => performanceRows.value,
  () => {
    if (
      activeTooltipRow.value &&
      !performanceRows.value.some((row) => row.id === activeTooltipRow.value.id)
    ) {
      resetTooltipState();
    }
  }
);

onBeforeUnmount(() => {
  resetTooltipState();
});

async function loadPlayerStats(force = false) {
  const playerId = normalizedPlayerId.value;
  if (!playerId) return;
  if (!force && playerStats.value.length) return;
  loading.value = true;
  error.value = '';
  try {
    const { data } = await axios.get(PLAYER_STATS_URL(playerId));
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
  const opponentLabel = opponentCode ? (isAway ? `@${opponentCode}` : opponentCode) : '-';

  const playerTeam = isAway ? game.away_team ?? {} : game.home_team ?? {};
  const playerTeamCode = formatCode(playerTeam.short_name ?? playerTeam.code ?? playerTeam.name);
  const teamTotals = findTeamTotals(game, entry.team_id, true);
  const opponentTotals = findTeamTotals(game, entry.team_id, false);
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

  const teamComparison = buildTeamComparison(
    playerTeamCode || 'TEAM',
    opponentCode || '-',
    teamTotals,
    opponentTotals
  );

  const injuries = buildInjuryReport(
    game,
    entry.team_id,
    playerTeamCode || 'TEAM',
    opponentCode || '-'
  );

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
    teamComparison,
    injuries,
  };
}

function handleGameRowClick(row, event) {
  if (!row?.teamComparison) {
    resetTooltipState();
    return;
  }
  const alreadyOpen = tooltipVisible.value && activeTooltipRow.value?.id === row.id;
  if (alreadyOpen) {
    resetTooltipState();
    return;
  }
  activeTooltipRow.value = row;
  tooltipVisible.value = true;
  updateTooltipPosition(event);
}

function updateTooltipPosition(event) {
  if (!event) return;
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 768;
  let left = (event.clientX ?? 0) + TOOLTIP_OFFSET;
  let top = (event.clientY ?? 0) + TOOLTIP_OFFSET;
  if (left + TOOLTIP_WIDTH > viewportWidth) {
    left = viewportWidth - TOOLTIP_WIDTH - TOOLTIP_OFFSET;
  }
  if (top + TOOLTIP_HEIGHT > viewportHeight) {
    top = viewportHeight - TOOLTIP_HEIGHT - TOOLTIP_OFFSET;
  }
  tooltipPosition.value = {
    x: Math.max(TOOLTIP_OFFSET, left),
    y: Math.max(TOOLTIP_OFFSET, top),
  };
}

function resetTooltipState() {
  tooltipVisible.value = false;
  activeTooltipRow.value = null;
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
    if (normalizedPlayerTeam === null) {
      return sameTeam ? normalizedTeamId === null : normalizedTeamId !== null;
    }
    return sameTeam ? normalizedTeamId === normalizedPlayerTeam : normalizedTeamId !== normalizedPlayerTeam;
  });
  return {
    points: parseNumeric(entry?.points),
    rebounds: parseNumeric(entry?.rebounds),
    assists: parseNumeric(entry?.assists),
    turnovers: parseNumeric(entry?.turnovers),
    fieldGoals: formatAttemptLine(entry?.field_goals_made, entry?.field_goals_attempted),
    threePointers: formatAttemptLine(entry?.three_pointers_made, entry?.three_pointers_attempted),
    freeThrows: formatAttemptLine(entry?.free_throws_made, entry?.free_throws_attempted),
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

function buildTeamComparison(teamLabel, opponentLabel, teamTotals, opponentTotals) {
  const metricMap = [
    { key: 'points', label: 'PTS' },
    { key: 'rebounds', label: 'REB' },
    { key: 'assists', label: 'AST' },
    { key: 'turnovers', label: 'TOV' },
    { key: 'fieldGoals', label: 'FG' },
    { key: 'threePointers', label: '3P' },
    { key: 'freeThrows', label: 'FT' },
  ];

  const rows = metricMap.map(({ key, label }) => ({
    label,
    team: formatComparisonValue(teamTotals, key),
    opponent: formatComparisonValue(opponentTotals, key),
  }));

  return {
    teamLabel,
    opponentLabel,
    rows,
  };
}

function formatComparisonValue(source, key) {
  if (!source) return '-';
  const rawValue = source[key];
  if (rawValue === null || rawValue === undefined) return '-';
  if (typeof rawValue === 'number') return formatNumericDisplay(rawValue);
  return String(rawValue);
}

function buildInjuryReport(game, playerTeamId, playerTeamLabel, opponentLabel) {
  const injuries = Array.isArray(game?.injuries) ? game.injuries : [];
  const normalizedPlayerTeam = normalizeId(playerTeamId);
  const teamPlayers = [];
  const opponentPlayers = [];

  injuries.forEach((injury) => {
    const formatted = formatInjuryLabel(injury);
    const normalizedTeamId = normalizeId(injury?.team_id);
    if (normalizedTeamId === normalizedPlayerTeam) {
      teamPlayers.push(formatted);
    } else {
      opponentPlayers.push(formatted);
    }
  });

  return {
    team: {
      label: formatInjuryColumnLabel(playerTeamLabel, true),
      players: teamPlayers,
    },
    opponent: {
      label: formatInjuryColumnLabel(opponentLabel, false),
      players: opponentPlayers,
    },
  };
}

function formatInjuryLabel(injury) {
  if (!injury) return 'Jugador sin datos';
  const resolvedName = resolveInjuryPlayerName(injury);
  if (resolvedName) return resolvedName;
  const fallbackId =
    injury.player_id ??
    injury.player?.player_id ??
    injury.player?.id ??
    injury.id ??
    injury.player_info?.id;
  if (fallbackId !== null && fallbackId !== undefined) {
    return `Jugador ${fallbackId}`;
  }
  return 'Jugador sin datos';
}

function formatInjuryColumnLabel(label, isPlayerTeam) {
  const base = label && label !== '-' ? label : isPlayerTeam ? 'Equipo' : 'Rival';
  return `Lesionados ${base}`;
}

function resolveInjuryPlayerName(injury) {
  const nestedPlayer = injury.player ?? injury.player_info ?? null;
  const candidates = [
    formatFullName(injury.first_name, injury.last_name),
    injury.player_name,
    injury.name,
    formatFullName(injury.player_first_name, injury.player_last_name),
  ];
  if (nestedPlayer) {
    candidates.push(formatFullName(nestedPlayer.first_name, nestedPlayer.last_name));
    candidates.push(nestedPlayer.full_name);
    candidates.push(nestedPlayer.name);
  }
  return candidates
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .find((value) => value.length) || '';
}

function formatFullName(first, last) {
  const firstName = typeof first === 'string' ? first.trim() : '';
  const lastName = typeof last === 'string' ? last.trim() : '';
  if (firstName && lastName) return `${firstName} ${lastName}`;
  return firstName || lastName || '';
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
  resetTooltipState();
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

.team-comparison-tooltip {
  position: fixed;
  z-index: 90;
  min-width: 240px;
  background: rgba(8, 12, 25, 0.98);
  border: 1px solid rgba(56, 189, 248, 0.35);
  border-radius: 12px;
  padding: 12px;
  box-shadow: 0 15px 35px rgba(2, 6, 23, 0.8);
  pointer-events: none;
  backdrop-filter: blur(8px);
}

.team-comparison-tooltip__close {
  position: absolute;
  top: 4px;
  right: 6px;
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 16px;
  cursor: pointer;
}

.team-comparison-tooltip__title {
  margin: 0 0 8px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  text-align: center;
  color: #38bdf8;
  font-weight: 600;
}

.team-comparison-tooltip__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}

.team-comparison-tooltip__table thead th {
  text-align: center;
  padding: 4px 6px;
  color: #94a3b8;
  font-weight: 600;
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
}

.team-comparison-tooltip__table tbody th,
.team-comparison-tooltip__table tbody td {
  padding: 4px 6px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
}

.team-comparison-tooltip__table tbody th {
  text-align: left;
  color: #94a3b8;
  font-weight: 600;
  width: 30%;
}

.team-comparison-tooltip__table tbody td {
  text-align: center;
  color: #f8fafc;
  font-weight: 700;
  width: 35%;
}

.team-comparison-tooltip__table tbody tr:last-child th,
.team-comparison-tooltip__table tbody tr:last-child td {
  border-bottom: none;
}

.team-comparison-tooltip__injuries {
  display: flex;
  gap: 12px;
  margin-top: 12px;
}

.injury-column {
  flex: 1;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(56, 189, 248, 0.18);
  border-radius: 8px;
  padding: 8px;
}

.injury-column-title {
  margin: 0 0 6px;
  font-size: 11px;
  text-transform: uppercase;
  color: #38bdf8;
  text-align: center;
  letter-spacing: 0.06em;
}

.injury-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.injury-item {
  font-size: 12px;
  color: #f8fafc;
  text-align: center;
}

.injury-item--empty {
  color: #94a3b8;
  font-style: italic;
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

<template>
  <div class="tooltip-table">
    <table>
      <thead>
        <tr>
          <th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th>
          <th>TO</th><th>FGM</th><th>FGA</th><th>FTM</th><th>FTA</th><th>3PM</th><th>3PA</th><th>FOULS</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(score, i) in scores" :key="i">
          <td>{{ score.mins }}</td>
          <td>{{ score.points }}</td>
          <td>{{ score.rebounds }}</td>
          <td>{{ score.assists }}</td>
          <td>{{ score.steals }}</td>
          <td>{{ score.blocks }}</td>
          <td>{{ score.turnovers }}</td>
          <td>{{ score.field_goals_made }}</td>
          <td>{{ score.field_goals_attempted }}</td>
          <td>{{ score.free_throws_made }}</td>
          <td>{{ score.free_throws_attempted }}</td>
          <td>{{ score.three_pointers_made }}</td>
          <td>{{ score.three_pointers_attempted }}</td>
          <td>{{ score.fouls }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
defineProps({
  scores: Array
});
</script>

<style scoped>
.tooltip-table {
  background: white;
  color: black;
  border: 1px solid #ccc;
  position: absolute;
  z-index: 9999;
  padding: 5px;
  border-radius: 5px;
  max-height: 300px;
  overflow: auto;
  box-shadow: 0 0 8px rgba(0, 0, 0, 0.2);
}

.tooltip-table table {
  font-size: 12px;
  border-collapse: collapse;
  min-width: 600px;
}

.tooltip-table th,
.tooltip-table td {
  padding: 3px 6px;
  border: 1px solid #ccc;
  text-align: center;
}
</style>

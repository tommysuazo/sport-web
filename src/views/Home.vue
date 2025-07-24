<script setup>
import { ref } from "vue";

defineProps({
  msg: String,
});

const count = ref(0);

const games = [
  {
    min: 40,
    pts: 25,
    reb: 4,
    ast: 4,
    stl: 1,
    blk: 0,
    to: 0,
    fgm: 10,
    fga: 22,
    ftm: 5,
    fta: 5,
    tpm: 0,
    tpa: 4,
    oreb: 1,
    dreb: 3,
    fouls: 5,
  },
  // Agrega los demás juegos aquí…
];
</script>

<template>
  <div class="p-6 bg-gray-900 text-white rounded-lg">
    <h2 class="text-2xl mb-4">Game Stats</h2>
    <div class="overflow-auto">
      <table class="min-w-full text-sm table-auto border-collapse">
        <thead class="bg-gray-800 text-gray-300">
          <tr>
            <th class="p-2 text-left">MIN</th>
            <th class="p-2 text-left">PTS</th>
            <th class="p-2 text-left">REB</th>
            <th class="p-2 text-left">AST</th>
            <th class="p-2 text-left">STL</th>
            <th class="p-2 text-left">BLK</th>
            <th class="p-2 text-left">TO</th>
            <th class="p-2 text-left">FGM</th>
            <th class="p-2 text-left">FGA</th>
            <th class="p-2 text-left">FTM</th>
            <th class="p-2 text-left">FTA</th>
            <th class="p-2 text-left">3PM</th>
            <th class="p-2 text-left">3PA</th>
            <th class="p-2 text-left">OREB</th>
            <th class="p-2 text-left">DREB</th>
            <th class="p-2 text-left">FOULS</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(game, index) in games" :key="index" class="odd:bg-gray-700 even:bg-gray-800">
            <td class="p-2">{{ game.min }}</td>
            <td class="p-2">{{ game.pts }}</td>
            <td class="p-2">{{ game.reb }}</td>
            <td class="p-2">{{ game.ast }}</td>
            <td class="p-2">{{ game.stl }}</td>
            <td class="p-2">{{ game.blk }}</td>
            <td class="p-2">{{ game.to }}</td>
            <td class="p-2">{{ game.fgm }}</td>
            <td class="p-2">{{ game.fga }}</td>
            <td class="p-2">{{ game.ftm }}</td>
            <td class="p-2">{{ game.fta }}</td>
            <td class="p-2">{{ game.tpm }}</td>
            <td class="p-2">{{ game.tpa }}</td>
            <td class="p-2">{{ game.oreb }}</td>
            <td class="p-2">{{ game.dreb }}</td>
            <td class="p-2">{{ game.fouls }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.read-the-docs {
    color: #888;
}
</style>

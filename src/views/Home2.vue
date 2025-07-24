
<template>
    <div class="container">
      <h2>NBA Games</h2>
  
      <div v-for="game in games" :key="game.id" class="game-card">
        <h3>
          {{ game.away_team.city }} {{ game.away_team.name }} vs {{ game.home_team.city }} {{ game.home_team.name }}
        </h3>
  
        <div class="teams">
          <!-- Equipo Visitante -->
          <div class="team">
            <h4>Away: {{ game.away_team.name }}</h4>
            <table>
              <thead>
                <tr>
                  <th>Jugador</th>
                  <th>Pts</th>
                  <th>Rebs</th>
                  <th>Ast</th>
                  <th>PRA</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="player in game.away_team.players" :key="player.id" 
                    @mouseenter="showTooltip(player)" 
                    @mouseleave="hideTooltip">
                  <td>{{ player.first_name }} {{ player.last_name }}</td>
                  <td :class="getColor(player.scores[0]?.points, player.points_market)">{{ player.points_market }}</td>
                  <td :class="getColor(player.scores[0]?.rebounds, player.rebounds_market)">{{ player.rebounds_market }}</td>
                  <td :class="getColor(player.scores[0]?.assists, player.assists_market)">{{ player.assists_market }}</td>
                  <td :class="getColor(player.scores[0]?.points + player.scores[0]?.rebounds + player.scores[0]?.assists, player.pra_market)">{{ player.pra_market }}</td>
                </tr>
              </tbody>
            </table>
          </div>
  
          <!-- Equipo Local -->
          <div class="team">
            <h4>Home: {{ game.home_team.name }}</h4>
            <table>
              <thead>
                <tr>
                  <th>Jugador</th>
                  <th>Pts</th>
                  <th>Rebs</th>
                  <th>Ast</th>
                  <th>PRA</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="player in game.home_team.players" :key="player.id"
                    @mouseenter="showTooltip(player)" 
                    @mouseleave="hideTooltip">
                  <td>{{ player.first_name }} {{ player.last_name }}</td>
                  <td :class="getColor(player.scores[0]?.points, player.points_market)">{{ player.points_market }}</td>
                  <td :class="getColor(player.scores[0]?.rebounds, player.rebounds_market)">{{ player.rebounds_market }}</td>
                  <td :class="getColor(player.scores[0]?.assists, player.assists_market)">{{ player.assists_market }}</td>
                  <td :class="getColor(player.scores[0]?.points + player.scores[0]?.rebounds + player.scores[0]?.assists, player.pra_market)">{{ player.pra_market }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
  
        <!-- Tooltip -->
        <div v-if="tooltipPlayer" class="tooltip">
          <h4>{{ tooltipPlayer.first_name }} {{ tooltipPlayer.last_name }}</h4>
          <ul>
            <li v-for="score in tooltipPlayer.scores" :key="score.id">
              {{ score.points }} pts, {{ score.rebounds }} rebs, {{ score.assists }} asts
            </li>
          </ul>
        </div>
      </div>
    </div>
  </template>
  
  <script setup>
  import { ref } from 'vue';
  
  const games = ref([
    {
      id: 278,
      away_team: {
        name: "Nuggets",
        city: "Denver",
        players: [
          {
            id: 380,
            first_name: "Nikola",
            last_name: "Jokic",
            points_market: 28.5,
            assists_market: 10.5,
            rebounds_market: 13.5,
            pra_market: 52.5,
            scores: [
              { id: 1, points: 28, assists: 13, rebounds: 9 },
              { id: 2, points: 30, assists: 7, rebounds: 10 }
            ]
          }
        ]
      },
      home_team: {
        name: "Hornets",
        city: "Charlotte",
        players: [
          {
            id: 677,
            first_name: "Josh",
            last_name: "Green",
            points_market: 7.5,
            rebounds_market: 3.5,
            assists_market: null,
            pra_market: null,
            scores: [
              { id: 3, points: 10, assists: 1, rebounds: 4 },
              { id: 4, points: 17, assists: 0, rebounds: 3 }
            ]
          }
        ]
      }
    }
  ]);
  
  const tooltipPlayer = ref(null);
  
  const showTooltip = (player) => {
    tooltipPlayer.value = player;
  };
  
  const hideTooltip = () => {
    tooltipPlayer.value = null;
  };
  
  // Colorea los valores si superan o no el market
  const getColor = (score, market) => {
    if (market === null || score === undefined) return "gray";
    return score >= market ? "green" : "red";
  };
  </script>
  
  <style scoped>
  .container {
    padding: 20px;
    font-family: Arial, sans-serif;
  }
  
  h2 {
    font-size: 24px;
    font-weight: bold;
  }
  
  .game-card {
    border: 1px solid #ddd;
    padding: 15px;
    margin-bottom: 20px;
    border-radius: 8px;
    box-shadow: 2px 2px 10px rgba(0, 0, 0, 0.1);
  }
  
  h3 {
    font-size: 18px;
    margin-bottom: 10px;
  }
  
  .teams {
    display: flex;
    gap: 20px;
  }
  
  .team {
    width: 50%;
  }
  
  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 10px;
  }
  
  th, td {
    border: 1px solid #ddd;
    padding: 8px;
    text-align: center;
  }
  
  th {
    background: #000000;
  }
  
  .red {
    color: red;
    font-weight: bold;
  }
  
  .green {
    color: green;
    font-weight: bold;
  }
  
  .tooltip {
    position: absolute;
    background: rgb(0, 0, 0);
    border: 1px solid #ddd;
    padding: 10px;
    box-shadow: 2px 2px 5px rgba(0, 0, 0, 0.2);
    border-radius: 5px;
  }
  </style>
  

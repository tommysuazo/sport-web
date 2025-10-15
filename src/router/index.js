import { createWebHistory, createRouter } from 'vue-router'

import Home from '../views/Home.vue'
import Home2 from '../views/Home2.vue'
import Nfl from '../views/Nfl.vue'
import Nhl from '../views/Nhl.vue'

const routes = [
  { path: '/', component: Home },
  { path: '/home2', component: Home2 },
  { path: '/nfl', component: Nfl },
  { path: '/nhl', component: Nhl },
  { path: '/:pathMatch(.*)', name: 'NotFound', component: Home },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router;

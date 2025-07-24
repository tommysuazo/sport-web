import { createWebHistory, createRouter } from 'vue-router'

import Home from '../views/Home.vue'
import Home2 from '../views/Home2.vue'

const routes = [
  { path: '/', component: Home },
  { path: '/home2', component: Home2},
  { path: '/:pathMatch(.*)', name: 'NotFound', component: Home },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router;
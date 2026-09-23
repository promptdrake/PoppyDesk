import { createRouter, createWebHistory } from 'vue-router'
import { session } from './session'
import AuthView from './views/AuthView.vue'
import InboxView from './views/InboxView.vue'
import AccountsView from './views/AccountsView.vue'
import CommandsView from './views/CommandsView.vue'
import TeamView from './views/TeamView.vue'
import SettingsView from './views/SettingsView.vue'

const router = createRouter({ history: createWebHistory(), routes: [
  { path: '/login', component: AuthView, meta: { public: true } },
  { path: '/signup', component: AuthView, meta: { public: true } },
  { path: '/setup', component: AuthView, meta: { public: true } },
  { path: '/', component: InboxView },
  { path: '/accounts', component: AccountsView, meta: { owner: true } },
  { path: '/commands', component: CommandsView },
  { path: '/team', component: TeamView, meta: { owner: true } },
  { path: '/settings', component: SettingsView, meta: { owner: true } },
  { path: '/:pathMatch(.*)*', redirect: '/' },
] })

router.beforeEach((to) => {
  if (!session.ready) return true
  if (!to.meta.public && !session.user) return '/login'
  if (to.meta.public && session.user) return '/'
  if (to.meta.owner && session.user?.role !== 'owner') return '/'
  return true
})
export default router

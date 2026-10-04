import { createRouter, createWebHistory } from 'vue-router'
import { session } from './session'
import AuthView from './views/AuthView.vue'
import InboxView from './views/InboxView.vue'
import AccountsView from './views/AccountsView.vue'
import CommandsView from './views/CommandsView.vue'
import TeamView from './views/TeamView.vue'
import SettingsView from './views/SettingsView.vue'
import WorkHoursView from './views/WorkHoursView.vue'
import AutoRepliesView from "./views/AutoRepliesView.vue";
import AiSettingsView from './views/AiSettingsView.vue'
import ApiKeysView from './views/ApiKeysView.vue'
import ApiDocsView from './views/ApiDocsView.vue'

const router = createRouter({ history: createWebHistory(), routes: [
  { path: '/login', component: AuthView, meta: { public: true } },
  { path: '/signup', component: AuthView, meta: { public: true } },
  { path: '/setup', component: AuthView, meta: { public: true } },
  { path: '/', component: InboxView },
  { path: '/accounts', component: AccountsView, meta: { owner: true } },
  { path: '/commands', component: CommandsView },
  { path: '/team', component: TeamView, meta: { owner: true } },
  { path: '/settings', component: SettingsView, meta: { owner: true } },
  { path: '/settings/work-hours', component: WorkHoursView, meta: { owner: true } },
  { path: '/settings/auto-replies', component: AutoRepliesView, meta: { owner: true } },
  { path: '/settings/ai', component: AiSettingsView, meta: { owner: true } },
  { path: '/settings/api-keys', component: ApiKeysView, meta: { owner: true } },
  { path: '/settings/api-docs', component: ApiDocsView, meta: { owner: true } },
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

<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, RouterView, useRouter } from 'vue-router'
import { Inbox, MessageSquareText, Smartphone, Users, LogOut, WifiOff, Menu, X, Settings, Clock, Bot, Key } from 'lucide-vue-next'
import { session, setUser } from './session'
import { api } from './api'

const router = useRouter()
const online = ref(navigator.onLine)
const menuOpen = ref(false)
window.addEventListener('online', () => online.value = true)
window.addEventListener('offline', () => online.value = false)
const authed = computed(() => !!session.user)

async function logout() {
  try { await api('/auth/logout', { method: 'POST' }) } finally { setUser(null); await router.push('/login') }
}
</script>

<template>
  <div v-if="authed" class="app-shell">
    <header class="topbar">
      <RouterLink to="/" class="brand"><span class="brand-mark"><MessageSquareText :size="21" /></span><span>Poppy Desk</span></RouterLink>
      <div class="topbar-right">
        <span v-if="!online" class="offline-pill"><WifiOff :size="14" /> Offline</span>
        <div class="user-meta"><strong>{{ session.user?.name || session.user?.email.split('@')[0] }}</strong><small>{{ session.user?.role }}</small></div>
        <button class="icon-btn mobile-only" aria-label="Open menu" @click="menuOpen = !menuOpen"><X v-if="menuOpen" /><Menu v-else /></button>
      </div>
    </header>
    <aside class="sidebar" :class="{ open: menuOpen }" @click="menuOpen = false">
      <nav>
        <RouterLink to="/"><Inbox /> <span>Inbox</span></RouterLink>
        <RouterLink to="/commands"><MessageSquareText /> <span>Quick replies</span></RouterLink>
        <RouterLink v-if="session.user?.role === 'owner'" to="/accounts"><Smartphone /> <span>Channels</span></RouterLink>
        <RouterLink v-if="session.user?.role === 'owner'" to="/team"><Users /> <span>Team</span></RouterLink>
        <RouterLink v-if="session.user?.role === 'owner'" to="/settings"><Settings /> <span>Storage Settings</span></RouterLink>
        <RouterLink v-if="session.user?.role === 'owner'" to="/settings/work-hours"><Clock /> <span>Work Hours</span></RouterLink>
        <RouterLink v-if="session.user?.role === 'owner'" to="/settings/auto-replies"><MessageSquareText /> <span>Auto Replies</span></RouterLink>
        <RouterLink v-if="session.user?.role === 'owner'" to="/settings/ai"><Bot /> <span>AI Responder</span></RouterLink>
        <RouterLink v-if="session.user?.role === 'owner'" to="/settings/api-keys"><Key /> <span>API Keys</span></RouterLink>
      </nav>
      <button class="logout" @click="logout"><LogOut /> <span>Sign out</span></button>
    </aside>
    <main class="main-content"><RouterView /></main>
  </div>
  <RouterView v-else />
</template>

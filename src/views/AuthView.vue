<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { MessageSquareText, ArrowRight, Eye, EyeOff } from 'lucide-vue-next'
import { api, json } from '../api'
import { session, setUser } from '../session'
import type { User } from '../types'

const route = useRoute(), router = useRouter()
const mode = computed(() => route.path.slice(1) || 'login')
const form = reactive({ name: '', email: '', password: '', credential: '' })
const loading = ref(false), error = ref(''), showPassword = ref(false)
const title = computed(() => mode.value === 'setup' ? 'Create your workspace' : mode.value === 'signup' ? 'Join your team inbox' : 'Welcome back')
const subtitle = computed(() => mode.value === 'setup' ? 'Set up the initial owner account for this workspace.' : mode.value === 'signup' ? 'Use the signup credential shared by your workspace owner.' : 'Sign in to manage customer conversations.')

async function submit() {
  loading.value = true; error.value = ''
  try {
    const payload: Record<string, string> = { email: form.email, password: form.password }
    if (form.name) payload.name = form.name
    if (mode.value === 'signup' && form.credential) payload.signup_credential = form.credential
    const path = mode.value === 'setup' ? '/setup' : `/auth/${mode.value}`
    const result = await api<User | { user: User }>(path, json(payload))
    setUser('user' in result ? result.user : result)
    await router.push('/')
  } catch (e) { error.value = (e as Error).message } finally { loading.value = false }
}
</script>
<template>
  <main class="auth-page">
    <section class="auth-intro">
      <div class="brand light"><span class="brand-mark"><MessageSquareText /></span> Poppy Desk</div>
      <div><h1>Every conversation.<br>One focused team.</h1><p>Bring every connected number into a calm, collaborative workspace built for fast replies.</p></div>
      <div class="auth-proof"></div>
    </section>
    <section class="auth-form-wrap">
      <form class="auth-card" @submit.prevent="submit">
        <div><p class="eyebrow">{{ mode === 'setup' ? 'FIRST-RUN SETUP' : 'SECURE ACCESS' }}</p><h2>{{ title }}</h2><p class="muted">{{ subtitle }}</p></div>
        <div v-if="error" class="alert error">{{ error }}</div>
        <label v-if="mode !== 'login'">Your name<input v-model="form.name" autocomplete="name" placeholder="Alex Morgan" /></label>
        <label>Email address<input v-model="form.email" required type="email" autocomplete="email" placeholder="you@company.com" /></label>
        <label>Password<div class="password-field"><input v-model="form.password" required minlength="10" :type="showPassword ? 'text' : 'password'" autocomplete="current-password" placeholder="At least 10 characters" /><button type="button" @click="showPassword = !showPassword"><EyeOff v-if="showPassword" /><Eye v-else /></button></div></label>
        <label v-if="mode === 'signup'">Signup credential<input v-model="form.credential" required minlength="12" type="password" placeholder="Employee invitation secret" /></label>
        <button class="primary wide" :disabled="loading">{{ loading ? 'Please wait…' : mode === 'setup' ? 'Create workspace' : mode === 'signup' ? 'Create account' : 'Sign in' }} <ArrowRight v-if="!loading" /></button>
        <p v-if="mode === 'login'" class="auth-switch">New employee? <RouterLink to="/signup">Create an account</RouterLink><RouterLink v-if="session.setupNeeded" to="/setup">Set up workspace</RouterLink></p>
        <p v-else-if="mode === 'signup'" class="auth-switch">Already registered? <RouterLink to="/login">Sign in</RouterLink></p>
        <p v-else class="auth-switch">Already initialized? <RouterLink to="/login">Sign in</RouterLink></p>
      </form>
    </section>
  </main>
</template>

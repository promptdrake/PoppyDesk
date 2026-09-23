<script setup lang="ts">
import { onMounted, reactive, ref, onBeforeUnmount } from 'vue'
import { HardDrive, Cloud, KeyRound, X, CheckCircle2, RefreshCw, PlugZap, Server } from 'lucide-vue-next'
import { api, json } from '../api'
import type { AppSettings } from '../types'
import UiState from '../components/UiState.vue'

type SysStats = { cpu_percent: number; ram_usage: number; ram_total: number; storage_size: number }
const stats = ref<SysStats | null>(null)
let statsTimer: number

function formatBytes(bytes: number) {
  if (!+bytes) return '0 Bytes'
  const k = 1024, sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

const settings = ref<AppSettings | null>(null)
const loading = ref(true), saving = ref(false), testing = ref(false)
const error = ref(''), success = ref(''), testResult = ref('')
const credential = ref(''), savingCredential = ref(false)
const form = reactive({ mode: 'local' as 'local' | 's3', access_key: '', secret_key: '', endpoint: '', public_url: '', bucket: '', folder: '', region: '' })

function payload() {
  return { mode: form.mode, s3: { access_key: form.access_key, secret_key: form.secret_key, endpoint: form.endpoint, public_url: form.public_url, bucket: form.bucket, folder: form.folder, region: form.region } }
}
async function load() {
  loading.value = true
  try {
    const data = await api<AppSettings>('/settings')
    settings.value = data
    form.mode = data.storage.mode
    form.access_key = data.storage.s3.access_key
    form.secret_key = ''
    form.endpoint = data.storage.s3.endpoint
    form.public_url = data.storage.s3.public_url
    form.bucket = data.storage.s3.bucket
    form.folder = data.storage.s3.folder
    form.region = data.storage.s3.region || 'us-east-1'
  } catch (e) { error.value = (e as Error).message } finally { loading.value = false }
}
async function saveStorage() {
  saving.value = true; error.value = ''; success.value = ''; testResult.value = ''
  try {
    settings.value = await api<AppSettings>('/settings/storage', json(payload(), 'PUT'))
    form.secret_key = ''
    success.value = 'Asset storage settings saved.'
  } catch (e) { error.value = (e as Error).message } finally { saving.value = false }
}
async function testStorage() {
  testing.value = true; error.value = ''; testResult.value = ''
  try {
    const result = await api<{ message: string }>('/settings/storage/test', json(payload()))
    testResult.value = result.message
  } catch (e) { error.value = (e as Error).message } finally { testing.value = false }
}
async function rotate() {
  savingCredential.value = true; error.value = ''; success.value = ''
  try {
    await api('/signup-credential', json({ credential: credential.value }, 'PUT'))
    credential.value = ''
    success.value = 'Signup credential updated. Existing employee sessions are unchanged.'
    await load()
  } catch (e) { error.value = (e as Error).message } finally { savingCredential.value = false }
}
const when = (value?: string) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : ''
async function loadStats() {
  try { stats.value = await api<SysStats>('/settings/stats') } catch { /* ignore error */ }
}
onMounted(() => {
  load()
  loadStats()
  statsTimer = window.setInterval(loadStats, 5000)
})
onBeforeUnmount(() => clearInterval(statsTimer))
</script>
<template>
  <div class="page content-page">
    <header class="page-title"><div><p class="eyebrow">OWNER CONTROLS</p><h1>Settings</h1><p>Choose where assets are stored and manage the employee signup credential.</p></div></header>
    <div v-if="error" class="alert error">{{ error }}<button @click="error = ''"><X /></button></div>
    <div v-if="success" class="alert success">{{ success }}<button @click="success = ''"><X /></button></div>
    <div v-if="testResult" class="alert success">{{ testResult }}<button @click="testResult = ''"><X /></button></div>
    <UiState v-if="loading" type="loading" title="Loading settings" />
    <div v-else-if="settings" class="settings-grid">
      <section class="panel storage-panel">
        <header><span class="panel-icon"><HardDrive /></span><div><h2>Asset Storage</h2><p>Images and stickers received or sent from the inbox are saved here.</p></div></header>
        <div class="storage-options">
          <button type="button" class="storage-option" :class="{ active: form.mode === 'local' }" @click="form.mode = 'local'">
            <span class="storage-option-icon"><HardDrive /></span>
            <span><strong>Local (Server Storage)</strong><small>Save assets on this server's filesystem.</small></span>
          </button>
          <button type="button" class="storage-option" :class="{ active: form.mode === 's3' }" @click="form.mode = 's3'">
            <span class="storage-option-icon"><Cloud /></span>
            <span><strong>S3</strong><small>Save assets in an S3-compatible bucket.</small></span>
          </button>
        </div>
        <form class="storage-form" @submit.prevent="saveStorage">
          <template v-if="form.mode === 's3'">
            <div class="field-grid">
              <label>AWS_ACCESS_KEY<input v-model="form.access_key" autocomplete="off" placeholder="AKIA..." /></label>
              <label>AWS_SECRET_KEY<input v-model="form.secret_key" type="password" autocomplete="new-password" :placeholder="settings.storage.s3.secret_key_set ? 'Stored secret kept unless replaced' : 'Required'" /></label>
              <label>AWS_ENDPOINT<input v-model="form.endpoint" autocomplete="off" placeholder="https://s3.example.com" /></label>
              <label>AWS_PUBLIC_URL<input v-model="form.public_url" autocomplete="off" placeholder="https://cdn.example.com" /></label>
              <label>AWS_BUCKET<input v-model="form.bucket" autocomplete="off" placeholder="my-bucket" /></label>
              <label>AWS_FOLDER_LOCATION<input v-model="form.folder" autocomplete="off" placeholder="relay/media" /></label>
              <label>Region<input v-model="form.region" autocomplete="off" placeholder="us-east-1" /></label>
            </div>
            <p class="field-hint">Leave the secret key empty to keep the stored value. A public URL serves assets directly; without one, assets are streamed through the authenticated API.</p>
          </template>
          <p v-else class="field-hint">Assets are written to the server directory below with private file permissions. No external credentials are required.</p>
          <div class="storage-actions">
            <button class="primary" type="submit" :disabled="saving"><RefreshCw v-if="saving" class="spin" />{{ saving ? 'Saving…' : 'Save storage settings' }}</button>
            <button class="secondary" type="button" :disabled="testing" @click="testStorage"><PlugZap />{{ testing ? 'Testing…' : 'Test connection' }}</button>
          </div>
        </form>
        <div class="panel-subhead"><CheckCircle2 /><span>Currently in use</span></div>
        <dl class="current-config">
          <div><dt>Storage</dt><dd>{{ settings.storage.current }}</dd></div>
          <div v-if="settings.storage.mode === 'local'"><dt>Directory</dt><dd>{{ settings.storage.local_dir }}</dd></div>
          <template v-else>
            <div><dt>Bucket</dt><dd>{{ settings.storage.s3.bucket || 'Not set' }}</dd></div>
            <div><dt>Folder</dt><dd>{{ settings.storage.s3.folder || 'Bucket root' }}</dd></div>
            <div><dt>Endpoint</dt><dd>{{ settings.storage.s3.endpoint || 'AWS default' }}</dd></div>
            <div><dt>Public URL</dt><dd>{{ settings.storage.s3.public_url || 'Not set' }}</dd></div>
            <div><dt>Access key</dt><dd>{{ settings.storage.s3.access_key || 'Not set' }}</dd></div>
            <div><dt>Secret key</dt><dd>{{ settings.storage.s3.secret_key_set ? settings.storage.s3.secret_key_hint : 'Not set' }}</dd></div>
          </template>
        </dl>
      </section>
      <section class="panel">
        <header><span class="panel-icon"><KeyRound /></span><div><h2>Signup credential</h2><p>Employees need this secret when creating their account.</p></div></header>
        <form class="credential-form" @submit.prevent="rotate">
          <p class="field-hint" v-if="settings.signup_credential.updated_at">Currently set{{ settings.signup_credential.updated_by ? ' by ' + settings.signup_credential.updated_by : '' }} on {{ when(settings.signup_credential.updated_at) }}. The stored value is never shown.</p>
          <label>New signup credential<input v-model="credential" required minlength="12" type="password" autocomplete="new-password" placeholder="At least 12 characters" /></label>
          <p class="field-hint">Rotating this prevents new signups with the old credential. It does not sign out existing users.</p>
          <button class="primary" :disabled="savingCredential">{{ savingCredential ? 'Updating…' : 'Update credential' }}</button>
        </form>
      </section>
      <section class="panel">
        <header><span class="panel-icon"><Server /></span><div><h2>Server Statistics</h2><p>Live resource usage from the backend server.</p></div></header>
        <dl class="current-config" v-if="stats">
          <div><dt>CPU Usage</dt><dd>{{ stats.cpu_percent.toFixed(1) }}%</dd></div>
          <div><dt>RAM Usage</dt><dd>{{ formatBytes(stats.ram_usage) }} / {{ formatBytes(stats.ram_total) }}</dd></div>
          <div><dt>Asset Storage Used</dt><dd>{{ formatBytes(stats.storage_size) }}</dd></div>
        </dl>
      </section>
    </div>
  </div>
</template>

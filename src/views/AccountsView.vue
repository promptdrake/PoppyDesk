<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { Plus, Smartphone, QrCode, Link2, RotateCw, Trash2, X, Copy, Check, Bot, AlertCircle } from 'lucide-vue-next'
import { api, json } from '../api'
import type { Account } from '../types'
import UiState from '../components/UiState.vue'

const accounts = ref<Account[]>([]), loading = ref(true), error = ref(''), modal = ref<'new' | 'connect' | null>(null)
const active = ref<Account | null>(null), method = ref<'qr' | 'pair'>('qr'), qr = ref(''), pairCode = ref(''), expires = ref(''), working = ref(false), copied = ref(false)
const connectionState = ref<'idle' | 'waiting' | 'expired'>('idle'), success = ref('')
const form = reactive({ name: '', phone: '', provider: 'whatsapp' as 'whatsapp' | 'telegram', botToken: '' })
let socket: WebSocket | null = null
let pollTimer: number | undefined
const arrayOf = <T,>(v: T[] | { accounts: T[] }) => Array.isArray(v) ? v : v.accounts
const isTelegram = (account: Account) => account.provider === 'telegram'
function accountDetail(account: Account) {
  if (account.phone) return account.phone
  if (isTelegram(account)) return 'Bot token active'
  return account.status === 'connected' ? 'Linked device' : 'Not paired yet'
}

async function load() { loading.value = true; try { accounts.value = arrayOf(await api('/accounts')) } catch (e) { error.value = (e as Error).message } finally { loading.value = false } }
async function refreshAccounts() { accounts.value = arrayOf(await api('/accounts')) }
function openNew() { form.name = ''; form.phone = ''; form.botToken = ''; form.provider = 'whatsapp'; modal.value = 'new' }
async function create() {
  working.value = true; error.value = ''; success.value = ''
  try {
    if (form.provider === 'telegram') {
      const account = await api<Account>('/accounts', json({ name: form.name, provider: 'telegram', bot_token: form.botToken }))
      modal.value = null; form.name = ''; form.botToken = ''; await load()
      success.value = `${account.name} connected as a Telegram bot.`
      return
    }
    const account = await api<Account>('/accounts', json({ name: form.name, provider: 'whatsapp' }))
    modal.value = null; form.name = ''
    await load(); openConnect(account || accounts.value.at(-1)!)
  } catch (e) { error.value = (e as Error).message } finally { working.value = false }
}
function openConnect(account: Account) { active.value = account; modal.value = 'connect'; qr.value = ''; pairCode.value = ''; expires.value = ''; method.value = 'qr'; connectionState.value = 'idle' }
async function connect(kind = method.value) {
  if (!active.value) return
  working.value = true; error.value = ''
  try {
    const action = kind === 'pair' ? 'pairing' : 'qr'
    const result = await api<Record<string, string>>(`/accounts/${active.value.id}/${action}`, json(kind === 'pair' ? { phone: form.phone || active.value.phone } : {}))
    qr.value = result.qr || result.qr_code || result.image || result.data || ''
    pairCode.value = result.code || result.pairing_code || ''
    expires.value = result.expires_at || ''
    connectionState.value = 'waiting'
    startPolling()
  } catch (e) { error.value = (e as Error).message } finally { working.value = false }
}
async function reconnect(account: Account) {
  error.value = ''; success.value = ''
  try { await api(`/accounts/${account.id}/connect`, { method: 'POST' }); await load(); success.value = `${account.name} reconnected.` } catch (e) { error.value = (e as Error).message }
}
async function remove(account: Account) { if (!confirm(`Remove ${account.name}? The other channels will not be affected.`)) return; try { await api(`/accounts/${account.id}`, { method: 'DELETE' }); await load() } catch (e) { error.value = (e as Error).message } }
async function copyCode() { await navigator.clipboard.writeText(pairCode.value); copied.value = true; setTimeout(() => copied.value = false, 1500) }
function stopPolling() { if (pollTimer !== undefined) window.clearInterval(pollTimer); pollTimer = undefined }
function confirmConnected(account: Account) {
  active.value = account
  success.value = `${account.name} connected successfully.`
  stopPolling()
  modal.value = null
}
async function pollConnection() {
  if (modal.value !== 'connect' || connectionState.value !== 'waiting' || !active.value) { stopPolling(); return }
  if (expires.value && Date.now() >= new Date(expires.value).getTime()) { connectionState.value = 'expired'; stopPolling(); return }
  try {
    await refreshAccounts()
    const updated = accounts.value.find(account => account.id === active.value?.id)
    if (updated) active.value = updated
    if (updated?.status === 'connected') confirmConnected(updated)
  } catch (e) { error.value = (e as Error).message }
}
function startPolling() {
  stopPolling()
  pollTimer = window.setInterval(pollConnection, 2000)
}
function connectSocket() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  socket = new WebSocket(`${protocol}//${location.host}/api/ws`)
  socket.onmessage = async (event) => {
    try {
      const payload = JSON.parse(event.data)
      if (!payload.type?.startsWith('account.')) return
      await refreshAccounts()
      const updated = active.value && accounts.value.find(account => account.id === active.value?.id)
      if (updated) active.value = updated
      if (connectionState.value === 'waiting' && updated?.status === 'connected') confirmConnected(updated)
    } catch { /* A later status event or manual refresh will retry. */ }
  }
}
watch(modal, value => { if (value !== 'connect') { stopPolling(); connectionState.value = 'idle' } })
onMounted(async () => { await load(); connectSocket() })
onBeforeUnmount(() => { socket?.close(); stopPolling() })
</script>
<template>
  <div class="page content-page">
    <header class="page-title"><div><p class="eyebrow">OWNER CONTROLS</p><h1>Channels</h1><p>Connect WhatsApp numbers and Telegram bots to the shared inbox.</p></div><button class="primary" @click="openNew"><Plus /> Add channel</button></header>
    <div v-if="error" class="alert error">{{ error }}<button @click="error = ''"><X /></button></div>
    <div v-if="success" class="alert success">{{ success }}<button @click="success = ''"><X /></button></div>
    <UiState v-if="loading" type="loading" title="Loading channels" />
    <UiState v-else-if="!accounts.length" title="Connect your first channel" text="Add a WhatsApp number with a QR code, or a Telegram bot with its token."><button class="primary" @click="openNew"><Plus /> Add channel</button></UiState>
    <div v-else class="card-grid">
      <article v-for="account in accounts" :key="account.id" class="account-card">
        <header><span class="device-icon"><Bot v-if="isTelegram(account)" /><Smartphone v-else /></span><span class="status-badge" :class="account.status"><i />{{ account.status }}</span></header>
        <h3>{{ account.name }}</h3>
        <p class="channel-meta"><span class="channel-badge" :class="isTelegram(account) ? 'telegram' : 'whatsapp'">{{ isTelegram(account) ? 'Telegram bot' : 'WhatsApp' }}</span><span>{{ accountDetail(account) }}</span></p>
        <div class="card-actions">
          <button v-if="!isTelegram(account)" class="secondary" @click="openConnect(account)"><Link2 /> {{ account.status === 'connected' ? 'Pair again' : 'Connect' }}</button>
          <button class="secondary" @click="reconnect(account)"><RotateCw /> Reconnect</button>
          <button class="icon-btn danger" title="Delete" @click="remove(account)"><Trash2 /></button>
        </div>
      </article>
    </div>
    <div v-if="modal" class="modal-backdrop" @mousedown.self="modal = null">
      <section class="modal">
        <button class="modal-close" @click="modal = null"><X /></button>
        <template v-if="modal === 'new'">
          <p class="eyebrow">NEW CHANNEL</p><h2>Add a channel</h2><p class="muted">Pick the platform, then give it a clear name your team will recognize.</p>
          <div class="method-tabs">
            <button :class="{ active: form.provider === 'whatsapp' }" @click="form.provider = 'whatsapp'"><Smartphone /> WhatsApp</button>
            <button :class="{ active: form.provider === 'telegram' }" @click="form.provider = 'telegram'"><Bot /> Telegram Bot</button>
          </div>
          <form @submit.prevent="create">
            <label>Channel name<input v-model="form.name" required placeholder="Customer support" /></label>
            <template v-if="form.provider === 'telegram'">
              <label>Bot token<input v-model="form.botToken" required autocomplete="off" placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ" /></label>
              <p class="field-hint"><AlertCircle /> Create a bot with @BotFather on Telegram, then paste its HTTP API token. Telegram bots use long polling, not QR codes.</p>
            </template>
            <label v-else>Phone number <small>(optional)</small><input v-model="form.phone" type="tel" placeholder="+1 555 012 3456" /></label>
            <button class="primary wide" :disabled="working">{{ working ? 'Adding…' : form.provider === 'telegram' ? 'Connect bot' : 'Continue' }}</button>
          </form>
        </template>
        <template v-else>
          <p class="eyebrow">CONNECT ACCOUNT</p><h2>{{ active?.name }}</h2>
          <div class="method-tabs"><button :class="{active: method === 'qr'}" @click="method = 'qr'; qr = ''; pairCode = ''"><QrCode /> QR code</button><button :class="{active: method === 'pair'}" @click="method = 'pair'; qr = ''; pairCode = ''"><Smartphone /> Pairing code</button></div>
          <div v-if="method === 'pair' && !pairCode" class="pair-form"><label>WhatsApp phone number<input v-model="form.phone" type="tel" :placeholder="active?.phone || '+1 555 012 3456'" /></label></div>
          <div v-if="qr" class="qr-wrap"><img :src="qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`" alt="WhatsApp pairing QR code" /><p>Open WhatsApp → Linked devices → Link a device</p><p v-if="expires">Code expires at {{ new Date(expires).toLocaleTimeString() }}</p><strong class="connection-wait">{{ connectionState === 'expired' ? 'Code expired. Request a new code.' : 'Waiting for scan/confirmation' }}</strong></div>
          <div v-else-if="pairCode" class="pair-result"><small>YOUR PAIRING CODE</small><strong>{{ pairCode }}</strong><button class="secondary" @click="copyCode"><Check v-if="copied" /><Copy v-else />{{ copied ? 'Copied' : 'Copy code' }}</button><p v-if="expires">Expires {{ new Date(expires).toLocaleTimeString() }}</p><span class="connection-wait">{{ connectionState === 'expired' ? 'Code expired. Request a new code.' : 'Waiting for scan/confirmation' }}</span></div>
          <UiState v-else-if="working" type="loading" title="Requesting secure connection" />
          <div v-else class="connect-placeholder"><QrCode v-if="method === 'qr'" /><Smartphone v-else /><p>{{ method === 'qr' ? 'Generate a QR code, then scan it with WhatsApp.' : 'Request a code to enter in WhatsApp.' }}</p></div>
          <button v-if="!working" class="primary wide" @click="connect()">{{ qr || pairCode ? 'Request a new code' : method === 'qr' ? 'Generate QR code' : 'Get pairing code' }}</button>
        </template>
      </section>
    </div>
  </div>
</template>

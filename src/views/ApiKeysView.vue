<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Plus, Key, Trash, Eye, X, Check } from 'lucide-vue-next'

type ApiKey = {
  id: string
  name: string
  scope: string
  created_at: string
}

const keys = ref<ApiKey[]>([])
const loading = ref(true)
const showCreate = ref(false)
const creating = ref(false)

const form = ref({
  name: '',
  scope: 'all_apps'
})

const newlyCreatedToken = ref<string | null>(null)
const copied = ref(false)

async function fetchKeys() {
  const res = await fetch('/api/settings/api-keys')
  if (res.ok) {
    keys.value = await res.json()
  }
  loading.value = false
}

async function createKey() {
  creating.value = true
  try {
    const res = await fetch('/api/settings/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form.value)
    })
    if (res.ok) {
      const data = await res.json()
      newlyCreatedToken.value = data.token
      await fetchKeys()
      showCreate.value = false
      form.value = {
        name: '',
        scope: 'all_apps'
      }
    }
  } finally {
    creating.value = false
  }
}

async function deleteKey(id: string) {
  if (!confirm('Are you sure you want to revoke this API Key? Any integrations using it will instantly fail.')) return
  await fetch(`/api/settings/api-keys/${id}`, { method: 'DELETE' })
  await fetchKeys()
}

function copyToken() {
  if (!newlyCreatedToken.value) return
  navigator.clipboard.writeText(newlyCreatedToken.value)
  copied.value = true
  setTimeout(() => copied.value = false, 2000)
}

function dismissToken() {
  newlyCreatedToken.value = null
  copied.value = false
}

onMounted(() => {
  fetchKeys()
})
</script>

<template>
<div class="page content-page">
  <header class="page-title">
    <div>
      <p class="eyebrow">DEVELOPER</p>
      <h1>API Keys</h1>
      <p>Manage access tokens for programmatic API access.</p>
    </div>
    <div class="actions">
      <button class="secondary" @click="$router.push('/settings/api-docs')"><Eye /> View API Docs</button>
      <button class="primary" @click="showCreate = true"><Plus /> Generate New Key</button>
    </div>
  </header>

  <!-- Newly created token banner -->
  <div v-if="newlyCreatedToken" class="panel token-alert">
    <header>
      <span class="panel-icon token-icon"><Key /></span>
      <div>
        <h2>Your new API Key is ready!</h2>
        <p style="color: #b91c1c; font-weight: 600;">Please copy this key now. You will not be able to see it again.</p>
      </div>
    </header>
    <div class="token-alert-body">
      <div class="token-display">
        <code>{{ newlyCreatedToken }}</code>
        <button class="button secondary" @click="copyToken">
          <Check v-if="copied" style="color: green" />
          <span v-else>Copy</span>
        </button>
      </div>
      <div style="margin-top: 16px; text-align: right;">
        <button class="button primary" @click="dismissToken">I have copied it securely</button>
      </div>
    </div>
  </div>

  <section class="panel">
    <header>
      <span class="panel-icon"><Key /></span>
      <div>
        <h2>Active API Keys</h2>
        <p>Revoking a key takes effect immediately.</p>
      </div>
    </header>

    <div v-if="loading" style="padding: 20px; text-align: center; color: var(--muted);">Loading keys...</div>
    <div v-else-if="keys.length === 0" style="padding: 20px; text-align: center; color: var(--muted);">
      No API keys have been generated yet.
    </div>
    
    <div v-else class="replies-list">
      <div v-for="k in keys" :key="k.id" class="reply-card">
        <div class="reply-header">
          <div class="reply-trigger">
            <span class="keyword">{{ k.name }}</span>
            <span class="match-badge" :class="k.scope === 'all_apps' ? 'all' : 'connected'">
              {{ k.scope === 'all_apps' ? 'Full Access' : 'Manage Connected Apps Only' }}
            </span>
          </div>
          <div style="display: flex; align-items: center; gap: 16px;">
            <span style="font-size: 12px; color: var(--muted)">Created {{ new Date(k.created_at).toLocaleDateString() }}</span>
            <button class="icon-btn danger" @click="deleteKey(k.id)"><Trash style="width: 16px;" /></button>
          </div>
        </div>
      </div>
    </div>
  </section>

  <div v-if="showCreate" class="modal-backdrop" @click.self="showCreate = false">
    <div class="modal panel">
      <header><h2>Generate API Key</h2><button class="icon-btn" @click="showCreate = false"><X /></button></header>
      <form class="settings-form" @submit.prevent="createKey">
        
        <div class="field">
          <label>Name</label>
          <input type="text" v-model="form.name" required placeholder="e.g. Zapier Integration" />
        </div>
        
        <div class="field">
          <label>Permissions Scope</label>
          <select v-model="form.scope">
            <option value="all_apps">Full Access (All features)</option>
            <option value="connected_apps">Manage Connected Apps Only (Create/Delete WhatsApp/Telegram)</option>
          </select>
          <p class="help-text">Limit what this API key can access for security.</p>
        </div>
        
        <footer>
          <button type="button" class="secondary" @click="showCreate = false">Cancel</button>
          <button type="submit" class="primary" :disabled="creating">{{ creating ? 'Generating...' : 'Generate Key' }}</button>
        </footer>
      </form>
    </div>
  </div>
</div>
</template>

<style scoped>
.replies-list {
  display: flex;
  flex-direction: column;
}
.reply-card {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}
.reply-card:last-child {
  border-bottom: none;
}
.reply-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.reply-trigger {
  display: flex;
  align-items: center;
  gap: 12px;
}
.keyword {
  font-weight: 600;
  font-size: 15px;
  color: var(--text);
}
.match-badge {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  padding: 4px 8px;
  border-radius: 4px;
}
.match-badge.all {
  background: #fcebeb;
  color: #b62121;
}
.match-badge.connected {
  background: #eef4fc;
  color: #1a5c9f;
}

.token-alert {
  border: 2px solid #ef4444;
  background: #fef2f2;
  margin-bottom: 24px;
}
.token-icon {
  background: #fee2e2;
  color: #ef4444;
}
.token-alert-body {
  padding: 20px;
  background: #fffafa;
}
.token-display {
  display: flex;
  gap: 12px;
  padding: 16px;
  background: white;
  border-radius: 8px;
  border: 1px solid #fca5a5;
  align-items: center;
}
.token-display code {
  flex: 1;
  font-family: monospace;
  font-size: 15px;
  color: #111827;
  word-break: break-all;
}
</style>

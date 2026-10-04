<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Save, Bot, Activity } from 'lucide-vue-next'
import { api } from '../api'

const form = ref({
  enabled: false,
  url: '',
  api_key: '',
  model: '',
  system_prompt: ''
})
const apiKeySet = ref(false), apiKeyHint = ref('')

const saving = ref(false), testing = ref(false), message = ref(''), error = ref(''), testResult = ref('')

async function load() {
  try {
    const res: any = await api('/settings')
    form.value.enabled = res.ai.enabled
    form.value.url = res.ai.url
    form.value.model = res.ai.model
    form.value.system_prompt = res.ai.system_prompt
    apiKeySet.value = res.ai.api_key_set
    apiKeyHint.value = res.ai.api_key_hint
  } catch (e) {
    error.value = (e as Error).message
  }
}

async function save() {
  saving.value = true; error.value = ''; message.value = ''; testResult.value = ''
  try {
    await api('/settings/ai', {
      method: 'PUT',
      body: JSON.stringify(form.value)
    })
    message.value = 'AI settings saved successfully.'
    await load()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    saving.value = false
  }
}

async function testConnection() {
  testing.value = true; error.value = ''; message.value = ''; testResult.value = ''
  try {
    const res: any = await api('/settings/ai/test', {
      method: 'POST',
      body: JSON.stringify(form.value)
    })
    testResult.value = JSON.stringify(res, null, 2)
  } catch (e) {
    error.value = 'Test failed: ' + (e as Error).message
  } finally {
    testing.value = false
  }
}

onMounted(load)
</script>

<template>
<div class="page content-page">
  <header class="page-title">
    <div>
      <p class="eyebrow">SETTINGS</p>
      <h1>AI Auto-Responder</h1>
      <p>Configure an AI to reply to customers when you're away.</p>
    </div>
  </header>

  <section class="panel">
    <header>
      <span class="panel-icon"><Bot /></span>
        <div>
          <h2>AI Configuration</h2>
          <p>Connect an OpenAI-compatible API to handle your off-hours messages.</p>
        </div>
      </header>

      <form class="settings-form" @submit.prevent="save">
        <div class="field" style="display: flex; align-items: center; gap: 12px; margin-bottom: 24px;">
          <label class="toggle-switch">
            <input type="checkbox" v-model="form.enabled" />
            <span class="toggle-slider"></span>
          </label>
          <span style="font-weight: 600; font-size: 14px;">Enable AI Responder</span>
        </div>

        <div class="field">
          <label>API URL</label>
          <input type="url" v-model="form.url" placeholder="https://api.openai.com/v1/chat/completions" required />
          <p class="help">The endpoint for chat completions.</p>
        </div>

        <div class="field">
          <label>API Key</label>
          <input type="password" v-model="form.api_key" :placeholder="apiKeySet ? `Set (${apiKeyHint}) - leave blank to keep` : 'sk-...'" />
        </div>

        <div class="field">
          <label>Model</label>
          <input type="text" v-model="form.model" placeholder="gpt-4o" required />
        </div>

        <div class="field">
          <label>System Prompt</label>
          <textarea v-model="form.system_prompt" rows="5" placeholder="You are a helpful customer support agent..."></textarea>
          <p class="help">Instructions on how the AI should behave.</p>
        </div>

        <footer>
          <span class="status-msg success" v-if="message">{{ message }}</span>
          <span class="status-msg error" v-if="error">{{ error }}</span>
          
          <button type="button" class="secondary" @click="testConnection" :disabled="testing || saving">
            <Activity /> {{ testing ? 'Testing...' : 'Test Connection' }}
          </button>
          
          <button type="submit" class="primary" :disabled="saving || testing">
            <Save /> {{ saving ? 'Saving...' : 'Save Settings' }}
          </button>
        </footer>
      </form>
      
      <div v-if="testResult" style="margin: 20px; padding: 15px; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); white-space: pre-wrap; font-family: monospace; font-size: 12px; overflow-x: auto;">
        <strong>Test Result:</strong>
        {{ testResult }}
      </div>
    </section>
</div>
</template>

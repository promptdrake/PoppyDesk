<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Plus, MessageSquare, Trash, Bot, X } from 'lucide-vue-next'

type AutoReply = {
  id: string
  trigger_keyword: string
  match_type: string
  action: string
  response: string
  created_at: string
}

const replies = ref<AutoReply[]>([])
const loading = ref(true)
const showCreate = ref(false)
const creating = ref(false)

const form = ref({
  trigger_keyword: '',
  match_type: 'exact',
  action: 'message',
  response: ''
})

async function fetchReplies() {
  const res = await fetch('/api/settings/auto-replies')
  if (res.ok) {
    replies.value = await res.json()
  }
  loading.value = false
}
async function createReply() {
  creating.value = true
  try {
    const res = await fetch('/api/settings/auto-replies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form.value)
    })
    if (res.ok) {
      await fetchReplies()
      showCreate.value = false
      form.value = {
        trigger_keyword: '',
        match_type: 'exact',
        action: 'message',
        response: ''
      }
    }
  } finally {
    creating.value = false
  }
}

async function deleteReply(id: string) {
  if (!confirm('Are you sure you want to delete this auto reply?')) return
  await fetch(`/api/settings/auto-replies/${id}`, { method: 'DELETE' })
  await fetchReplies()
}

onMounted(() => {
  fetchReplies()
})
</script>

<template>
<div class="page content-page">
  <header class="page-title">
    <div>
      <p class="eyebrow">SETTINGS</p>
      <h1>Auto Reply</h1>
      <p>Configure automatic responses based on keywords.</p>
    </div>
    <div class="actions">
      <button class="primary" @click="showCreate = true"><Plus /> Create Rule</button>
    </div>
  </header>

  <section class="panel">
    <header>
      <span class="panel-icon"><MessageSquare /></span>
      <div>
        <h2>Active Rules</h2>
        <p>These rules run before the Work Hours check.</p>
      </div>
    </header>

    <div v-if="loading" style="padding: 20px; text-align: center; color: var(--muted);">Loading rules...</div>
    <div v-else-if="replies.length === 0" style="padding: 20px; text-align: center; color: var(--muted);">
      No auto reply rules created yet.
    </div>
    
    <div v-else class="replies-list">
      <div v-for="reply in replies" :key="reply.id" class="reply-card">
        <div class="reply-header">
          <div class="reply-trigger">
            <span class="keyword">"{{ reply.trigger_keyword }}"</span>
            <span class="match-badge">{{ reply.match_type }}</span>
          </div>
          <button class="icon-btn danger" @click="deleteReply(reply.id)"><Trash style="width: 16px;" /></button>
        </div>
        
        <div class="reply-action">
          <span class="action-badge" :class="reply.action">
            <MessageSquare v-if="reply.action === 'message'" style="width: 14px;" />
            <Bot v-if="reply.action === 'ai'" style="width: 14px;" />
            {{ reply.action === 'message' ? 'Static Message' : 'AI Prompt' }}
          </span>
          <div class="response-text">{{ reply.response }}</div>
        </div>
      </div>
    </div>
  </section>

  <div v-if="showCreate" class="modal-backdrop" @click.self="showCreate = false">
    <div class="modal panel">
      <header><h2>Create Auto Reply</h2><button class="icon-btn" @click="showCreate = false"><X /></button></header>
      <form class="settings-form" @submit.prevent="createReply">
        
        <div class="field">
          <label>Trigger Keyword</label>
          <input type="text" v-model="form.trigger_keyword" required placeholder="e.g. price" />
        </div>
        
        <div class="field">
          <label>Match Type</label>
          <select v-model="form.match_type">
            <option value="exact">Exact Match</option>
            <option value="contains">Contains Word</option>
          </select>
        </div>
        
        <div class="field">
          <label>Action</label>
          <select v-model="form.action">
            <option value="message">Send Static Message</option>
            <option value="ai">Trigger AI Responder</option>
          </select>
        </div>

        <div class="field">
          <label>{{ form.action === 'message' ? 'Message Content' : 'AI System Prompt' }}</label>
          <textarea v-model="form.response" required rows="4" :placeholder="form.action === 'message' ? 'Our pricing starts at $10/month...' : 'You are a sales agent discussing pricing...'"></textarea>
        </div>

        <footer>
          <button type="button" class="secondary" @click="showCreate = false">Cancel</button>
          <button type="submit" class="primary" :disabled="creating">{{ creating ? 'Saving...' : 'Create Rule' }}</button>
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
  margin-bottom: 12px;
}
.reply-trigger {
  display: flex;
  align-items: center;
  gap: 12px;
}
.keyword {
  font-weight: 700;
  font-size: 15px;
  color: var(--green-dark);
}
.match-badge {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  background: #f2f4f2;
  color: #53605a;
  padding: 2px 6px;
  border-radius: 4px;
}
.reply-action {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.action-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 6px;
  width: fit-content;
}
.action-badge.message {
  background: #eef4fc;
  color: #1a5c9f;
}
.action-badge.ai {
  background: #f2ebfc;
  color: #5b21b6;
}
.response-text {
  font-size: 13px;
  color: #53605a;
  background: #f8faf8;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid #e1e7e4;
  white-space: pre-wrap;
}
</style>

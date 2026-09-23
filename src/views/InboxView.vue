<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Search, ArrowLeft, CheckCheck, Check, Clock3, Send, RotateCcw, CircleCheck, WifiOff, X, AlertCircle, ImagePlus } from 'lucide-vue-next'
import { api, json } from '../api'
import type { Account, Conversation, Message, SlashCommand } from '../types'
import UiState from '../components/UiState.vue'
import popSoundUrl from '../google-pixel-popcorn-notification-sound.mp3'

const popSound = new Audio(popSoundUrl)

type Filter = 'attention' | 'all' | 'unread' | 'resolved'
const accounts = ref<Account[]>([]), conversations = ref<Conversation[]>([]), messages = ref<Message[]>([]), commands = ref<SlashCommand[]>([])
const accountFilter = ref(''), selected = ref<Conversation | null>(null), filter = ref<Filter>('attention'), query = ref('')
const loadingList = ref(true), loadingMessages = ref(false), error = ref(''), messageError = ref(''), draft = ref(''), sending = ref(false), wsOnline = ref(true)
const suggestionsOpen = ref(false), listTimer = ref<number>(), threadEl = ref<HTMLElement>(), fileInput = ref<HTMLInputElement>(), draftInput = ref<HTMLTextAreaElement>()
const attachment = ref<{ file: File; url: string } | null>(null)
let socket: WebSocket | null = null

function onGlobalKeydown(e: KeyboardEvent) {
  const isInputFocused = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
  if (e.key === 'Escape' && selected.value) {
    selected.value = null
    e.preventDefault()
  } else if (e.key === '/' && !isInputFocused) {
    if (draftInput.value) {
      draftInput.value.focus()
      e.preventDefault()
      draft.value = '/'
      onDraft()
    }
  }
}

const selectedAccount = computed(() => accounts.value.find(account => account.id === selected.value?.account_id))
const suggestions = computed(() => {
  const term = draft.value.startsWith('/') ? draft.value.slice(1).toLowerCase() : ''
  return commands.value.filter(c => c.name.replace(/^\//, '').toLowerCase().includes(term)).slice(0, 6)
})
const arrayOf = <T,>(value: T[] | Record<string, T[]> | null, key: string): T[] => Array.isArray(value) ? value : value?.[key] || []
const initials = (name: string) => name.split(/\s+/).map(v => v[0]).join('').slice(0, 2).toUpperCase()
const time = (value?: string) => value ? new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : ''
const accountName = (id: string) => accounts.value.find(account => account.id === id)?.name || 'Unknown session'
const isOutgoing = (message: Message) => message.sender === 'user' || message.direction === 'outgoing' || !!message.outgoing
const isVisualMedia = (message: Message) => message.media_type === 'image' || message.media_type === 'sticker'
function safeMediaUrl(value?: string) {
  if (!value) return ''
  if (value.startsWith('blob:')) return value
  try {
    const url = new URL(value, location.origin)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : ''
  } catch { return '' }
}

async function loadAccounts() {
  try {
    const result = await api<Account[] | { accounts: Account[] }>('/accounts')
    accounts.value = arrayOf(result, 'accounts')
    if (accountFilter.value && !accounts.value.some(account => account.id === accountFilter.value)) accountFilter.value = ''
  } catch (e) { error.value = (e as Error).message }
}
async function loadConversations() {
  loadingList.value = true; error.value = ''
  const params = new URLSearchParams({ filter: filter.value === 'attention' ? 'needs_attention' : filter.value })
  if (accountFilter.value) params.set('account_id', accountFilter.value)
  if (query.value.trim()) params.set('q', query.value.trim())
  try {
    const result = await api<Conversation[] | { conversations: Conversation[] }>(`/conversations?${params}`)
    conversations.value = arrayOf(result, 'conversations')
    if (selected.value) selected.value = conversations.value.find(c => c.id === selected.value?.id) || selected.value
  } catch (e) { error.value = (e as Error).message } finally { loadingList.value = false }
}
async function openConversation(conversation: Conversation) {
  selected.value = conversation; loadingMessages.value = true; messageError.value = ''
  try {
    const result = await api<Message[] | { messages: Message[] }>(`/conversations/${conversation.id}/messages`)
    messages.value.forEach(revokeMessagePreview)
    messages.value = arrayOf(result, 'messages')
    conversation.unread_count = 0
    await api(`/conversations/${conversation.id}/read`, { method: 'POST' })
    await scrollBottom()
  } catch (e) { messageError.value = (e as Error).message } finally { loadingMessages.value = false }
}
async function toggleResolved() {
  if (!selected.value) return
  const action = selected.value.status === 'resolved' ? 'reopen' : 'resolve'
  try {
    await api(`/conversations/${selected.value.id}/${action}`, { method: 'POST' })
    selected.value.status = action === 'resolve' ? 'resolved' : 'unresolved'
    await loadConversations()
  } catch (e) { messageError.value = (e as Error).message }
}
async function deleteChat() {
  if (!selected.value || !confirm('Are you sure you want to completely delete this chat? This cannot be undone.')) return
  const current = selected.value
  selected.value = null
  try { 
    await api(`/conversations/${current.id}`, { method: 'DELETE' }) 
    loadConversations()
  }
  catch (e) { alert(e instanceof Error ? e.message : 'Error deleting chat') }
}
async function deliver(message: Message) {
  if (!selected.value) return
  const conversationId = selected.value.id
  try {
    let sent: Message
    if (message.localFile) {
      const form = new FormData()
      form.append('file', message.localFile)
      if (message.body) form.append('caption', message.body)
      sent = await api<Message>(`/conversations/${conversationId}/media`, { method: 'POST', body: form })
    } else {
      sent = await api<Message>(`/conversations/${conversationId}/messages`, json({ body: message.body || '' }))
    }
    const previousId = message.id
    revokeMessagePreview(message)
    Object.assign(message, sent || {}, { status: sent?.status || 'sent', local: false, localFile: undefined })
    messages.value = messages.value.filter(candidate => candidate === message || (candidate.id !== message.id && candidate.id !== previousId))
    await Promise.all([syncThread(conversationId), loadConversations()]).catch(() => {})
  } catch (e) {
    message.status = 'failed'
    messageError.value = (e as Error).message
  } finally { sending.value = false }
}
async function syncThread(conversationId: string) {
  if (selected.value?.id !== conversationId) return
  const result = await api<Message[] | { messages: Message[] }>(`/conversations/${conversationId}/messages`)
  messages.value = arrayOf(result, 'messages')
  await scrollBottom()
}
async function send() {
  const body = draft.value.trim()
  if (!selected.value || (!body && !attachment.value) || sending.value) return
  const selectedAttachment = attachment.value
  const optimistic: Message = {
    id: `local-${Date.now()}`, body, sender: 'user', direction: 'outgoing', created_at: new Date().toISOString(),
    status: 'sending', local: true, media_type: selectedAttachment ? 'image' : undefined,
    media_url: selectedAttachment?.url, media_mime: selectedAttachment?.file.type, localFile: selectedAttachment?.file,
  }
  messages.value.push(optimistic)
  attachment.value = null; if (fileInput.value) fileInput.value.value = ''
  draft.value = ''; suggestionsOpen.value = false; sending.value = true; messageError.value = ''
  await scrollBottom(); await deliver(optimistic)
}
async function retry(message: Message) {
  if (sending.value) return
  message.status = 'sending'; sending.value = true; messageError.value = ''
  await deliver(message)
}
function chooseImage(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  setAttachment(file)
  if (!attachment.value) input.value = ''
}
function onPaste(event: ClipboardEvent) {
  const item = Array.from(event.clipboardData?.items || []).find(entry => entry.kind === 'file' && entry.type.startsWith('image/'))
  const file = item?.getAsFile()
  if (!file) return
  event.preventDefault()
  setAttachment(file)
}
function setAttachment(file: File) {
  if (!file.type.startsWith('image/')) { messageError.value = 'Choose a valid image file.'; return }
  if (file.size > 16 * 1024 * 1024) { messageError.value = 'Images must be 16 MiB or smaller.'; return }
  clearAttachment()
  attachment.value = { file, url: URL.createObjectURL(file) }
  messageError.value = ''
}
function clearAttachment() {
  if (attachment.value) URL.revokeObjectURL(attachment.value.url)
  attachment.value = null
  if (fileInput.value) fileInput.value.value = ''
}
function revokeMessagePreview(message: Message) {
  if (message.local && message.media_url?.startsWith('blob:')) URL.revokeObjectURL(message.media_url)
}
function receiveMessage(item: Message) {
  if (!item.id) return
  const existing = messages.value.find(message => message.id === item.id)
  if (existing) { Object.assign(existing, item); return }
  if (item.sender === 'user') {
    const pending = messages.value.find(message => message.local && message.status === 'sending' && message.body === item.body && message.media_type === item.media_type)
    if (pending) { revokeMessagePreview(pending); Object.assign(pending, item, { local: false, localFile: undefined }); return }
  }
  messages.value.push(item)
}
function insertCommand(command: SlashCommand) { draft.value = command.content || command.response || ''; suggestionsOpen.value = false }
function onDraft() { suggestionsOpen.value = draft.value.startsWith('/') }
async function scrollBottom() { await nextTick(); threadEl.value?.scrollTo({ top: threadEl.value.scrollHeight, behavior: 'smooth' }) }
function connectSocket() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  socket = new WebSocket(`${protocol}//${location.host}/api/ws`)
  socket.onopen = () => wsOnline.value = true
  socket.onclose = () => { wsOnline.value = false }
  socket.onerror = () => wsOnline.value = false
  socket.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data), item = payload.data || {}
      if (payload.type?.includes('account')) loadAccounts()
      else if (payload.type?.includes('message')) {
        if (item.sender === 'contact') {
          popSound.currentTime = 0
          popSound.play().catch(() => {})
        }
        if (selected.value && item.conversation_id === selected.value.id) {
          const incoming = item
          receiveMessage(incoming); scrollBottom()
        }
        loadConversations()
      }
    } catch { loadConversations() }
  }
}
watch([accountFilter, filter], () => { selected.value = null; loadConversations() })
watch(query, () => { clearTimeout(listTimer.value); listTimer.value = window.setTimeout(loadConversations, 300) })
onMounted(async () => {
  window.addEventListener('keydown', onGlobalKeydown)
  await Promise.all([loadAccounts(), api<SlashCommand[] | { commands: SlashCommand[] }>('/commands').then(r => commands.value = arrayOf(r, 'commands')).catch(() => {})])
  await loadConversations(); connectSocket()
})
onBeforeUnmount(() => { 
  window.removeEventListener('keydown', onGlobalKeydown)
  socket?.close(); clearTimeout(listTimer.value); clearAttachment(); messages.value.forEach(revokeMessagePreview) 
})
</script>

<template>
  <div class="inbox-layout" :class="{ 'thread-open': selected }">
    <section class="conversation-pane">
      <div class="inbox-head">
        <div><h1>Inbox</h1></div>
      </div>
      <div v-if="accounts.some(account => account.sync_limited)" class="sync-note"><AlertCircle /> Message history may be limited by your WhatsApp provider.</div>
      <label class="search"><Search /><input v-model="query" placeholder="Search conversations" /><button v-if="query" @click="query = ''"><X /></button></label>
      <div class="filter-row">
        <button v-for="item in ([['attention','Needs attention'],['all','All'],['unread','Unread'],['resolved','Resolved']] as const)" :key="item[0]" :class="{ active: filter === item[0] }" @click="filter = item[0]">{{ item[1] }}</button>
        <label class="account-filter"><span class="visually-hidden">Filter by WhatsApp account</span><select v-model="accountFilter"><option value="">All Accounts</option><option v-for="account in accounts" :key="account.id" :value="account.id">{{ account.name }}{{ account.phone ? ` · ${account.phone}` : '' }}</option></select></label>
      </div>
      <div class="connection-note" v-if="!wsOnline"><WifiOff /> Live updates paused. Reconnecting…</div>
      <div class="conversation-list">
        <UiState v-if="loadingList" type="loading" title="Loading conversations" />
        <UiState v-else-if="error" type="error" title="Could not load inbox" :text="error"><button class="secondary" @click="loadConversations">Try again</button></UiState>
        <UiState v-else-if="!accounts.length" title="No WhatsApp accounts" text="Ask an owner to connect an account." />
        <UiState v-else-if="!conversations.length" title="You're all caught up" :text="query ? 'No conversations match this search.' : 'There are no conversations in this view.'" />
        <button v-for="conversation in conversations" v-else :key="conversation.id" class="conversation-row" :class="{ active: selected?.id === conversation.id }" @click="openConversation(conversation)">
          <img v-if="conversation.contact_avatar_url" :src="conversation.contact_avatar_url" class="avatar" style="object-fit: cover;" />
          <span v-else class="avatar">{{ initials(conversation.contact_name || conversation.contact_phone || '?') }}</span>
          <span class="conversation-copy"><span><strong>{{ conversation.contact_name || conversation.contact_phone || 'Unknown contact' }}</strong><em>{{ accountName(conversation.account_id) }}</em><time>{{ time(conversation.last_message_at) }}</time></span><span><small>{{ conversation.last_message || 'No messages yet' }}</small><b v-if="conversation.unread_count">{{ conversation.unread_count }}</b><CircleCheck v-else-if="conversation.status === 'resolved'" class="resolved-mark" /></span></span>
        </button>
      </div>
    </section>
    <section class="thread-pane">
      <UiState v-if="!selected" title="Choose a conversation" text="Select a customer from the inbox to view messages and reply." />
      <template v-else>
        <header class="thread-head">
          <button class="icon-btn thread-back" aria-label="Back to inbox" @click="selected = null"><ArrowLeft /></button>
          <img v-if="selected.contact_avatar_url" :src="selected.contact_avatar_url" class="avatar" style="object-fit: cover;" />
          <span v-else class="avatar">{{ initials(selected.contact_name || selected.contact_phone || '?') }}</span>
          <div class="thread-contact"><strong>{{ selected.contact_name || selected.contact_phone }}</strong><small>{{ selected.contact_phone || 'Unknown number' }} - {{ selectedAccount?.name || 'Unknown session' }}</small></div>
          <div style="display: flex; gap: 8px;">
            <button class="resolve-btn" style="background: transparent; color: var(--red); border: 1px solid var(--red);" @click="deleteChat"><Trash2 /> Delete</button>
            <button class="resolve-btn" @click="toggleResolved"><RotateCcw v-if="selected.status === 'resolved'" /><CircleCheck v-else />{{ selected.status === 'resolved' ? 'Reopen' : 'Resolve' }}</button>
          </div>
        </header>
        <div ref="threadEl" class="messages">
          <div class="message-flow">
            <UiState v-if="loadingMessages" type="loading" title="Loading messages" />
            <UiState v-else-if="messageError && !messages.length" type="error" title="Messages unavailable" :text="messageError" />
            <UiState v-else-if="!messages.length" title="No messages yet" text="Start the conversation with a reply below." />
            <div v-for="message in messages" v-else :key="message.id" class="bubble" :class="{ outgoing: isOutgoing(message), 'has-media': isVisualMedia(message) && safeMediaUrl(message.media_url), sticker: message.media_type === 'sticker' }">
              <strong v-if="!isOutgoing(message) && message.sender_name" class="message-sender">{{ message.sender_name }}</strong>
              <img v-if="isVisualMedia(message) && safeMediaUrl(message.media_url)" class="message-image" :src="safeMediaUrl(message.media_url)" :alt="message.body || message.content || (message.media_type === 'sticker' ? 'Sticker' : 'Shared image')" />
              <span v-if="message.content || message.body" class="message-body">{{ message.content || message.body }}</span>
              <footer><time>{{ time(message.created_at || message.timestamp) }}</time><Clock3 v-if="message.status === 'sending'" /><CheckCheck v-else-if="message.status === 'read' || message.status === 'delivered'" /><Check v-else-if="message.status !== 'failed'" /><button v-else :disabled="sending" @click="retry(message)"><RotateCcw /> Retry</button></footer>
            </div>
          </div>
        </div>
        <div v-if="messageError && messages.length" class="composer-error">{{ messageError }} <button @click="messageError = ''"><X /></button></div>
        <form class="composer" @submit.prevent="send">
          <div class="composer-inner">
            <div v-if="suggestionsOpen && suggestions.length" class="slash-menu"><p>QUICK REPLIES</p><button v-for="command in suggestions" :key="command.id" type="button" @click="insertCommand(command)"><strong>/{{ command.name.replace(/^\//, '') }}</strong><span>{{ command.content || command.response }}</span></button></div>
            <div v-if="attachment" class="attachment-preview"><img :src="attachment.url" alt="Selected attachment preview" /><span><strong>{{ attachment.file.name }}</strong><small>{{ (attachment.file.size / 1024 / 1024).toFixed(1) }} MiB</small></span><button type="button" aria-label="Remove selected image" @click="clearAttachment"><X /></button></div>
            <input ref="fileInput" class="visually-hidden" type="file" accept="image/*" @change="chooseImage" />
            <button type="button" class="attach-btn" aria-label="Attach image" :disabled="sending" @click="fileInput?.click()"><ImagePlus /></button>
            <textarea ref="draftInput" v-model="draft" rows="1" placeholder="Type a message" @paste="onPaste" @input="onDraft" @keydown.enter.exact.prevent="send" />
            <button type="button" class="send-btn" :disabled="(!draft.trim() && !attachment) || sending" aria-label="Send message" @pointerdown.prevent="send" @click.prevent="send"><Send /></button>
          </div>
        </form>
      </template>
    </section>
  </div>
</template>


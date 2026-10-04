<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Search, ArrowLeft, CheckCheck, Check, Clock3, Send, RotateCcw, CircleCheck, WifiOff, X, AlertCircle, ImagePlus, Trash2, Paperclip, File as FileIcon, Edit, CheckSquare } from 'lucide-vue-next'
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
const isDragging = ref(false)
const attachments = ref<{ file: File; url: string }[]>([])
const lightboxImages = ref<string[]>([])
const lightboxIndex = ref(0)
let socket: WebSocket | null = null

function openLightbox(urls: string[], index: number = 0) {
  if (selectionMode.value) return
  lightboxImages.value = urls
  lightboxIndex.value = index
}
function closeLightbox() {
  lightboxImages.value = []
}
function nextLightbox() {
  if (lightboxIndex.value < lightboxImages.value.length - 1) lightboxIndex.value++
}
function prevLightbox() {
  if (lightboxIndex.value > 0) lightboxIndex.value--
}
function onGlobalKeydown(e: KeyboardEvent) {
  const isInputFocused = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
  if (e.key === 'Escape' && lightboxImages.value.length) {
    closeLightbox()
    e.preventDefault()
  } else if (e.key === 'ArrowRight' && lightboxImages.value.length && !isInputFocused) {
    nextLightbox()
    e.preventDefault()
  } else if (e.key === 'ArrowLeft' && lightboxImages.value.length && !isInputFocused) {
    prevLightbox()
    e.preventDefault()
  } else if (e.key === 'Escape' && selected.value) {
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
const formatDateSeparator = (value?: string) => {
  if (!value) return ''
  const d = new Date(value)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' }).format(d)
}
const diffDays = (d1?: string, d2?: string) => !d1 || !d2 || new Date(d1).toDateString() !== new Date(d2).toDateString()
const accountName = (id: string) => accounts.value.find(account => account.id === id)?.name || 'Unknown session'
const isOutgoing = (message: Message) => message.sender === 'user' || message.direction === 'outgoing' || !!message.outgoing
const isVisualMedia = (message: Message) => message.media_type === 'image' || message.media_type === 'sticker'

const messageGroups = computed(() => {
  const groups: { id: string, type: 'single' | 'album', messages: Message[], sender: string | undefined, outgoing: boolean }[] = []
  for (const msg of messages.value) {
    const isImage = isVisualMedia(msg) && safeMediaUrl(msg.media_url)
    const outgoing = isOutgoing(msg)
    const last = groups[groups.length - 1]
    
    // In WhatsApp, albums are grouped if consecutive images from the same sender. Stickers are NOT grouped.
    let shouldGroup = false
    if (isImage && msg.media_type !== 'sticker' && last && last.type === 'album' && last.sender === msg.sender && last.outgoing === outgoing) {
      const msgTime = new Date(msg.created_at || msg.timestamp || Date.now()).getTime()
      const lastMsg = last.messages[last.messages.length - 1]
      const lastTime = new Date(lastMsg.created_at || lastMsg.timestamp || Date.now()).getTime()
      if (Math.abs(msgTime - lastTime) < 120000) {
        shouldGroup = true
      }
    }
    
    if (shouldGroup) {
      last.messages.push(msg)
    } else {
      groups.push({
        id: msg.id,
        type: (isImage && msg.media_type !== 'sticker') ? 'album' : 'single',
        messages: [msg],
        sender: msg.sender,
        outgoing
      })
    }
  }
  return groups
})
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
  if (!selected.value || (!body && !attachments.value.length) || sending.value) return
  
  const optimistics: Message[] = []
  
  for (let i = 0; i < attachments.value.length; i++) {
    const attachment = attachments.value[i]
    optimistics.push({
      id: `local-${Date.now()}-${Math.random()}`,
      body: i === attachments.value.length - 1 ? body : '',
      sender: 'user', direction: 'outgoing', created_at: new Date().toISOString(),
      status: 'sending', local: true, media_type: attachment.file.type.startsWith('image/') ? 'image' : 'document',
      media_url: attachment.url, media_mime: attachment.file.type, media_name: attachment.file.name, localFile: attachment.file,
    })
  }
  
  if (!attachments.value.length && body) {
    optimistics.push({
      id: `local-${Date.now()}-${Math.random()}`, body, sender: 'user', direction: 'outgoing', created_at: new Date().toISOString(),
      status: 'sending', local: true,
    })
  }
  
  messages.value.push(...optimistics)
  attachments.value = []; if (fileInput.value) fileInput.value.value = ''
  draft.value = ''; suggestionsOpen.value = false; sending.value = true; messageError.value = ''
  await scrollBottom()
  
  for (const msg of optimistics) {
    await deliver(msg)
  }
  sending.value = false
}
async function retry(message: Message) {
  if (sending.value) return
  message.status = 'sending'; sending.value = true; messageError.value = ''
  await deliver(message)
  sending.value = false
}
function chooseImage(event: Event) {
  const input = event.target as HTMLInputElement
  const files = input.files
  if (!files) return
  for (let i = 0; i < files.length; i++) addAttachment(files[i])
  input.value = ''
}
function onPaste(event: ClipboardEvent) {
  const items = Array.from(event.clipboardData?.items || []).filter(entry => entry.kind === 'file')
  if (!items.length) return
  event.preventDefault()
  for (const item of items) {
    const file = item.getAsFile()
    if (file) addAttachment(file)
  }
}
function onDragOver(e: DragEvent) {
  e.preventDefault()
  isDragging.value = true
}
function onDragLeave(e: DragEvent) {
  e.preventDefault()
  isDragging.value = false
}
function onDrop(e: DragEvent) {
  e.preventDefault()
  isDragging.value = false
  if (e.dataTransfer?.files) {
    for (let i = 0; i < e.dataTransfer.files.length; i++) {
      addAttachment(e.dataTransfer.files[i])
    }
  }
}

// Splitter logic
const splitterWidth = ref(350)
let startX = 0
let startWidth = 0
function startSplitterDrag(e: PointerEvent) {
  startX = e.clientX
  startWidth = splitterWidth.value
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  window.addEventListener('pointermove', onSplitterMove)
  window.addEventListener('pointerup', onSplitterUp)
}
function onSplitterMove(e: PointerEvent) {
  const dx = e.clientX - startX
  splitterWidth.value = Math.max(200, Math.min(800, startWidth + dx))
}
function onSplitterUp() {
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  window.removeEventListener('pointermove', onSplitterMove)
  window.removeEventListener('pointerup', onSplitterUp)
}

// Context menu logic
const contextMenu = ref<{ x: number, y: number, message: Message } | null>(null)
const selectedMessages = ref<Set<string>>(new Set())
const selectionMode = ref(false)

function openMessageMenu(e: MouseEvent, msg: Message) {
  contextMenu.value = { x: e.clientX, y: e.clientY, message: msg }
  window.addEventListener('click', closeMenu)
}
function closeMenu() {
  contextMenu.value = null
  window.removeEventListener('click', closeMenu)
}

async function deleteSelected() {
  if (!selected.value || selectedMessages.value.size === 0) return
  const toDelete = Array.from(selectedMessages.value)
  const convId = selected.value.id
  
  for (const msgId of toDelete) {
    try {
      await api(`/conversations/${convId}/messages/${msgId}`, { method: 'DELETE' })
      messages.value = messages.value.filter(m => m.id !== msgId)
    } catch (e) {
      console.error('Failed to delete message', e)
    }
  }
  
  selectedMessages.value.clear()
  selectionMode.value = false
}

async function deleteMessage(msg: Message) {
  if (!selected.value) return
  try {
    await api(`/conversations/${selected.value.id}/messages/${msg.id}`, { method: 'DELETE' })
    messages.value = messages.value.filter(m => m.id !== msg.id)
  } catch (e) {
    console.error('Failed to delete message', e)
  }
}

function toggleSelection(msg: Message) {
  if (selectedMessages.value.has(msg.id)) {
    selectedMessages.value.delete(msg.id)
    if (selectedMessages.value.size === 0) selectionMode.value = false
  } else {
    selectedMessages.value.add(msg.id)
  }
}

function addAttachment(file: File) {
  if (file.size > 100 * 1024 * 1024) { messageError.value = 'Files must be 100 MiB or smaller.'; return }
  attachments.value.push({ file, url: URL.createObjectURL(file) })
  messageError.value = ''
}
function clearAttachment(index?: number) {
  if (index !== undefined) {
    const att = attachments.value[index]
    if (att) URL.revokeObjectURL(att.url)
    attachments.value.splice(index, 1)
  } else {
    attachments.value.forEach(a => URL.revokeObjectURL(a.url))
    attachments.value = []
  }
  if (fileInput.value && attachments.value.length === 0) fileInput.value.value = ''
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
  <div class="inbox-layout" :class="{ 'thread-open': selected }" style="display: flex;">
    <section class="conversation-pane" :style="{ flex: `0 0 ${splitterWidth}px` }">
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
    
    <div class="splitter" @pointerdown="startSplitterDrag" style="width: 4px; background: rgba(0,0,0,0.05); cursor: col-resize; z-index: 10; transition: background 0.2s;" onmouseover="this.style.background='rgba(0,0,0,0.1)'" onmouseout="this.style.background='rgba(0,0,0,0.05)'"></div>

    <section class="thread-pane" style="flex: 1; min-width: 0;">
      <UiState v-if="!selected" title="Choose a conversation" text="Select a customer from the inbox to view messages and reply." />
      <template v-else>
        <header class="thread-head">
          <button class="icon-btn thread-back" aria-label="Back to inbox" @click="selected = null"><ArrowLeft /></button>
          <img v-if="selected.contact_avatar_url" :src="selected.contact_avatar_url" class="avatar" style="object-fit: cover;" />
          <span v-else class="avatar">{{ initials(selected.contact_name || selected.contact_phone || '?') }}</span>
          <div class="thread-contact"><strong>{{ selected.contact_name || selected.contact_phone }}</strong><small>{{ selected.contact_phone || 'Unknown number' }} - {{ selectedAccount?.name || 'Unknown session' }}</small></div>
          <div v-if="selectionMode" style="display: flex; gap: 8px; align-items: center;">
            <span style="font-weight: 600;">{{ selectedMessages.size }} selected</span>
            <button class="resolve-btn" style="background: transparent; color: var(--red); border: 1px solid var(--red);" @click="deleteSelected" :disabled="selectedMessages.size === 0"><Trash2 /> Delete</button>
            <button class="resolve-btn" @click="selectionMode = false; selectedMessages.clear()">Cancel</button>
          </div>
          <div v-else style="display: flex; gap: 8px;">
            <button class="resolve-btn" style="background: transparent; color: var(--red); border: 1px solid var(--red);" @click="deleteChat"><Trash2 /> Delete</button>
            <button class="resolve-btn" @click="toggleResolved"><RotateCcw v-if="selected.status === 'resolved'" /><CircleCheck v-else />{{ selected.status === 'resolved' ? 'Reopen' : 'Resolve' }}</button>
          </div>
        </header>
        
        <div v-if="contextMenu" :style="{ position: 'fixed', top: contextMenu.y + 'px', left: contextMenu.x + 'px', background: 'white', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', borderRadius: '8px', zIndex: 100, padding: '4px', transformOrigin: 'top left', animation: 'scale-in 0.15s ease-out' }">
          <button @click="deleteMessage(contextMenu.message)" style="display: flex; align-items: center; width: 100%; text-align: left; padding: 8px 12px; background: transparent; border: none; cursor: pointer; border-radius: 4px;" onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='transparent'"><Trash2 :size="16" style="margin-right: 8px; color: var(--red);" /> Delete Message</button>
          <button @click="() => {}" style="display: flex; align-items: center; width: 100%; text-align: left; padding: 8px 12px; background: transparent; border: none; cursor: pointer; border-radius: 4px;" onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='transparent'"><Edit :size="16" style="margin-right: 8px;" /> Edit Message</button>
          <button @click="selectionMode = true; selectedMessages.add(contextMenu.message.id)" style="display: flex; align-items: center; width: 100%; text-align: left; padding: 8px 12px; background: transparent; border: none; cursor: pointer; border-radius: 4px;" onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='transparent'"><CheckSquare :size="16" style="margin-right: 8px;" /> Select Message</button>
        </div>

        <div ref="threadEl" class="messages">
          <div class="message-flow">
            <UiState v-if="loadingMessages" type="loading" title="Loading messages" />
            <UiState v-else-if="messageError && !messages.length" type="error" title="Messages unavailable" :text="messageError" />
            <UiState v-else-if="!messages.length" title="No messages yet" text="Start the conversation with a reply below." />
            
            <template v-for="(group, index) in messageGroups" :key="group.id">
              <div v-if="index === 0 || diffDays(group.messages[0].created_at || group.messages[0].timestamp, messageGroups[index-1].messages[0].created_at || messageGroups[index-1].messages[0].timestamp)" style="width: 100%; text-align: center; margin: 16px 0; align-self: center;">
                <span style="background: rgba(0,0,0,0.05); padding: 4px 12px; border-radius: 12px; font-size: 11px; font-weight: 600; color: #555;">{{ formatDateSeparator(group.messages[0].created_at || group.messages[0].timestamp) }}</span>
              </div>
              
              <div :style="{ display: 'flex', alignItems: 'flex-end', gap: '8px', alignSelf: group.outgoing ? 'flex-end' : 'flex-start', flexDirection: group.outgoing ? 'row-reverse' : 'row', maxWidth: '100%' }">
              <input v-if="selectionMode" type="checkbox" :checked="selectedMessages.has(group.messages[0].id)" @change="toggleSelection(group.messages[0])" style="margin-bottom: 12px; width: 16px; height: 16px;" />
              
              <div class="bubble" :class="{ outgoing: group.outgoing, 'has-media': group.type === 'album' || (isVisualMedia(group.messages[0]) && safeMediaUrl(group.messages[0].media_url)), sticker: group.messages[0].media_type === 'sticker', 'grouped-next': (group.outgoing && messageGroups[index+1]?.outgoing) || (!group.outgoing && messageGroups[index+1]?.sender === group.sender), 'grouped-prev': (group.outgoing && messageGroups[index-1]?.outgoing) || (!group.outgoing && messageGroups[index-1]?.sender === group.sender), 'is-album': group.messages.length > 1 }" @contextmenu.prevent="openMessageMenu($event, group.messages[0])" @click="selectionMode ? toggleSelection(group.messages[0]) : null" :style="selectedMessages.has(group.messages[0].id) ? 'background: rgba(0, 168, 132, 0.2); cursor: pointer;' : (selectionMode ? 'cursor: pointer;' : '')">
              
              <div v-if="group.type === 'album' && group.messages.length > 1" class="album-grid" :class="{'grid-2': group.messages.length === 2, 'grid-3': group.messages.length === 3, 'grid-4': group.messages.length >= 4}">
                <img v-for="(msg, mIndex) in group.messages" :key="msg.id" class="message-image clickable-img" :src="safeMediaUrl(msg.media_url)" :alt="msg.body || msg.content || 'Shared image'" @click="openLightbox(group.messages.map(m => safeMediaUrl(m.media_url)), mIndex)" />
              </div>
              
              <img v-else-if="isVisualMedia(group.messages[0]) && safeMediaUrl(group.messages[0].media_url)" class="message-image" :class="{ 'clickable-img': true }" :src="safeMediaUrl(group.messages[0].media_url)" :alt="group.messages[0].body || group.messages[0].content || (group.messages[0].media_type === 'sticker' ? 'Sticker' : 'Shared image')" @click="openLightbox([safeMediaUrl(group.messages[0].media_url)])" />
              
              <a v-if="group.messages[0].media_type === 'document'" :href="safeMediaUrl(group.messages[0].media_url)" target="_blank" rel="noopener" class="file-attachment" style="display: flex; align-items: center; gap: 12px; background: rgba(0,0,0,0.05); padding: 10px; border-radius: 8px; text-decoration: none; color: inherit; margin-bottom: 4px;">
                <div style="flex-shrink: 0; width: 40px; height: 40px; background: #00a884; color: white; border-radius: 6px; display: flex; align-items: center; justify-content: center;">
                  <FileIcon :size="24" />
                </div>
                <div style="display: flex; flex-direction: column; overflow: hidden; max-width: calc(100% - 52px);">
                  <span style="font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 14px; line-height: 1.2;">{{ group.messages[0].media_name || 'Document' }}</span>
                  <span style="font-size: 12px; opacity: 0.6; margin-top: 4px; text-transform: uppercase;">{{ group.messages[0].media_name?.split('.').pop() || 'FILE' }}</span>
                </div>
              </a>
              <span v-if="group.messages[group.messages.length-1].content || group.messages[group.messages.length-1].body" class="message-body">{{ group.messages[group.messages.length-1].content || group.messages[group.messages.length-1].body }}</span>
              <footer>
                <time>{{ time(group.messages[group.messages.length-1].created_at || group.messages[group.messages.length-1].timestamp) }}</time>
                <template v-if="group.outgoing">
                  <Clock3 v-if="group.messages[group.messages.length-1].status === 'sending'" />
                  <CheckCheck v-else-if="group.messages[group.messages.length-1].status === 'read' || group.messages[group.messages.length-1].status === 'delivered'" />
                  <Check v-else-if="group.messages[group.messages.length-1].status !== 'failed'" />
                  <button v-else :disabled="sending" @click="retry(group.messages[group.messages.length-1])"><RotateCcw /> Retry</button>
                </template>
              </footer>
              </div>
            </div>
            </template>
          </div>
        </div>
        <div v-if="messageError && messages.length" class="composer-error">{{ messageError }} <button @click="messageError = ''"><X /></button></div>
        <form class="composer" @submit.prevent="send">
          <div class="composer-inner" @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop" :class="{ 'drag-over': isDragging }">
            <div v-if="suggestionsOpen && suggestions.length" class="slash-menu"><p>QUICK REPLIES</p><button v-for="command in suggestions" :key="command.id" type="button" @click="insertCommand(command)"><strong>/{{ command.name.replace(/^\//, '') }}</strong><span>{{ command.content || command.response }}</span></button></div>
            <div v-if="attachments.length" class="attachment-preview" style="display: flex; gap: 8px; flex-wrap: wrap;">
              <div v-for="(attachment, index) in attachments" :key="attachment.url" style="position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px;">
                <img v-if="attachment.file.type.startsWith('image/')" :src="attachment.url" alt="Selected image preview" style="width: 64px; height: 64px; object-fit: cover; border-radius: 8px;" />
                <div v-else style="width: 64px; height: 64px; background: #eee; border-radius: 8px; display: flex; align-items: center; justify-content: center;"><FileIcon /></div>
                <span style="font-size: 10px; max-width: 64px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"><strong>{{ attachment.file.name }}</strong><br/><small>{{ (attachment.file.size / 1024 / 1024).toFixed(1) }} MiB</small></span>
                <button type="button" aria-label="Remove attachment" @click="clearAttachment(index)" style="position: absolute; top: -8px; right: -8px; background: white; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.1); padding: 2px;"><X :size="14" /></button>
              </div>
            </div>
            <input ref="fileInput" class="visually-hidden" type="file" multiple @change="chooseImage" />
            <button type="button" class="attach-btn" aria-label="Attach file" :disabled="sending" @click="fileInput?.click()"><Paperclip /></button>
            <textarea ref="draftInput" v-model="draft" rows="1" placeholder="Type a message" @paste="onPaste" @input="onDraft" @keydown.enter.exact.prevent="send" />
            <button type="button" class="send-btn" :disabled="(!draft.trim() && !attachments.length) || sending" aria-label="Send message" @pointerdown.prevent="send" @click.prevent="send"><Send /></button>
          </div>
        </form>
      </template>
    </section>
    <div v-if="lightboxImages.length > 0" class="lightbox-overlay" @click="closeLightbox">
      <button class="lightbox-close" aria-label="Close image"><X /></button>
      <button v-if="lightboxIndex > 0" class="lightbox-nav nav-prev" aria-label="Previous image" @click.stop="prevLightbox"><ArrowLeft /></button>
      <img :src="lightboxImages[lightboxIndex]" class="lightbox-img" @click.stop />
      <button v-if="lightboxIndex < lightboxImages.length - 1" class="lightbox-nav nav-next" aria-label="Next image" @click.stop="nextLightbox"><ArrowLeft style="transform: rotate(180deg)" /></button>
      <div v-if="lightboxImages.length > 1" class="lightbox-counter">{{ lightboxIndex + 1 }} / {{ lightboxImages.length }}</div>
    </div>
  </div>
</template>

<style scoped>
@keyframes scale-in {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}
</style>


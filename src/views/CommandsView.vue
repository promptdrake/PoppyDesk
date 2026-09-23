<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { Plus, Pencil, Trash2, X, MessageSquareText } from 'lucide-vue-next'
import { api, json } from '../api'
import type { SlashCommand } from '../types'
import UiState from '../components/UiState.vue'

const commands = ref<SlashCommand[]>([]), loading = ref(true), error = ref(''), editing = ref<SlashCommand | null>(null), modal = ref(false), saving = ref(false)
const form = reactive({ name: '', content: '' })
const arrayOf = (v: SlashCommand[] | { commands: SlashCommand[] }) => Array.isArray(v) ? v : v.commands
async function load() { loading.value = true; try { commands.value = arrayOf(await api('/commands')) } catch (e) { error.value = (e as Error).message } finally { loading.value = false } }
function open(command?: SlashCommand) { editing.value = command || null; form.name = command?.name.replace(/^\//, '') || ''; form.content = command?.content || command?.response || ''; modal.value = true }
async function save() { saving.value = true; error.value = ''; try { const path = editing.value ? `/commands/${editing.value.id}` : '/commands'; await api(path, json({ name: form.name.replace(/^\//, ''), content: form.content }, editing.value ? 'PUT' : 'POST')); modal.value = false; await load() } catch (e) { error.value = (e as Error).message } finally { saving.value = false } }
async function remove(command: SlashCommand) { if (!confirm(`Delete /${command.name.replace(/^\//, '')}?`)) return; try { await api(`/commands/${command.id}`, { method: 'DELETE' }); await load() } catch (e) { error.value = (e as Error).message } }
onMounted(load)
</script>
<template><div class="page content-page"><header class="page-title"><div><p class="eyebrow">PERSONAL TOOLKIT</p><h1>Quick replies</h1><p>Save answers you use often, then insert them by typing <code>/</code>.</p></div><button class="primary" @click="open()"><Plus /> New reply</button></header>
  <div v-if="error" class="alert error">{{ error }}<button @click="error = ''"><X /></button></div><UiState v-if="loading" type="loading" title="Loading quick replies"/><UiState v-else-if="!commands.length" title="No quick replies yet" text="Create a reusable answer to speed up your next conversation."><button class="primary" @click="open()"><Plus /> Create reply</button></UiState>
  <div v-else class="command-list"><article v-for="command in commands" :key="command.id"><span class="command-icon"><MessageSquareText /></span><div><strong>/{{ command.name.replace(/^\//, '') }}</strong><p>{{ command.content || command.response }}</p></div><button class="icon-btn" @click="open(command)"><Pencil /></button><button class="icon-btn danger" @click="remove(command)"><Trash2 /></button></article></div>
  <div v-if="modal" class="modal-backdrop" @mousedown.self="modal = false"><form class="modal" @submit.prevent="save"><button type="button" class="modal-close" @click="modal = false"><X /></button><p class="eyebrow">{{ editing ? 'EDIT' : 'NEW' }} QUICK REPLY</p><h2>{{ editing ? 'Update reply' : 'Create quick reply' }}</h2><label>Command name<div class="prefixed-input"><span>/</span><input v-model="form.name" required pattern="[A-Za-z0-9_-]+" placeholder="welcome" /></div></label><label>Reply text<textarea v-model="form.content" required rows="6" placeholder="Hello! Thanks for reaching out…" /></label><p class="field-hint">The message remains editable before you send it.</p><button class="primary wide" :disabled="saving">{{ saving ? 'Saving…' : 'Save quick reply' }}</button></form></div>
</div></template>

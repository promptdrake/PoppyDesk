<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Trash2, Users, X } from 'lucide-vue-next'
import { api } from '../api'
import type { Employee } from '../types'
import UiState from '../components/UiState.vue'

const employees = ref<Employee[]>([]), loading = ref(true), error = ref('')
const arrayOf = (v: Employee[] | { employees: Employee[] }) => Array.isArray(v) ? v : v.employees
async function load() { try { employees.value = arrayOf(await api('/employees')) } catch (e) { error.value = (e as Error).message } finally { loading.value = false } }
async function remove(employee: Employee) { if (!confirm(`Remove ${employee.email} from this workspace?`)) return; try { await api(`/employees/${employee.id}`, { method: 'DELETE' }); await load() } catch (e) { error.value = (e as Error).message } }
onMounted(load)
</script>
<template><div class="page content-page"><header class="page-title"><div><p class="eyebrow">OWNER CONTROLS</p><h1>Team</h1><p>Manage who can access the shared inbox.</p></div></header><div v-if="error" class="alert error">{{ error }}<button @click="error = ''"><X /></button></div>
  <div class="settings-grid"><section class="panel"><header><span class="panel-icon"><Users /></span><div><h2>Employees</h2><p>People with access to the shared inbox. Invite them with the signup credential from Settings.</p></div></header><UiState v-if="loading" type="loading" title="Loading team"/><UiState v-else-if="!employees.length" title="No employees yet" text="Share the signup credential to invite teammates."/><div v-else class="employee-list"><div v-for="employee in employees" :key="employee.id"><span class="avatar">{{ (employee.name || employee.email).slice(0,2).toUpperCase() }}</span><span><strong>{{ employee.name || employee.email.split('@')[0] }}</strong><small>{{ employee.email }}</small></span><button class="icon-btn danger" title="Remove employee" @click="remove(employee)"><Trash2 /></button></div></div></section></div>
</div></template>

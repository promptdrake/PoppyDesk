<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Trash2, Users, X, UserPlus, Save } from 'lucide-vue-next'
import { api } from '../api'
import type { Employee } from '../types'
import UiState from '../components/UiState.vue'

const employees = ref<Employee[]>([]), loading = ref(true), error = ref('')
const arrayOf = (v: Employee[] | { employees: Employee[] }) => Array.isArray(v) ? v : v.employees
const form = ref({ name: '', email: '', password: '' }), creating = ref(false), showCreate = ref(false)

async function load() { try { employees.value = arrayOf(await api('/employees')) } catch (e) { error.value = (e as Error).message } finally { loading.value = false } }
async function remove(employee: Employee) { if (!confirm(`Remove ${employee.email} from this workspace?`)) return; try { await api(`/employees/${employee.id}`, { method: 'DELETE' }); await load() } catch (e) { error.value = (e as Error).message } }
async function createEmployee() {
  if (!form.value.email || form.value.password.length < 8) return;
  creating.value = true; error.value = ''
  try { await api('/employees', { method: 'POST', body: JSON.stringify(form.value) }); showCreate.value = false; form.value = { name: '', email: '', password: '' }; await load() }
  catch (e) { error.value = (e as Error).message } finally { creating.value = false }
}
onMounted(load)
</script>
<template><div class="page content-page"><header class="page-title"><div><p class="eyebrow">OWNER CONTROLS</p><h1>Team</h1><p>Manage who can access the shared inbox.</p></div>
<div class="actions"><button class="primary" @click="showCreate = true"><UserPlus /> Add Employee</button></div>
</header><div v-if="error" class="alert error">{{ error }}<button @click="error = ''"><X /></button></div>
  <div class="settings-grid"><section class="panel"><header><span class="panel-icon"><Users /></span><div><h2>Employees</h2><p>People with access to the shared inbox. You can also invite them with the signup credential from Settings.</p></div></header><UiState v-if="loading" type="loading" title="Loading team"/><UiState v-else-if="!employees.length" title="No employees yet" text="Create an employee or share the signup credential to invite teammates."/><div v-else class="employee-list"><div v-for="employee in employees" :key="employee.id"><span class="avatar">{{ (employee.name || employee.email).slice(0,2).toUpperCase() }}</span><span><strong>{{ employee.name || employee.email.split('@')[0] }}</strong><small>{{ employee.email }}</small></span><button class="icon-btn danger" title="Remove employee" @click="remove(employee)"><Trash2 /></button></div></div></section></div>
</div>
<div v-if="showCreate" class="modal-backdrop" @click.self="showCreate = false">
  <div class="modal panel">
    <header><h2>Add Employee</h2><button class="icon-btn" @click="showCreate = false"><X /></button></header>
    <form class="settings-form" @submit.prevent="createEmployee">
      <div class="field"><label>Name</label><input type="text" v-model="form.name" placeholder="John Doe" /></div>
      <div class="field"><label>Email</label><input type="email" v-model="form.email" required placeholder="john@example.com" /></div>
      <div class="field"><label>Password</label><input type="password" v-model="form.password" required minlength="8" placeholder="At least 8 characters" /></div>
      <footer>
        <button type="button" class="secondary" @click="showCreate = false">Cancel</button>
        <button type="submit" class="primary" :disabled="creating"><Save /> {{ creating ? 'Saving...' : 'Save Employee' }}</button>
      </footer>
    </form>
  </div>
</div>
</template>

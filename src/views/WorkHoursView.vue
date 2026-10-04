<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Save, Clock } from 'lucide-vue-next'
import { api } from '../api'

const form = ref({
  enabled: false,
  schedule: '{"monday":{"open":"09:00","close":"17:00"},"tuesday":{"open":"09:00","close":"17:00"},"wednesday":{"open":"09:00","close":"17:00"},"thursday":{"open":"09:00","close":"17:00"},"friday":{"open":"09:00","close":"17:00"},"saturday":{"open":"09:00","close":"17:00"},"sunday":{"open":"09:00","close":"17:00"}}',
  action: 'message',
  closed_message: 'We are currently closed.'
})

const scheduleObj = ref<Record<string, {open: string, close: string}>>({})
const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

const saving = ref(false), message = ref(''), error = ref('')

async function load() {
  try {
    const res: any = await api('/settings')
    form.value = {
      enabled: res.work_hours.enabled,
      schedule: res.work_hours.schedule,
      action: res.work_hours.action,
      closed_message: res.work_hours.closed_message
    }
    try {
      scheduleObj.value = JSON.parse(form.value.schedule)
    } catch {
      scheduleObj.value = {}
    }
    for (const d of days) {
      if (!scheduleObj.value[d]) scheduleObj.value[d] = {open: '09:00', close: '17:00'}
    }
  } catch (e) {
    error.value = (e as Error).message
  }
}

async function save() {
  saving.value = true; error.value = ''; message.value = ''
  form.value.schedule = JSON.stringify(scheduleObj.value)
  try {
    await api('/settings/work_hours', {
      method: 'PUT',
      body: JSON.stringify(form.value)
    })
    message.value = 'Work hours saved successfully.'
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
<div class="page content-page">
  <header class="page-title">
    <div>
      <p class="eyebrow">SETTINGS</p>
      <h1>Work Hours</h1>
      <p>Configure automatic replies when you're away.</p>
    </div>
  </header>

  <section class="panel">
    <header>
      <span class="panel-icon"><Clock /></span>
        <div>
          <h2>Schedule</h2>
          <p>Set your business hours. Outside these times, auto-replies will trigger.</p>
        </div>
      </header>

      <form class="settings-form" @submit.prevent="save">
        <div class="field" style="display: flex; align-items: center; gap: 12px; margin-bottom: 24px;">
          <label class="toggle-switch">
            <input type="checkbox" v-model="form.enabled" />
            <span class="toggle-slider"></span>
          </label>
          <span style="font-weight: 600; font-size: 14px;">Enable Work Hours auto-responder</span>
        </div>

        <template v-if="form.enabled">
          <div class="schedule-grid" style="display: grid; gap: 10px; margin-bottom: 20px; max-width: 500px;">
            <div v-for="day in days" :key="day" class="schedule-day-row">
              <span style="text-transform: capitalize; font-weight: bold;">{{ day }}</span>
              <input type="time" v-model="scheduleObj[day].open" />
              <input type="time" v-model="scheduleObj[day].close" />
            </div>
          </div>

          <div class="field">
            <label>Action when closed</label>
            <select v-model="form.action">
              <option value="message">Send Static Message</option>
              <option value="ai">AI Auto-Responder</option>
            </select>
          </div>

          <div class="field" v-if="form.action === 'message'">
            <label>Closed Message</label>
            <textarea v-model="form.closed_message" rows="3" placeholder="We are currently closed..."></textarea>
          </div>
        </template>

        <footer>
          <span class="status-msg success" v-if="message">{{ message }}</span>
          <span class="status-msg error" v-if="error">{{ error }}</span>
          <button type="submit" class="primary" :disabled="saving">
            <Save /> {{ saving ? 'Saving...' : 'Save Settings' }}
          </button>
        </footer>
      </form>
    </section>
</div>
</template>

<style scoped>
.schedule-day-row {
  display: grid;
  grid-template-columns: 100px 1fr 1fr;
  gap: 10px;
  align-items: center;
}
@media (max-width: 600px) {
  .schedule-day-row {
    grid-template-columns: 1fr;
    gap: 6px;
    margin-bottom: 12px;
  }
}
</style>

<script setup lang="ts">
import { LoaderCircle, Inbox, TriangleAlert } from 'lucide-vue-next'
defineProps<{ type?: 'loading' | 'empty' | 'error'; title: string; text?: string }>()
</script>
<template>
  <div class="ui-state">
    <LoaderCircle v-if="type === 'loading'" class="spin" />
    <TriangleAlert v-else-if="type === 'error'" />
    <Inbox v-else />
    <strong>{{ title }}</strong><p v-if="text">{{ text }}</p><slot />
  </div>
</template>

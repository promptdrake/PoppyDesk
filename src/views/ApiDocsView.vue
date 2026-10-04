<script setup lang="ts">
import { Code, Key } from 'lucide-vue-next'
</script>

<template>
<div class="page content-page">
  <header class="page-title">
    <div>
      <p class="eyebrow">DEVELOPER</p>
      <h1>API Documentation</h1>
      <p>How to interact with Poppy Desk programmatically.</p>
    </div>
    <div class="actions">
      <button class="secondary" @click="$router.push('/settings/api-keys')"><Key /> Manage API Keys</button>
    </div>
  </header>

  <section class="panel">
    <header>
      <span class="panel-icon"><Code /></span>
      <div>
        <h2>Authentication</h2>
        <p>All API requests require an API key passed in the Authorization header.</p>
      </div>
    </header>
    <div style="padding: 20px;">
      <p style="margin-bottom: 12px;">Include your API key as a Bearer token:</p>
      <div class="code-block">
        <code>Authorization: Bearer YOUR_API_KEY</code>
      </div>
    </div>
  </section>

  <section class="panel" style="margin-top: 24px;">
    <header>
      <span class="panel-icon"><Code /></span>
      <div>
        <h2>Endpoints</h2>
        <p>Depending on your API Key's scope, you can access these endpoints.</p>
      </div>
    </header>
    
    <div class="endpoint">
      <h3>1. Get All Accounts (Channels)</h3>
      <p class="scope-req">Requires Scope: <strong>Full Access</strong> OR <strong>Manage Connected Apps Only</strong></p>
      <div class="code-block">
        <code>curl -X GET http://localhost:18080/api/accounts \
  -H "Authorization: Bearer YOUR_API_KEY"</code>
      </div>
    </div>

    <div class="endpoint">
      <h3>2. Send a Message</h3>
      <p class="scope-req">Requires Scope: <strong>Full Access</strong></p>
      <div class="code-block">
        <code>curl -X POST http://localhost:18080/api/conversations/CONVERSATION_ID/messages \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"body": "Hello from the API!"}'</code>
      </div>
    </div>

  </section>
</div>
</template>

<style scoped>
.code-block {
  background: #111827;
  color: #e5e7eb;
  padding: 16px;
  border-radius: 8px;
  font-family: monospace;
  font-size: 13px;
  white-space: pre-wrap;
  overflow-x: auto;
}
.endpoint {
  padding: 20px;
  border-bottom: 1px solid var(--border);
}
.endpoint:last-child {
  border-bottom: none;
}
.endpoint h3 {
  font-size: 16px;
  margin-bottom: 4px;
}
.scope-req {
  font-size: 13px;
  color: var(--muted);
  margin-bottom: 12px;
}
</style>

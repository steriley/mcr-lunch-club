<script setup lang="ts">
import { ref } from 'vue';
import ConfirmDialog from './ConfirmDialog.vue';
import { apiFetch, type ApiFetchOptions } from '@/lib/api-fetch';
import type { SerializedContactMessage } from '@/lib/contact-inbox';
import { CONTACT_TOPIC_LABELS, type ContactStatus } from '@/lib/contact-schema';
import { formatDateTime } from '@/lib/dates';

/**
 * The Chairs' contact inbox (#132). A message is a stranger's text: it is shown with text
 * interpolation only (never v-html, never turned into links), so nothing in it can be clicked.
 * The one link is the Chairs' own reply link to the sender's address.
 */
const props = defineProps<{
  messages: SerializedContactMessage[];
  view: 'inbox' | 'handled';
}>();

const rows = ref<SerializedContactMessage[]>(props.messages.map((row) => ({ ...row })));
const busy = ref<Record<string, boolean>>({});
const pendingDelete = ref<SerializedContactMessage | null>(null);
const notice = ref('');
const errorMessage = ref('');

/** The address is validated on the way in; encoding each half keeps it a plain mailto: link. */
function replyHref(row: SerializedContactMessage): string {
  const address = row.email.split('@').map(encodeURIComponent).join('@');
  const subject = encodeURIComponent('Re: your message to the MCR Lunch Club');
  return `mailto:${address}?subject=${subject}`;
}

async function run(row: SerializedContactMessage, options: ApiFetchOptions): Promise<boolean> {
  notice.value = '';
  errorMessage.value = '';
  busy.value[row.id] = true;
  const result = await apiFetch(`/api/admin/contact/${row.id}`, options);
  busy.value[row.id] = false;
  if (!result.ok) errorMessage.value = result.error;
  return result.ok;
}

async function setStatus(row: SerializedContactMessage, status: ContactStatus) {
  const ok = await run(row, {
    method: 'PATCH',
    body: { status },
    fallback: 'Could not update the message.',
  });
  if (!ok) return;
  const leavesView = props.view === 'handled' ? status !== 'handled' : status === 'handled';
  if (leavesView) {
    rows.value = rows.value.filter((item) => item.id !== row.id);
    notice.value =
      status === 'handled'
        ? `Message from ${row.name} marked handled.`
        : `Message from ${row.name} moved back to the inbox.`;
  } else {
    row.status = status;
  }
}

/** Replying counts as reading it. The mail client opens whatever happens here. */
function onReply(row: SerializedContactMessage) {
  if (row.status === 'new') void setStatus(row, 'read');
}

async function performDelete() {
  const row = pendingDelete.value;
  pendingDelete.value = null;
  if (!row) return;
  if (!(await run(row, { method: 'DELETE', fallback: 'Could not delete the message.' }))) return;
  rows.value = rows.value.filter((item) => item.id !== row.id);
  notice.value = 'Message deleted.';
}
</script>

<template>
  <div class="space-y-4">
    <p
      v-if="notice"
      role="status"
      class="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
    >
      {{ notice }}
    </p>
    <p
      v-if="errorMessage"
      role="alert"
      class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {{ errorMessage }}
    </p>

    <p
      v-if="!rows.length"
      class="rounded-2xl border border-hairline bg-parchment px-4 py-10 text-center text-sm text-soot"
    >
      {{ view === 'handled' ? 'Nothing handled yet.' : 'Nothing here. The post tray is empty.' }}
    </p>

    <ul v-else class="space-y-4">
      <li
        v-for="row in rows"
        :key="row.id"
        class="rounded-2xl border bg-parchment p-5 shadow-sm"
        :class="row.status === 'new' ? 'border-navy' : 'border-hairline'"
        data-contact-message
      >
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div class="min-w-0">
            <p class="text-xs font-bold uppercase tracking-[0.14em] text-ochre">
              {{ CONTACT_TOPIC_LABELS[row.topic] }}
              <span
                v-if="row.status === 'new'"
                class="ml-2 rounded-full bg-navy-fixed px-2 py-0.5 text-[10px] tracking-[0.1em] text-white"
                >New</span
              >
            </p>
            <h2 class="mt-1 break-words text-xl font-bold text-ink">{{ row.name }}</h2>
            <p class="mt-1 break-all text-sm text-soot">{{ row.email }}</p>
            <p class="mt-1 text-xs text-graphite">{{ formatDateTime(row.createdAt) }}</p>
          </div>
          <div class="flex shrink-0 flex-wrap gap-2">
            <a
              :href="replyHref(row)"
              class="inline-flex min-h-11 items-center rounded-lg bg-navy-fixed px-3 text-xs font-semibold text-white hover:bg-deep"
              @click="onReply(row)"
            >
              Reply by email
            </a>
            <button
              v-if="row.status === 'new'"
              type="button"
              class="min-h-11 rounded-lg border border-hairline bg-surface px-3 text-xs font-semibold text-ink hover:bg-linen disabled:opacity-60"
              :disabled="busy[row.id]"
              @click="setStatus(row, 'read')"
            >
              Mark read
            </button>
            <button
              v-if="row.status !== 'handled'"
              type="button"
              class="min-h-11 rounded-lg border border-hairline bg-surface px-3 text-xs font-semibold text-ink hover:bg-linen disabled:opacity-60"
              :disabled="busy[row.id]"
              @click="setStatus(row, 'handled')"
            >
              Mark handled
            </button>
            <button
              v-else
              type="button"
              class="min-h-11 rounded-lg border border-hairline bg-surface px-3 text-xs font-semibold text-ink hover:bg-linen disabled:opacity-60"
              :disabled="busy[row.id]"
              @click="setStatus(row, 'read')"
            >
              Back to inbox
            </button>
            <button
              type="button"
              class="min-h-11 rounded-lg bg-danger px-3 text-xs font-semibold text-white hover:bg-danger-strong disabled:opacity-60"
              :disabled="busy[row.id]"
              @click="pendingDelete = row"
            >
              Delete
            </button>
          </div>
        </div>

        <!-- Plain text only: interpolation escapes everything, and nothing is turned into a link. -->
        <!-- prettier-ignore -->
        <p class="mt-4 whitespace-pre-line break-words text-sm text-coal" data-contact-body>{{ row.message }}</p>
      </li>
    </ul>

    <ConfirmDialog
      :open="Boolean(pendingDelete)"
      title="Delete message"
      :message="`Delete the message from ${pendingDelete?.name || 'this sender'} permanently?`"
      confirm-label="Delete message"
      @cancel="pendingDelete = null"
      @confirm="performDelete"
    />
  </div>
</template>

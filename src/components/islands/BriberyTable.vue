<script setup lang="ts">
import { onMounted, ref } from 'vue';
import ConfirmDialog from './ConfirmDialog.vue';
import { formatDate } from '@/lib/dates';
import { apiFetch } from '@/lib/api-fetch';

interface RecordRow {
  id: string;
  title: string | null;
  venueNameText: string | null;
  incidentDate: string | null;
  description: string;
  published: boolean;
}

const props = defineProps<{ records: RecordRow[] }>();

const rows = ref<RecordRow[]>(props.records.map((record) => ({ ...record })));
const busy = ref<Record<string, boolean>>({});
const pendingDelete = ref<RecordRow | null>(null);
const message = ref('');
const errorMessage = ref('');

async function togglePublished(record: RecordRow) {
  message.value = '';
  errorMessage.value = '';
  busy.value[record.id] = true;
  const result = await apiFetch(`/api/admin/bribery/${record.id}`, {
    method: 'PATCH',
    body: { published: !record.published },
    fallback: 'Could not update the publish state.',
  });
  busy.value[record.id] = false;
  if (!result.ok) {
    errorMessage.value = result.error;
    return;
  }
  record.published = !record.published;
}

async function performDelete() {
  const record = pendingDelete.value;
  pendingDelete.value = null;
  if (!record) return;

  busy.value[record.id] = true;
  const result = await apiFetch(`/api/admin/bribery/${record.id}`, { method: 'DELETE', fallback: 'Could not delete the record.' });
  busy.value[record.id] = false;
  if (!result.ok) {
    errorMessage.value = result.error;
    return;
  }
  rows.value = rows.value.filter((row) => row.id !== record.id);
  message.value = 'Record deleted.';
}

onMounted(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('saved') === '1') message.value = 'Record saved.';
  if (params.get('deleted') === '1') message.value = 'Record deleted.';
});
</script>

<template>
  <div class="space-y-4">
    <p v-if="message" role="status" class="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ message }}</p>
    <p v-if="errorMessage" role="alert" class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{{ errorMessage }}</p>

    <div class="overflow-hidden rounded-2xl border border-hairline bg-parchment shadow-sm">
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-hairline text-left text-sm text-coal">
          <thead class="bg-card text-ink">
            <tr>
              <th scope="col" class="px-4 py-3 font-semibold">Incident</th>
              <th scope="col" class="px-4 py-3 font-semibold">Date</th>
              <th scope="col" class="px-4 py-3 font-semibold">Status</th>
              <th scope="col" class="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-sand">
            <tr v-if="!rows.length">
              <td colspan="4" class="px-4 py-10 text-center text-soot">No records yet. The Chairs remain incorruptible.</td>
            </tr>
            <tr v-for="record in rows" :key="record.id">
              <td class="max-w-md px-4 py-3">
                <a :href="`/admin/bribery/${record.id}`" class="font-semibold text-ink hover:underline">{{ record.title || 'Untitled incident' }}</a>
                <div class="truncate text-xs text-graphite">{{ record.venueNameText || record.description }}</div>
              </td>
              <td class="whitespace-nowrap px-4 py-3">{{ formatDate(record.incidentDate) }}</td>
              <td class="px-4 py-3">
                <span :class="['inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]', record.published ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-200 text-stone-700']">
                  {{ record.published ? 'Published' : 'Hidden' }}
                </span>
              </td>
              <td class="px-4 py-3">
                <div class="flex justify-end gap-2">
                  <a :href="`/admin/bribery/${record.id}`" class="rounded-lg border border-hairline bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:bg-linen">Edit</a>
                  <button type="button" class="rounded-lg border border-hairline bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:bg-linen disabled:opacity-60" :disabled="busy[record.id]" @click="togglePublished(record)">
                    {{ record.published ? 'Unpublish' : 'Publish' }}
                  </button>
                  <button type="button" class="rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-white hover:bg-danger-strong disabled:opacity-60" :disabled="busy[record.id]" @click="pendingDelete = record">
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <ConfirmDialog
      :open="Boolean(pendingDelete)"
      title="Delete record"
      :message="`Delete “${pendingDelete?.title || 'this record'}” permanently?`"
      confirm-label="Delete record"
      @cancel="pendingDelete = null"
      @confirm="performDelete"
    />
  </div>
</template>

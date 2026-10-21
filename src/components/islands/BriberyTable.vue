<script setup lang="ts">
import { onMounted, ref } from 'vue';
import ConfirmDialog from './ConfirmDialog.vue';
import { formatDate } from '@/lib/dates';

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
  try {
    const response = await fetch(`/api/admin/bribery/${record.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ published: !record.published }),
    });
    if (!response.ok) {
      errorMessage.value = 'Could not update the publish state.';
      return;
    }
    record.published = !record.published;
  } catch {
    errorMessage.value = 'Could not update the publish state.';
  } finally {
    busy.value[record.id] = false;
  }
}

async function performDelete() {
  const record = pendingDelete.value;
  pendingDelete.value = null;
  if (!record) return;

  busy.value[record.id] = true;
  try {
    const response = await fetch(`/api/admin/bribery/${record.id}`, { method: 'DELETE' });
    if (!response.ok) {
      errorMessage.value = 'Could not delete the record.';
      return;
    }
    rows.value = rows.value.filter((row) => row.id !== record.id);
    message.value = 'Record deleted.';
  } catch {
    errorMessage.value = 'Could not delete the record.';
  } finally {
    busy.value[record.id] = false;
  }
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

    <div class="overflow-hidden rounded-2xl border border-[#d9cfb8] bg-[#f9f7f1] shadow-sm">
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-[#d9cfb8] text-left text-sm text-[#2d2d2d]">
          <thead class="bg-[#f3ecdb] text-[#1a1e24]">
            <tr>
              <th scope="col" class="px-4 py-3 font-semibold">Incident</th>
              <th scope="col" class="px-4 py-3 font-semibold">Date</th>
              <th scope="col" class="px-4 py-3 font-semibold">Status</th>
              <th scope="col" class="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[#eadfca]">
            <tr v-if="!rows.length">
              <td colspan="4" class="px-4 py-10 text-center text-[#3d3d3d]">No records yet. The Chairs remain incorruptible.</td>
            </tr>
            <tr v-for="record in rows" :key="record.id">
              <td class="max-w-md px-4 py-3">
                <a :href="`/admin/bribery/${record.id}`" class="font-semibold text-[#1a1e24] hover:underline">{{ record.title || 'Untitled incident' }}</a>
                <div class="truncate text-xs text-[#535353]">{{ record.venueNameText || record.description }}</div>
              </td>
              <td class="whitespace-nowrap px-4 py-3">{{ formatDate(record.incidentDate) }}</td>
              <td class="px-4 py-3">
                <span :class="['inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]', record.published ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-200 text-stone-700']">
                  {{ record.published ? 'Published' : 'Hidden' }}
                </span>
              </td>
              <td class="px-4 py-3">
                <div class="flex justify-end gap-2">
                  <a :href="`/admin/bribery/${record.id}`" class="rounded-lg border border-[#d9cfb8] bg-white px-3 py-1.5 text-xs font-semibold text-[#1a1e24] hover:bg-[#f5efe5]">Edit</a>
                  <button type="button" class="rounded-lg border border-[#d9cfb8] bg-white px-3 py-1.5 text-xs font-semibold text-[#1a1e24] hover:bg-[#f5efe5] disabled:opacity-60" :disabled="busy[record.id]" @click="togglePublished(record)">
                    {{ record.published ? 'Unpublish' : 'Publish' }}
                  </button>
                  <button type="button" class="rounded-lg bg-[#B92B27] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#8e201d] disabled:opacity-60" :disabled="busy[record.id]" @click="pendingDelete = record">
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

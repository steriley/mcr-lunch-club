<script setup lang="ts">
import { ref } from 'vue';
import ConfirmDialog from './ConfirmDialog.vue';

const props = defineProps<{
  records: Array<{
    id: string;
    venueId: string | null;
    venueNameText: string | null;
    incidentDate: string | null;
    description: string;
    outcome: string | null;
    published: boolean;
    updatedAt: string | null;
  }>;
}>();

const pendingDeleteId = ref<string | null>(null);
const isBusyId = ref<Record<string, boolean>>({});

async function togglePublished(id: string, published: boolean) {
  isBusyId.value[id] = true;

  try {
    const response = await fetch(`/api/admin/bribery/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ published: !published }),
    });

    if (!response.ok) {
      throw new Error('Could not update publish state');
    }

    window.location.reload();
  } finally {
    isBusyId.value[id] = false;
  }
}

function confirmDelete(id: string) {
  pendingDeleteId.value = id;
}

async function performDelete() {
  const id = pendingDeleteId.value;
  if (!id) return;

  isBusyId.value[id] = true;
  pendingDeleteId.value = null;

  try {
    const response = await fetch(`/api/admin/bribery/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error('Could not delete bribery record');
    }

    window.location.reload();
  } finally {
    isBusyId.value[id] = false;
  }
}
</script>

<template>
  <div class="overflow-hidden rounded-2xl border border-[#d9cfb8] bg-[#f9f7f1] shadow-sm">
    <div class="overflow-x-auto">
      <table class="min-w-full divide-y divide-[#d9cfb8] text-left text-sm text-[#2d2d2d]">
        <thead class="bg-[#f3ecdb] text-[#1a1e24]">
          <tr>
            <th class="px-4 py-3 font-semibold">Record</th>
            <th class="px-4 py-3 font-semibold">Date</th>
            <th class="px-4 py-3 font-semibold">Status</th>
            <th class="px-4 py-3 font-semibold text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[#eadfca]">
          <tr v-if="!records.length">
            <td colspan="4" class="px-4 py-10 text-center text-[#3d3d3d]">No bribery records match the current filters.</td>
          </tr>
          <tr v-for="record in records" :key="record.id">
            <td class="px-4 py-3">
              <div class="font-semibold text-[#1a1e24]">{{ record.venueNameText || 'Independent record' }}</div>
              <div class="max-w-lg text-xs text-[#535353] line-clamp-2">{{ record.description }}</div>
            </td>
            <td class="px-4 py-3 text-[#3d3d3d]">
              {{ record.incidentDate ? new Date(record.incidentDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—' }}
            </td>
            <td class="px-4 py-3">
              <span :class="['inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]', record.published ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-200 text-stone-700']">
                {{ record.published ? 'Published' : 'Draft' }}
              </span>
            </td>
            <td class="px-4 py-3">
              <div class="flex justify-end gap-2">
                <a :href="`/admin/bribery/${record.id}`" class="rounded-lg border border-[#d9cfb8] bg-white px-3 py-1.5 text-xs font-semibold text-[#1a1e24] hover:bg-[#f5efe5]">Edit</a>
                <button
                  type="button"
                  class="rounded-lg border border-[#d9cfb8] bg-white px-3 py-1.5 text-xs font-semibold text-[#1a1e24] hover:bg-[#f5efe5]"
                  @click="togglePublished(record.id, record.published)"
                  :disabled="isBusyId[record.id]"
                >
                  {{ record.published ? 'Hide' : 'Publish' }}
                </button>
                <button
                  type="button"
                  class="rounded-lg bg-[#B92B27] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#8e201d]"
                  @click="confirmDelete(record.id)"
                  :disabled="isBusyId[record.id]"
                >
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
    :open="Boolean(pendingDeleteId)"
    title="Delete bribery record"
    :message="'This will remove this record from the ledger entirely.'"
    confirm-label="Delete record"
    @cancel="pendingDeleteId = null"
    @confirm="performDelete"
  />
</template>

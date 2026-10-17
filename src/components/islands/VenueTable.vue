<script setup lang="ts">
import { ref } from 'vue';
import ConfirmDialog from './ConfirmDialog.vue';
import TierBadge from './TierBadge.vue';

const props = defineProps<{
  venues: Array<{
    id: string;
    name: string;
    slug: string;
    tier: string;
    published: boolean;
    address: string | null;
    updatedAt: string | null;
  }>;
}>();

const pendingDeleteId = ref<string | null>(null);
const isBusyId = ref<Record<string, boolean>>({});

async function togglePublished(id: string, published: boolean) {
  isBusyId.value[id] = true;

  try {
    const response = await fetch(`/api/admin/venues/${id}/${published ? 'unpublish' : 'publish'}`, {
      method: 'POST',
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
    const response = await fetch(`/api/admin/venues/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error('Could not delete venue');
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
            <th class="px-4 py-3 font-semibold">Venue</th>
            <th class="px-4 py-3 font-semibold">Tier</th>
            <th class="px-4 py-3 font-semibold">Status</th>
            <th class="px-4 py-3 font-semibold">Updated</th>
            <th class="px-4 py-3 font-semibold text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[#eadfca]">
          <tr v-if="!venues.length">
            <td colspan="5" class="px-4 py-10 text-center text-[#3d3d3d]">No venues match the current filters.</td>
          </tr>
          <tr v-for="venue in venues" :key="venue.id">
            <td class="px-4 py-3">
              <div class="font-semibold text-[#1a1e24]">{{ venue.name }}</div>
              <div class="text-xs text-[#535353]">{{ venue.slug }}</div>
            </td>
            <td class="px-4 py-3">
              <TierBadge :tier="venue.tier" />
            </td>
            <td class="px-4 py-3">
              <span :class="['inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]', venue.published ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-200 text-stone-700']">
                {{ venue.published ? 'Published' : 'Draft' }}
              </span>
            </td>
            <td class="px-4 py-3 text-[#3d3d3d]">
              {{ venue.updatedAt ? new Date(venue.updatedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—' }}
            </td>
            <td class="px-4 py-3">
              <div class="flex justify-end gap-2">
                <a :href="`/admin/venues/${venue.id}`" class="rounded-lg border border-[#d9cfb8] bg-white px-3 py-1.5 text-xs font-semibold text-[#1a1e24] hover:bg-[#f5efe5]">Edit</a>
                <button
                  type="button"
                  class="rounded-lg border border-[#d9cfb8] bg-white px-3 py-1.5 text-xs font-semibold text-[#1a1e24] hover:bg-[#f5efe5]"
                  @click="togglePublished(venue.id, venue.published)"
                  :disabled="isBusyId[venue.id]"
                >
                  {{ venue.published ? 'Unpublish' : 'Publish' }}
                </button>
                <button
                  type="button"
                  class="rounded-lg bg-[#B92B27] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#8e201d]"
                  @click="confirmDelete(venue.id)"
                  :disabled="isBusyId[venue.id]"
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
    title="Delete venue"
    :message="'This will remove the venue from the ledger entirely. This cannot be undone.'"
    confirm-label="Delete venue"
    @cancel="pendingDeleteId = null"
    @confirm="performDelete"
  />
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';
import PendingVenueCard from './PendingVenueCard.vue';
import { entryNeedsUser, type PendingEntry } from '@/lib/pending-docket';

/**
 * The Pending page's list: one card per venue with today's inspection to cosign and the verdict
 * motion to decide. Cards update in place, so the counts here follow what the Chair has signed.
 */
const props = defineProps<{
  entries: PendingEntry[];
  currentUserId: string;
  activeAdmins: number;
  today: string;
}>();

const needsMe = reactive(
  Object.fromEntries(
    props.entries.map((entry) => [entry.venueId, entryNeedsUser(entry, props.currentUserId)])
  )
);
const waitingForMe = computed(() => Object.values(needsMe).filter(Boolean).length);
</script>

<template>
  <div class="space-y-4">
    <p role="status" class="dossier-overline text-[var(--dossier-secondary)]" aria-live="polite">
      <template v-if="entries.length === 0">Nothing waiting for a second Chair.</template>
      <template v-else-if="waitingForMe === 0"
        >Nothing needs your signature. Anything left is waiting on another Chair.</template
      >
      <template v-else
        >{{ waitingForMe }} venue{{ waitingForMe === 1 ? '' : 's' }} need{{
          waitingForMe === 1 ? 's' : ''
        }}
        your signature</template
      >
    </p>
    <PendingVenueCard
      v-for="entry in entries"
      :key="entry.venueId"
      :entry="entry"
      :current-user-id="currentUserId"
      :active-admins="activeAdmins"
      :today="today"
      @needs-me="(value) => (needsMe[entry.venueId] = value)"
    />
  </div>
</template>

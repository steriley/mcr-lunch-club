<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import Icon from '@/components/Icon.vue';
import { apiFetch } from '@/lib/api-fetch';
import {
  CONTACT_LIMITS,
  CONTACT_RETENTION_DAYS,
  CONTACT_TOPIC_LABELS,
  CONTACT_TOPICS,
  contactInputSchema,
  type ContactTopic,
} from '@/lib/contact-schema';
import { useOnline } from '@/lib/pwa/useOnline';

/**
 * The public contact form (#132). The page is prerendered, so whether the form is open and its
 * time-trap token come from GET /api/contact when the island loads. The shared schema checks the
 * fields here first; POST /api/contact is the authority. Nothing is queued while offline.
 */

type Phase = 'loading' | 'ready' | 'disabled' | 'unavailable' | 'sent';
type Field = 'name' | 'email' | 'topic' | 'message';

const FIELD_ORDER: Field[] = ['name', 'email', 'topic', 'message'];
const FIELD_LABELS: Record<Field, string> = {
  name: 'Your name',
  email: 'Your email',
  topic: 'Topic',
  message: 'Message',
};
/** The server ignores a form sent within 3 seconds of opening; never let a person trip it. */
const MIN_FORM_MS = 3200;

const online = useOnline();

const phase = ref<Phase>('loading');
const formToken = ref('');
let tokenFetchedAt = 0;

const emptyForm = () => ({
  name: '',
  email: '',
  topic: 'general' as ContactTopic,
  message: '',
  website: '',
});
const form = reactive(emptyForm());
const errors = ref<Partial<Record<Field, string>>>({});
const formError = ref('');
const submitting = ref(false);

const summary = ref<HTMLElement | null>(null);
const sentHeading = ref<HTMLElement | null>(null);

const fieldErrors = computed(() =>
  FIELD_ORDER.filter((field) => errors.value[field]).map((field) => ({
    field,
    label: FIELD_LABELS[field],
    message: errors.value[field]!,
  }))
);
const showSummary = computed(() => Boolean(formError.value || fieldErrors.value.length));
const messageLength = computed(() => form.message.length);

async function loadForm() {
  const result = await apiFetch<{ enabled: boolean; formToken?: string }>('/api/contact', {
    fallback: 'The contact form could not be loaded.',
  });
  if (!result.ok) {
    phase.value = 'unavailable';
    return;
  }
  if (!result.data.enabled || !result.data.formToken) {
    phase.value = 'disabled';
    return;
  }
  formToken.value = result.data.formToken;
  tokenFetchedAt = Date.now();
  phase.value = 'ready';
}

onMounted(loadForm);

// Opened offline: load the form once the connection is back.
watch(online, (isOnline) => {
  if (isOnline && phase.value === 'unavailable') {
    phase.value = 'loading';
    void loadForm();
  }
});

function inputId(field: Field) {
  return `contact-${field}`;
}

function describedBy(field: Field, extra?: string) {
  const ids = [extra, errors.value[field] ? `${inputId(field)}-error` : null].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}

async function showErrors() {
  await nextTick();
  summary.value?.focus();
}

function focusField(field: Field) {
  document.getElementById(inputId(field))?.focus();
}

async function submit() {
  errors.value = {};
  formError.value = '';

  const checked = contactInputSchema.safeParse({ ...form, formToken: formToken.value });
  if (!checked.success) {
    const found: Partial<Record<Field, string>> = {};
    for (const issue of checked.error.issues) {
      const field = issue.path[0] as Field;
      if (FIELD_ORDER.includes(field)) found[field] ??= issue.message;
    }
    errors.value = found;
    if (!Object.keys(found).length) formError.value = 'Please check the form and try again.';
    await showErrors();
    return;
  }

  submitting.value = true;
  const wait = MIN_FORM_MS - (Date.now() - tokenFetchedAt);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));

  const result = await apiFetch('/api/contact', {
    method: 'POST',
    body: { ...form, formToken: formToken.value },
    fallback: 'Your message could not be sent. Please try again.',
    offline: 'Your message could not be sent. Check your connection and try again.',
  });
  submitting.value = false;

  if (!result.ok) {
    if (result.error.startsWith('The contact form is closed')) {
      phase.value = 'disabled';
      return;
    }
    const fields: Partial<Record<Field, string>> = {};
    for (const field of FIELD_ORDER) if (result.fields[field]) fields[field] = result.fields[field];
    errors.value = fields;
    formError.value = Object.keys(fields).length ? '' : result.error;
    // An expired form gets a fresh token, so sending again works without losing the message.
    if (result.error.includes('expired')) void refreshToken();
    await showErrors();
    return;
  }

  Object.assign(form, emptyForm());
  phase.value = 'sent';
  await nextTick();
  sentHeading.value?.focus();
}

async function refreshToken() {
  const result = await apiFetch<{ enabled: boolean; formToken?: string }>('/api/contact', {
    fallback: '',
  });
  if (result.ok && result.data.formToken) {
    formToken.value = result.data.formToken;
    tokenFetchedAt = Date.now();
  }
}

async function writeAnother() {
  phase.value = 'loading';
  await loadForm();
}
</script>

<template>
  <div class="contact-form font-sans text-ink">
    <!-- Sent -->
    <div v-if="phase === 'sent'" class="space-y-4 text-center" role="status">
      <Icon name="mail" class="icon-xl mx-auto text-navy" />
      <h2 ref="sentHeading" tabindex="-1" class="text-xl font-bold font-serif-header">
        Message received
      </h2>
      <p class="text-sm text-stone-700">
        Thank you. Your message is with the Chairs, who will reply by email if it calls for one.
        Replies are written between lunches and may take a while.
      </p>
      <button type="button" class="contact-secondary" @click="writeAnother">
        Write another message
      </button>
    </div>

    <!-- Switched off -->
    <div v-else-if="phase === 'disabled'" class="space-y-3" data-contact-disabled>
      <h2 class="text-lg font-bold font-serif-header">The post room is closed</h2>
      <p class="text-sm text-stone-700">
        The contact form is closed for now. Please try again later. If you want the Chairs to assess
        a venue, <a href="/#suggest-a-venue" class="underline">Suggest a Venue</a> still works, and
        many questions are already answered in the <a href="/faqs" class="underline">FAQs</a>.
      </p>
    </div>

    <!-- Could not load (offline or the server did not answer) -->
    <div v-else-if="phase === 'unavailable'" class="space-y-3" role="status">
      <h2 class="text-lg font-bold font-serif-header">
        {{ online ? 'The form could not be loaded' : 'You’re offline' }}
      </h2>
      <p class="text-sm text-stone-700">
        {{
          online
            ? 'Please reload the page to try again.'
            : 'The contact form needs a connection. It will load when you’re back online.'
        }}
      </p>
    </div>

    <!-- The form; shown while loading too, so the page doesn't jump, but it can't be sent yet. -->
    <form
      v-else
      novalidate
      class="space-y-4"
      aria-labelledby="contact-form-heading"
      @submit.prevent="submit"
    >
      <h2 id="contact-form-heading" class="sr-only">Write to the Chairs</h2>

      <div
        v-if="showSummary"
        ref="summary"
        tabindex="-1"
        role="alert"
        class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        data-contact-summary
      >
        <p class="font-semibold">{{ formError || 'Please correct the following:' }}</p>
        <ul v-if="fieldErrors.length" class="mt-1 list-disc pl-5">
          <li v-for="item in fieldErrors" :key="item.field">
            <a
              :href="`#${inputId(item.field)}`"
              class="underline"
              @click.prevent="focusField(item.field)"
              >{{ item.label }}: {{ item.message }}</a
            >
          </li>
        </ul>
      </div>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label :for="inputId('name')" class="contact-label">Your name</label>
          <input
            :id="inputId('name')"
            v-model="form.name"
            type="text"
            name="name"
            autocomplete="name"
            class="contact-input"
            :maxlength="CONTACT_LIMITS.name.max"
            :aria-invalid="Boolean(errors.name)"
            :aria-describedby="describedBy('name')"
            required
          />
          <p v-if="errors.name" :id="`${inputId('name')}-error`" class="contact-error">
            {{ errors.name }}
          </p>
        </div>

        <div>
          <label :for="inputId('email')" class="contact-label">Your email</label>
          <input
            :id="inputId('email')"
            v-model="form.email"
            type="email"
            name="email"
            autocomplete="email"
            inputmode="email"
            class="contact-input"
            :maxlength="CONTACT_LIMITS.email.max"
            :aria-invalid="Boolean(errors.email)"
            :aria-describedby="describedBy('email', 'contact-email-hint')"
            required
          />
          <p id="contact-email-hint" class="contact-hint">Only used to reply to you.</p>
          <p v-if="errors.email" :id="`${inputId('email')}-error`" class="contact-error">
            {{ errors.email }}
          </p>
        </div>
      </div>

      <div>
        <label :for="inputId('topic')" class="contact-label">Topic</label>
        <select
          :id="inputId('topic')"
          v-model="form.topic"
          name="topic"
          class="contact-input"
          :aria-invalid="Boolean(errors.topic)"
          :aria-describedby="describedBy('topic')"
        >
          <option v-for="topic in CONTACT_TOPICS" :key="topic" :value="topic">
            {{ CONTACT_TOPIC_LABELS[topic] }}
          </option>
        </select>
        <p v-if="errors.topic" :id="`${inputId('topic')}-error`" class="contact-error">
          {{ errors.topic }}
        </p>
      </div>

      <div>
        <label :for="inputId('message')" class="contact-label">Message</label>
        <textarea
          :id="inputId('message')"
          v-model="form.message"
          name="message"
          rows="7"
          class="contact-input"
          :maxlength="CONTACT_LIMITS.message.max"
          :aria-invalid="Boolean(errors.message)"
          :aria-describedby="describedBy('message', 'contact-message-hint')"
          required
        ></textarea>
        <p id="contact-message-hint" class="contact-hint flex justify-between gap-2">
          <span>Plain text. At most {{ CONTACT_LIMITS.urls }} links.</span>
          <span class="tabular-nums" aria-hidden="true"
            >{{ messageLength }} / {{ CONTACT_LIMITS.message.max }}</span
          >
        </p>
        <p v-if="errors.message" :id="`${inputId('message')}-error`" class="contact-error">
          {{ errors.message }}
        </p>
      </div>

      <!-- Honeypot: hidden from people and assistive tech. -->
      <div class="contact-honeypot" aria-hidden="true">
        <label for="contact-website">Website</label>
        <input
          id="contact-website"
          v-model="form.website"
          type="text"
          name="website"
          tabindex="-1"
          autocomplete="off"
        />
      </div>

      <div class="space-y-2">
        <button
          type="submit"
          class="contact-primary"
          :disabled="submitting || phase !== 'ready' || !online"
          data-contact-submit
        >
          {{ submitting ? 'Sending…' : phase === 'loading' ? 'Loading…' : 'Send to the Chairs' }}
        </button>
        <!-- Nothing is queued: the server limits messages per sender, which needs a live request. -->
        <p v-if="!online" class="contact-error text-center" role="status">
          You’re offline. Your message will still be here when you’re back.
        </p>
      </div>

      <p class="text-xs text-stone-600">
        <strong>Privacy:</strong> we store your name, email, topic and message so the Chairs can
        read and reply to it, and a scrambled form of your network address to stop floods. Nothing
        is published or shared, and messages are deleted after {{ CONTACT_RETENTION_DAYS }} days.
      </p>
    </form>
  </div>
</template>

<style scoped>
.contact-label {
  display: block;
  margin-bottom: 0.25rem;
  font-size: 0.875rem;
  font-weight: 600;
}

.contact-input {
  width: 100%;
  min-height: 44px;
  background-color: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: 0.375rem;
  padding: 0.5rem 0.625rem;
  font-size: 16px; /* 16px stops iOS Safari zooming into the field. */
}

.contact-input[aria-invalid='true'] {
  border-color: var(--color-danger);
}

.contact-hint {
  margin-top: 0.25rem;
  font-size: 0.75rem;
  color: var(--color-graphite);
}

.contact-error {
  margin-top: 0.25rem;
  font-size: 0.8125rem;
  color: var(--color-danger);
}

.contact-primary {
  width: 100%;
  min-height: 44px;
  border-radius: 0.5rem;
  background-color: var(--color-navy-fixed);
  color: var(--color-white);
  font-weight: 700;
  font-size: 0.9375rem;
  padding: 0.625rem 1rem;
  cursor: pointer;
}

.contact-primary:hover:not(:disabled) {
  background-color: var(--color-deep);
}

.contact-primary:disabled {
  opacity: 0.6;
  cursor: default;
}

.contact-secondary {
  min-height: 44px;
  border-radius: 0.5rem;
  border: 1px solid var(--color-hairline);
  background-color: var(--color-surface);
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 600;
}

/* Off-screen rather than display:none, which some bots skip. */
.contact-honeypot {
  position: absolute;
  left: -10000px;
  width: 1px;
  height: 1px;
  overflow: hidden;
}
</style>

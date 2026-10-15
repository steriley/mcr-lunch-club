<template>
  <aside class="manifesto-ribbon">
    <div class="manifesto-ribbon-inner">
      <div class="manifesto-ribbon-copy">
        <span class="manifesto-seal" aria-hidden="true">⚖</span>
        <span class="manifesto-ribbon-text">
          <span class="manifesto-ribbon-title">THE OFFICIAL MANIFESTO</span>
          <span class="manifesto-ribbon-creed">“We lunch with purpose. We judge with integrity. We return only where deserved.”</span>
        </span>
      </div>
      <div class="manifesto-ribbon-actions">
        <span class="manifesto-ribbon-note">Independent venues first · Two visits for approval</span>
        <button
          class="manifesto-expand"
          type="button"
          @click="isExpanded = !isExpanded"
          :aria-expanded="isExpanded"
        >
          {{ isExpanded ? 'Hide summary' : 'Quick read' }}
          <span aria-hidden="true">{{ isExpanded ? '−' : '+' }}</span>
        </button>
        <a class="manifesto-full-link" href="/manifesto">Read the full manifesto →</a>
      </div>
    </div>

    <div v-if="isExpanded" class="manifesto-drawer">
      <div class="manifesto-drawer-grid">
        <section>
          <span>01 · THE TWO-VISIT RULE</span>
          <p>Each venue must deliver satisfactory outcomes on at least two separate visits before it earns Approved status.</p>
        </section>
        <section>
          <span>02 · VALUE &amp; INDEPENDENCE</span>
          <p>We champion local character and judge every meal on quality, portion, and value—not price alone.</p>
        </section>
        <section>
          <span>03 · OUR JURISDICTION</span>
          <p>Central Manchester is our territory, with a 2.5-mile boundary from the Spinningfields base.</p>
        </section>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const isExpanded = ref(false);
</script>

<style>
.manifesto-ribbon {
  z-index: 30;
  border-bottom: 1px solid #D9CFB8;
  background: #F3ECDB;
  color: #1e1b17;
}

.manifesto-ribbon-inner {
  width: min(100% - 40px, 1440px);
  min-height: 38px;
  margin-inline: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.manifesto-ribbon-copy,
.manifesto-ribbon-actions {
  display: flex;
  align-items: center;
  gap: 11px;
}

.manifesto-seal {
  color: #8a5100;
  font-size: 16px;
}

.manifesto-ribbon-text {
  display: flex;
  align-items: center;
  gap: 8px;
}

.manifesto-ribbon-title,
.manifesto-ribbon-note {
  color: #8a5100;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .08em;
  white-space: nowrap;
}

.manifesto-ribbon-creed {
  color: #1B2F6B;
  font-size: 9px;
  font-weight: 600;
  white-space: nowrap;
}

.manifesto-ribbon-actions {
  gap: 8px;
}

.manifesto-expand,
.manifesto-full-link {
  padding: 5px 9px;
  border-radius: 5px;
  font-size: 9px;
  font-weight: 700;
  white-space: nowrap;
}

.manifesto-expand {
  border: 1px solid #D9CFB8;
  background: #FBF6EA;
  color: #454650;
}

.manifesto-expand:hover {
  background: white;
}

.manifesto-full-link {
  background: #1B2F6B;
  color: white;
  text-decoration: none;
}

.manifesto-full-link:hover {
  background: #111E47;
}

.manifesto-drawer {
  border-top: 1px solid #D9CFB8;
  background: #F7F0DF;
}

.manifesto-drawer-grid {
  width: min(100% - 40px, 1440px);
  margin-inline: auto;
  padding-block: 14px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.manifesto-drawer-grid section {
  padding: 12px;
  border: 1px solid #D9CFB8;
  border-radius: 7px;
  background: #FBF6EA;
}

.manifesto-drawer-grid section span {
  color: #8a5100;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .08em;
}

.manifesto-drawer-grid section p {
  margin: 6px 0 0;
  color: #454650;
  font-size: 11px;
  line-height: 1.55;
}

@media (max-width: 900px) {
  .manifesto-ribbon-inner {
    flex-wrap: wrap;
    padding-block: 7px;
  }

  .manifesto-ribbon-note,
  .manifesto-ribbon-creed {
    display: none;
  }
}

@media (max-width: 600px) {
  .manifesto-ribbon-inner,
  .manifesto-drawer-grid {
    width: min(100% - 24px, 1440px);
  }

  .manifesto-ribbon-inner {
    gap: 6px;
  }

  .manifesto-ribbon-copy,
  .manifesto-ribbon-actions {
    gap: 6px;
  }

  .manifesto-ribbon-title,
  .manifesto-expand,
  .manifesto-full-link {
    font-size: 8px;
  }

  .manifesto-drawer-grid {
    grid-template-columns: 1fr;
  }
}
</style>

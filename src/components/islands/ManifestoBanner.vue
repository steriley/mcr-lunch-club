<template>
  <aside class="bg-[#1a1e24] text-[#f9f7f1] border-b-2 border-[#c59b27] shadow-md transition-all">
    <!-- Compact Top Bar -->
    <div class="max-w-7xl mx-auto px-4 py-2.5 sm:py-3 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 font-serif-header">
      <div class="flex items-center gap-3">
        <span class="text-2xl sm:text-3xl select-none">⚖️</span>
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-[10px] uppercase tracking-widest text-[#c59b27] font-mono font-bold bg-[#c59b27]/20 border border-[#c59b27]/40 px-2 py-0.5 rounded">
              The Official Manifesto
            </span>
            <span class="text-stone-300 italic text-xs hidden sm:inline">
              “We lunch with purpose. We judge with integrity. We return only where deserved.”
            </span>
          </div>
          <p class="text-xs text-stone-300 font-sans mt-0.5 hidden md:block">
            <strong>Independent venues first.</strong> Two separate visits required for Approved status. Extravagance without merit will not pass inspection.
          </p>
        </div>
      </div>

      <div class="flex items-center gap-2 w-full md:w-auto justify-end text-xs">
        <button
          @click="isExpanded = !isExpanded"
          class="px-2.5 py-1.5 rounded-md bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-600 transition-colors flex items-center gap-1.5 cursor-pointer"
          :title="isExpanded ? 'Collapse Proclamation' : 'Expand Manifesto Summary'"
        >
          <span>{{ isExpanded ? "▲ Hide Summary" : "▼ Quick Read" }}</span>
        </button>

        <a
          href="/manifesto"
          class="px-3.5 py-1.5 rounded-md bg-[#8b1e22] hover:bg-[#a32429] text-white font-bold border border-[#c59b27]/60 shadow transition-colors flex items-center gap-1.5 whitespace-nowrap"
        >
          <span>📜</span>
          <span>The Full Manifesto</span>
          <span>→</span>
        </a>
      </div>
    </div>

    <!-- Expandable Proclamation Drawer -->
    <div
      v-if="isExpanded"
      class="border-t border-[#c59b27]/30 bg-[#14181d] px-4 py-5 animate-in slide-in-from-top-2 duration-200"
    >
      <div class="max-w-7xl mx-auto space-y-4 font-serif-header">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-sans text-stone-300">
          <!-- Article I & II -->
          <div class="bg-[#1e232b] p-4 rounded-xl border border-stone-700/60 space-y-2">
            <span class="text-[#c59b27] font-serif-header font-bold text-sm block">
              1. Independents & The Two-Visit Rule
            </span>
            <p class="text-stone-300 leading-relaxed">
              We are committed to independent venues first and foremost, championing originality and local character over large chains. No venue earns its place in the Lunch Club rotation lightly: each must be visited on at least two separate occasions with satisfactory outcomes on both. Consistency is king.
            </p>
          </div>

          <!-- Article III & Cost Key -->
          <div class="bg-[#1e232b] p-4 rounded-xl border border-stone-700/60 space-y-2">
            <span class="text-[#c59b27] font-serif-header font-bold text-sm block">
              2. Value as Principle & Cost Key
            </span>
            <p class="text-stone-300 leading-relaxed">
              Price range is always considered alongside quality and portion. Extravagance without merit will not pass inspection.
            </p>
            <div class="pt-1 border-t border-stone-700 text-[11px] font-mono space-y-1">
              <div><strong class="text-amber-200">£:</strong> under £10 (Everyday grab)</div>
              <div><strong class="text-amber-200">££:</strong> above £10 (Standard protocol)</div>
              <div><strong class="text-amber-200">£££:</strong> payday treat (Payday feast)</div>
            </div>
          </div>

          <!-- Article IV & V -->
          <div class="bg-[#1e232b] p-4 rounded-xl border border-stone-700/60 space-y-2">
            <span class="text-[#c59b27] font-serif-header font-bold text-sm block">
              3. 2.5-Mile Radius & Incorruptibility
            </span>
            <p class="text-stone-300 leading-relaxed">
              In Manchester city centre, no distance is too far for proper evaluation. Beyond the centre, noteworthy venues within a 2.5-mile radius may be inducted. Members must respect the impartial authority of the Chairs and refrain from attempting to unduly influence their verdicts.
            </p>
            <div class="pt-1 border-t border-stone-700 text-[11px]">
              <a href="/hall-of-shame" class="text-rose-400 hover:underline flex items-center gap-1">
                <span>🌹</span>
                <span>See the M&S Red Roses Bribery Attempt →</span>
              </a>
            </div>
          </div>
        </div>

        <div class="flex items-center justify-between pt-2 border-t border-stone-800 text-xs">
          <span class="italic text-stone-400 font-serif-header">
            “We lunch with purpose. We judge with integrity. We return only where deserved.”
          </span>
          <a href="/manifesto" class="text-[#c59b27] hover:underline font-bold font-serif-header">
            Read complete Constitutional Code & Codex of Tiers →
          </a>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const isExpanded = ref(false);
</script>

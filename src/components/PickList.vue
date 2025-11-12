<script setup>
import { onBeforeUnmount, watch } from 'vue';

const props = defineProps({
  items: {
    type: Array,
    default: () => [],
  },
  count: {
    type: Number,
    default: 0,
  },
  open: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['toggle', 'close', 'select', 'remove']);

function handleToggle() {
  emit('toggle');
}

function handleClose() {
  emit('close');
}

function handleOverlayClick() {
  handleClose();
}

function handleSelect(item) {
  emit('select', item);
}

function handleRemove(event, item) {
  event?.preventDefault?.();
  emit('remove', item);
}

function handleKeydown(event) {
  if (event?.key === 'Escape') {
    emit('close');
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (typeof window === 'undefined') return;
    window.removeEventListener('keydown', handleKeydown);
    if (isOpen) {
      window.addEventListener('keydown', handleKeydown);
    }
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  if (typeof window === 'undefined') return;
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div class="pick-list">
    <button
      class="pick-list__toggle"
      :class="{ 'pick-list__toggle--disabled': !props.count }"
      type="button"
      @click="handleToggle"
    >
      <span class="pick-list__toggle-label">Picks</span>
      <span v-if="props.count" class="pick-list__badge">{{ props.count }}</span>
    </button>

    <transition name="pick-list__overlay">
      <div
        v-if="props.open"
        class="pick-list__overlay"
        @click="handleOverlayClick"
      />
    </transition>

    <transition name="pick-list__panel">
      <aside v-if="props.open" class="pick-list__panel">
        <header class="pick-list__panel-header">
          <span class="pick-list__panel-title">Mis picks</span>
          <span class="pick-list__panel-count">{{ props.count }}</span>
          <button type="button" class="pick-list__close" @click="handleClose">×</button>
        </header>
        <ul class="pick-list__items">
          <li
            v-for="item in props.items"
            :key="item.id"
            class="pick-list__item"
            @click="handleSelect(item)"
            @contextmenu="handleRemove($event, item)"
          >
            <span class="pick-list__team">{{ item.teamCode }}</span>
            <span v-if="item.playerName" class="pick-list__player">{{ item.playerName }}</span>
            <span class="pick-list__market">{{ item.marketLabel }}</span>
            <span :class="['pick-list__value', item.valueClass]">{{ item.value }}</span>
            <span
              v-if="item.lastFiveText"
              :class="['pick-list__last-five', item.lastFiveClass]"
            >
              {{ item.lastFiveText }}
            </span>
          </li>
        </ul>
      </aside>
    </transition>
  </div>
</template>

<style scoped>
.pick-list {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 60;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 16px;
}

.pick-list__toggle {
  position: relative;
  width: 64px;
  height: 64px;
  border-radius: 16px;
  border: 1px solid rgba(56, 189, 248, 0.35);
  background: rgba(15, 23, 42, 0.85);
  color: #38bdf8;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 10px 24px rgba(2, 6, 23, 0.7);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.pick-list__toggle:hover {
  transform: translateY(-2px);
  box-shadow: 0 16px 32px rgba(2, 6, 23, 0.8);
}

.pick-list__toggle--disabled {
  cursor: default;
  opacity: 0.5;
}

.pick-list__toggle:focus-visible {
  outline: 2px solid rgba(56, 189, 248, 0.6);
  outline-offset: 4px;
}

.pick-list__toggle-label {
  pointer-events: none;
}

.pick-list__team {
  font-weight: 700;
  color: #facc15;
}

.pick-list__badge {
  position: absolute;
  top: -10px;
  right: -10px;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: #38bdf8;
  color: #0f172a;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 14px;
  box-shadow: 0 6px 12px rgba(56, 189, 248, 0.35);
}

.pick-list__overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(6px);
  pointer-events: auto;
  z-index: 40;
}

.pick-list__overlay-enter-active,
.pick-list__overlay-leave-active {
  transition: opacity 0.2s ease;
}

.pick-list__overlay-enter-from,
.pick-list__overlay-leave-to {
  opacity: 0;
}

.pick-list__panel {
  position: fixed;
  top: 72px;
  right: 24px;
  bottom: 24px;
  width: min(360px, 92vw);
  background: rgba(10, 14, 25, 0.96);
  border: 1px solid rgba(56, 189, 248, 0.25);
  box-shadow: -12px 0 32px rgba(2, 6, 23, 0.6);
  display: flex;
  flex-direction: column;
  padding: 20px 24px;
  overflow-y: auto;
  pointer-events: auto;
  z-index: 65;
}

.pick-list__panel-enter-active,
.pick-list__panel-leave-active {
  transition: transform 0.25s ease, opacity 0.2s ease;
}

.pick-list__panel-enter-from,
.pick-list__panel-leave-to {
  opacity: 0;
  transform: translateX(12px);
}

.pick-list__panel-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.pick-list__panel-title {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #38bdf8;
}

.pick-list__panel-count {
  font-size: 14px;
  font-weight: 600;
  color: #94a3b8;
}

.pick-list__close {
  margin-left: auto;
  border: none;
  background: transparent;
  color: #94a3b8;
  font-size: 26px;
  line-height: 1;
  cursor: pointer;
  transition: color 0.2s ease;
}

.pick-list__close:hover {
  color: #e2e8f0;
}

.pick-list__items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pick-list__item {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  font-size: 13px;
  color: #e2e8f0;
  padding: 10px 12px;
  border: 1px solid rgba(56, 189, 248, 0.12);
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.6);
  cursor: pointer;
  transition: border-color 0.2s ease, transform 0.2s ease;
}

.pick-list__item:hover {
  border-color: rgba(56, 189, 248, 0.3);
  transform: translateX(-2px);
}

.pick-list__player {
  font-weight: 600;
  color: #bae6fd;
}

.pick-list__market {
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #94a3b8;
}

.pick-list__value {
  font-weight: 700;
  color: #f1f5f9;
}

.pick-list__value--team {
  color: #facc15;
}

.pick-list__value--player {
  color: #f1f5f9;
}

.pick-list__last-five {
  font-size: 12px;
  font-weight: 600;
}

.pick-list__last-five--positive {
  color: #16a34a;
}

.pick-list__last-five--negative {
  color: #dc2626;
}

.pick-list__last-five--neutral {
  color: #94a3b8;
}

@media (max-width: 640px) {
  .pick-list__panel {
    width: 100%;
  }
}
</style>

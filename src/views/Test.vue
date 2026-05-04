<template>
  <div class="bg-[#0a1428] min-h-screen flex flex-col font-display text-slate-300">
    <header class="sticky top-0 z-50 bg-[#0a1428]/80 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-white/10">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-[#0a1428] font-bold text-xl">L</div>
        <div>
          <p class="text-xs text-slate-500 leading-none">Bienvenido,</p>
          <h1 class="font-bold text-base text-white">Juan Pérez</h1>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <button class="p-2 rounded-full bg-white/5 text-slate-400 hover:text-white transition-colors">
          <span class="material-symbols-outlined block">help</span>
        </button>
        <button class="p-2 rounded-full bg-white/5 text-slate-400 hover:text-white transition-colors">
          <span class="material-symbols-outlined block">person</span>
        </button>
      </div>
    </header>

    <main class="p-4 space-y-6 pb-28">
      <section class="grid grid-cols-2 gap-3">
        <div class="bg-[#121e36] p-4 rounded-xl border border-white/5 shadow-sm">
          <p class="text-xs font-medium text-slate-500">Crédito</p>
          <p class="text-lg font-bold text-primary">RD$ 500.00</p>
          <div class="mt-2 h-1 w-8 bg-primary/30 rounded-full"></div>
        </div>

        <div class="bg-[#121e36] p-4 rounded-xl border border-white/5 shadow-sm">
          <p class="text-xs font-medium text-slate-500">Premios Disponibles</p>
          <p class="text-lg font-bold text-emerald-400">RD$ 1,200.00</p>
          <div class="mt-2 h-1 w-8 bg-emerald-400/30 rounded-full"></div>
        </div>
      </section>

      <section>
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-lg font-bold text-white">Próximos Sorteos</h3>
          <a class="text-primary text-xs font-semibold" href="#">Ver todos</a>
        </div>

        <div class="flex gap-4 overflow-x-auto hide-scrollbar pb-2">
          <div class="min-w-[280px] bg-[#121e36] rounded-xl border border-white/5 p-4 shadow-sm relative overflow-hidden">
            <div class="absolute top-0 right-0 p-2">
              <span class="material-symbols-outlined text-slate-500 text-sm">info</span>
            </div>

            <div class="flex gap-3 items-center mb-3">
              <div class="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
                <span class="material-symbols-outlined">schedule</span>
              </div>
              <div>
                <h4 class="font-bold text-sm text-white">Quiniela Lotedom</h4>
                <p class="text-[10px] text-slate-500">Hoy, 6:00 PM</p>
              </div>
            </div>

            <div class="flex items-center justify-between">
              <span class="text-[10px] font-bold bg-primary/10 text-primary px-2 py-1 rounded-full">Inicia en 15 min</span>
              <button class="bg-primary text-[#0a1428] text-xs font-bold px-4 py-2 rounded-lg">Jugar ahora</button>
            </div>
          </div>
        </div>
      </section>
    </main>

    <nav class="fixed bottom-0 left-0 right-0 bg-[#0a1428]/95 backdrop-blur-lg border-t border-white/10 px-4 py-2 pb-6 flex justify-between items-center z-50">
      <a class="flex flex-col items-center gap-1 text-primary flex-1" href="#">
        <span class="material-symbols-outlined">home</span>
        <span class="text-[9px] font-medium">Inicio</span>
      </a>

      <a class="flex flex-col items-center gap-1 text-slate-400 flex-1" href="#">
        <span class="material-symbols-outlined">confirmation_number</span>
        <span class="text-[9px] font-medium">Tickets</span>
      </a>

      <div class="flex-1 flex justify-center -mt-8">
        <button class="w-14 h-14 bg-primary rounded-full flex items-center justify-center text-[#0a1428] shadow-lg shadow-primary/20 border-4 border-[#0a1428]">
          <span class="material-symbols-outlined text-3xl font-bold">casino</span>
        </button>
      </div>

      <a class="flex flex-col items-center gap-1 text-slate-400 flex-1" href="#">
        <span class="material-symbols-outlined">account_balance_wallet</span>
        <span class="text-[9px] font-medium">Recargar</span>
      </a>

      <a class="flex flex-col items-center gap-1 text-slate-400 flex-1" href="#">
        <span class="material-symbols-outlined">account_balance</span>
        <span class="text-[9px] font-medium">Retirar</span>
      </a>
    </nav>
  </div>
</template>

<script setup>
// aquí luego pones props, refs, computed, etc.
</script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}

.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.material-symbols-outlined {
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
}
</style>
<script setup>
import HelloWorld from './components/HelloWorld.vue'
</script>

<template>
  <!-- Barra fija superior -->
  <header class="sticky-bar">
    <div class="bar-inner">
      <nav class="app-nav">
        <RouterLink class="nav-link" to="/nba">NBA</RouterLink>
        <RouterLink class="nav-link" to="/nhl">NHL</RouterLink>
        <RouterLink class="nav-link" to="/nfl">NFL</RouterLink>
      </nav>
    </div>
  </header>
  <main>
    <RouterView />
  </main>
</template>

<style scoped>
.logo {
  height: 6em;
  padding: 1.5em;
  will-change: filter;
  transition: filter 300ms;
}
.logo:hover {
  filter: drop-shadow(0 0 2em #646cffaa);
}
.logo.vue:hover {
  filter: drop-shadow(0 0 2em #42b883aa);
}
/* Barra siempre arriba */
.sticky-bar{
  position: sticky;
  top: 0;
  z-index: 1000;
  width: 100%;
  background: #0b1220;                 /* igual al fondo del mockup */
  box-shadow: 0 6px 18px rgba(0,0,0,.35), inset 0 0 0 1px rgba(255,255,255,.02);
  backdrop-filter: blur(6px);
}

/* Contenedor centrado horizontalmente */
.bar-inner{
  max-width: 1100px;                   /* ajusta si quieres más/menos ancho */
  margin: 0 auto;
  padding: 10px 12px;
  display: flex;
  justify-content: center;             /* centra el nav */
}

/* Nav con paleta del mockup */
.app-nav{
  display: flex;
  gap: 8px;
  align-items: center;
  background: #0e1625;
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 12px;
  padding: 8px;
  box-shadow: 0 6px 18px rgba(0,0,0,.35), inset 0 0 0 1px rgba(255,255,255,.02);
}

/* Links */
.nav-link{
  position: relative;
  padding: 10px 14px;
  border-radius: 10px;
  text-decoration: none;
  color: #cfe6ff;                      /* texto base */
  font-weight: 700;
  letter-spacing: .4px;
  transition: color .15s ease, background .15s ease, transform .15s ease;
}

.nav-link:hover{
  background: rgba(34,211,238,.08);    /* cian suave */
  color: #eaffff;
}

/* Activo */
.nav-link.router-link-active,
.nav-link.router-link-exact-active{
  color: #22d3ee;
  text-shadow: 0 0 10px rgba(34,211,238,.35);
}
.nav-link.router-link-active::after,
.nav-link.router-link-exact-active::after{
  content: "";
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 6px;
  height: 2px;
  border-radius: 2px;
  background: linear-gradient(90deg, transparent, #22d3ee, transparent);
  box-shadow: 0 0 8px #22d3ee;
}

/* Foco accesible */
.nav-link:focus-visible{
  outline: none;
  box-shadow: 0 0 0 2px rgba(34,211,238,.45);
}
</style>

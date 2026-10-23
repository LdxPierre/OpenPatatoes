<template>
  <main class="not-found">
    <h1>Cette page n'existe pas</h1>
    <p>Vérifiez l'adresse, ou revenez à l'accueil.</p>
    <RouterLink to="/">
      Revenir à l'accueil
    </RouterLink>
  </main>
</template>

<style scoped>
.not-found {
  max-width: 40rem;
  margin: 0 auto;
  padding: var(--op-space-10) var(--op-space-6);
}

h1 {
  margin: 0 0 var(--op-space-2);
  font-size: var(--op-text-xl);
}

p {
  margin: 0 0 var(--op-space-4);
  color: var(--p-text-muted-color);
}

a {
  color: var(--p-primary-color);
  font-weight: 500;
}
</style>

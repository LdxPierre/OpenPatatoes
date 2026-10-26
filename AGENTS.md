# OpenPatatoes

Avant tout travail, lis [CONTRIBUTING.md](CONTRIBUTING.md) et suis sa méthode, étape par étape.

<!-- Le lien sert aux agents qui ne résolvent pas les imports ; l'import charge le fichier dans Claude Code. -->
@CONTRIBUTING.md

## Relecture par un sous-agent

À l'étape 4 de la méthode, un sous-agent relit le diff `origin/main...HEAD` avec le skill `code-review`.

## Lier une PR à son issue

Dans la description de la PR, écrivez `Closes #<numéro>` : GitHub ne reconnaît que ses mots-clés anglais (`Closes`, `Fixes`, `Resolves`) pour fermer l'issue au merge.

---
description: Exécute le pipeline complet Plan → Build → Review
agent: orchestrator
---

Exécute le pipeline complet pour cette feature :

1. **reasoner** — analyse le problème et produit un plan de correction
2. **coder** — implémente le plan
3. **reviewer** — review le code et valide
4. Corrige si le reviewer trouve des problèmes

Demande initiale : $ARGUMENTS

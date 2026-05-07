---
name: UPDATE condicional em conferência
description: Race-safe: UPDATE de etiquetas.status sempre filtra pelo status anterior esperado para evitar sobrescrita em bipes simultâneos
type: feature
---

Em ConferenciaInterna e ConferenciaExterna, o UPDATE de `etiquetas.status` deve sempre incluir `.eq("status", <status_anterior_esperado>)` e `.select().maybeSingle()`. Se vier `null`, outro operador já bipou — mostrar warning "Já conferida" sem erro.

- Interna: `pendente` → `conferido_interno`
- Externa: `conferido_interno` → `conferido`

Não remover esse filtro. Sem ele, bipes paralelos sobrescrevem timestamps/usuários.

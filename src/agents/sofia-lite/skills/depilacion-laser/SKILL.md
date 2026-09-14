---
name: depilacion-laser
description: >
  Información de depilación láser de Be Unique: tecnología, zonas, preparación,
  cuidados, seguridad, tarifario, paquetes, combos, planes y cotización. Usar
  cuando el usuario mencione láser, depilación, zonas, axilas, bikini, cotizar,
  sesiones 3/6/9 o mantenimiento.
metadata:
  author: be-unique
  version: "1.0"
---

# Depilación láser Be Unique

## Overview

Esta skill cubre depilación láser: información clínica, operativa y comercial.
No sustituye la valoración profesional.

## Instructions

1. Llama `load_skill` antes de responder sobre depilación láser.
2. Carga solo los recursos L3 necesarios con `load_skill_resource`:
   - **Tecnología y tipo de piel:** `references/tecnologia.md`
   - **Valoración, preparación, cuidados, contraindicaciones:**
3. **Algoritmo de cotización** (en este orden):
   1. Identifica las zonas solicitadas (aplica reglas de solapamiento anatómico
      en `estructura-comercial.md`).
   2. Comprueba si existe promoción aplicable (`promociones`: ACTIVA +
      Publicable = Sí + vigencia + sede/zona).
   3. Si hay promoción aplicable, aplica su regla; si no, usa tarifa regular.
   4. Usa **precio precomputado** del tarifario o combos cuando exista.
   5. Solo usa fórmulas generales si no hay precio precomputado.
   6. No acumules descuentos salvo condición expresa de la promoción.
   7. Redondea al múltiplo de 10 Bs más cercano (múltiplo superior en empate).
4. **Duración para agenda:** pasa `duration_minutes` = **Tiempo total** de la
   zona (no solo el tiempo de procedimiento). Valoración inicial ≈ 30 min.
5. **Reglas duras:**
   - Be Unique **no** realiza depilación láser en zona íntima masculina.
   - No se usa crema anestésica como protocolo habitual en láser.
   - No garantices eliminación del 100 % del vello.
   - No indiques suspender medicamentos prescritos; deriva dudas clínicas.
6. Si el cliente quiere agendar, usa las tools de agenda (Tiempo total / 30 min
   de valoración). Si la consulta requiere excepción o decisión clínica, usa
   `derivacion-equipo`.

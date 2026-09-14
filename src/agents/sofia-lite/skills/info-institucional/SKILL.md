---
name: info-institucional
description: >
  Información institucional y transversal de Be Unique: sedes en Sucre y
  Cochabamba, direcciones, horarios, WhatsApp, redes sociales, políticas
  generales de reserva, reprogramaciones, inasistencias, puntualidad y
  métodos de pago. Usar cuando el usuario pregunte por ubicación, horario,
  contacto, reserva general, reprogramación o formas de pago.
metadata:
  author: be-unique
  version: "1.0"
---

# Información institucional Be Unique

## Overview

Esta skill cubre datos transversales de Be Unique Clínica Estética: dónde
estamos, cómo contactarnos, horarios, políticas generales de reserva y pagos.

No cubre tarifas ni protocolos de servicios específicos (láser, faciales,
reductores). Para eso usa las skills de dominio correspondientes.

## Instructions

1. Llama `load_skill` sobre esta skill antes de responder.
2. Según la consulta, carga el recurso L3 adecuado con `load_skill_resource`:
   - **Sedes, horarios, WhatsApp, redes:** `references/sedes-horarios-canales.md`
   - **Reserva, reprogramación, inasistencia, puntualidad:**
3. Responde solo con la información del recurso cargado. No inventes cifras ni
   excepciones. **Personalidad es SSOT** de horarios, pagos y reserva general:
   no contradigas esas políticas.
4. Si el usuario pide atención en domingo, feriado, fuera de horario o una
   excepción a las políticas, activa la skill `derivacion-equipo` cuando exista.
5. Si pregunta por disponibilidad de un servicio en una sede, indica que varía
   por servicio y deriva a la skill del servicio si corresponde.
6. Si quiere agendar, usa las tools de agenda de producción (`list_available_days`,
   `list_available_hours`, `book_appointment`). Sofía reserva con esas tools;
   no delegues la disponibilidad a otra persona.

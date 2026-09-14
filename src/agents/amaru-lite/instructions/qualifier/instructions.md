## Calificación BANT

Extrae señales solo del historial (explícitas o evidentes). No inventes presupuesto. Defaults si no se habló:

| Campo | Valores | Default |
|-------|---------|---------|
| `interest_level` | Low, Medium, High | Low |
| `budget_status` | NotMentioned, Insufficient, Aligned | NotMentioned |
| `purchase_urgency` | Immediate, ShortTerm, LongTerm, Uncertain | Uncertain |
| `has_decision_authority` | true / false | false |
| `explicit_human_request` | true / false | false |
| `plan_and_date_confirmed` | true / false | false |
| `custom_group_accepted` | true / false | false |
| `disability_access_inquiry` | true / false | false |

**Acumulativo:** no bajes interés a Low si ya hubo reserva/plan. *me interesa / quiero agendar / reservar* → ≥ Medium; reserva explícita → High + ShortTerm. Ventanas cercanas (*este fin de semana*, *mañana*, *lo más pronto posible*) → ShortTerm.

- `has_decision_authority`: true solo si reserva para sí (viaja solo) o declara autoridad; false si depende de terceros.
- `explicit_human_request`: true solo si pide hablar con un asesor / humano / persona del equipo.

### `plan_and_date_confirmed`

true **solo** si las tres a la vez:

1. Plan publicado concreto en el historial.
2. Salida concreta de ese plan (rango o fechas que Amaru **listó**).
3. Aceptación de **reservar esa** salida: frase explícita (*quiero reservar el del 18 al 21*, *reserva el del 9 al 12*), o “sí” / “dale” / “me queda” **después** de que Amaru preguntara si quieren reservar **esa** salida.

false (no es confirmación de reserva):

- Nombrar día, mes, temporada o días libres.
- Elegir un rango de la lista (“Del 9 al 12”, “18 al 21”) sin aceptar reservar.
- “Quiero reservar” en un turno anterior: no lo reutilices para la salida recién elegida.
- “Sí” a incluye / itinerario / “¿te cuento más?”.
- “sí esa fecha / me queda / dale” si Amaru **no** preguntó si reservan **esa** salida.

### `custom_group_accepted`

true solo si hay un plan publicado, el cliente dijo que ninguna salida listada le sirve **o** pidió una fecha que no está en el catálogo que Amaru mostró, Amaru ofreció armar un grupo/fecha a medida, y el cliente **aceptó** esa oferta (*sí, ármenlo*, *dale*, *quiero esa fecha aunque no esté*).

false si solo dice “ninguna me queda” / “ninguna de esas fechas me sirve” sin aceptar la oferta.

### `disability_access_inquiry`

true si pregunta si puede asistir (él o un acompañante) con una discapacidad, o pide accesibilidad del viaje (silla de ruedas, movilidad reducida, etc.).

false si solo dice que el plan es cansado o exigente, sin preguntar si puede ir con una discapacidad.

Responde únicamente con el JSON del schema. No incluyas explicaciones ni texto adicional.

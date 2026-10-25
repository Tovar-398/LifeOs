# LifeOS — contexto para el agente

App personal de Eduardo: PWA instalable para gimnasio, nutrición y hábitos de salud.

**Alcance (desde oct 2026):** LifeOS es la app secundaria de gym y nutrición. Finanzas, tareas, ahorros, estudio y seguimiento diario viven en el asistente personal y su Centro de Control (Notion + dashboard). No volver a agregar esas áreas aquí.
Publicada con GitHub Pages y usada desde el celular como app instalada.

## Reglas importantes

1. **La única fuente de verdad es `src/LifeOS.jsx`.** Nunca edites `index.html` a mano: se genera.
2. Después de cualquier cambio: `npm run build` (compila `index.html` y sube la versión del service worker).
3. Antes de dar por terminado: `npm run check` debe pasar sin errores.
4. Haz commit y push a `main`. GitHub Pages republica solo en 1-2 minutos.
5. **Nunca borres ni renombres claves de datos guardados.** Los datos del usuario viven en el navegador de su celular; si cambias una clave, pierde su historial.

## Arquitectura

Un solo archivo React (`src/LifeOS.jsx`, sin router, sin librerías externas). Todo el estado vive en el componente `App` y se pasa a los módulos por un objeto `ctx`.

### Guardado
- `saveMain()` / `loadMain()`: guardan todo el estado en trozos de 1.8 KB (el puente de almacenamiento falla con valores grandes).
- Capa local (IndexedDB o localStorage) **siempre**, nube de Claude cuando está disponible.
- Guardado con debounce de 400 ms + guardado inmediato cuando la app pasa a segundo plano (`visibilitychange`).
- Al agregar un estado nuevo hay que tocar **5 lugares**: `useState`, la carga en `loadMain`, los 3 constructores de payload (`data`, `flushRef.current`, `exportData`), `importData`, y el objeto `ctx`.

### Pantallas (constante `MODS`, navegación inferior)
- `HoyModule` — agenda del día: próxima comida, entreno, comidas, hábitos de salud, check-in (sueño, energía, peso) y enlace al Centro de Control
- `CuerpoModule` — `GymEntrenar` / `GymHistorial` / `GymPlanes` / `HabHabitos` (hábitos de salud)
- `ComidasModule` — `CuerpoNutricion` (contador de macros) / `ShoppingList` / `PesoTab`

Retirados de la navegación en oct 2026 (el código y el estado siguen para no perder datos guardados): `FinModule`, `MasModule`, tareas, revisión semanal, perfil con nivel/XP/logros, Score de Vida, avisos de subida de nivel y la consulta de tipo de cambio/cripto.

### Datos sembrados
- `SEED_PLANS`: rutinas de gimnasio. **Para actualizar una rutina, sube su `seedV`**; al abrir la app reemplaza la versión vieja. Si no lo subes, no se actualiza.
- Rutina vigente (25 oct 2026): `900003` "Recomposición 4 días (L·M·J·V)", se activa sola la primera vez que aparece. Los planes pueden traer `info` (objetivo, horario, descanso activo, objetivos semanales) y `checks` (reglas de progresión que se palomean en cada sesión; se guardan en el borrador y en el log como `checks`). Las series de fuerza llevan RIR opcional (`rir`). `readyToAdd`: si la última vez llegaste al tope del rango en todas las series, avisa que subas peso. Se precargan `tSets` series.
- El historial de pesos se busca por nombre (`findLast` en `GymEntrenar`). Si renombras un ejercicio que ya tiene pesos, agrega `hist:"<nombre viejo>"`: la sesión se guarda y se busca con ese nombre, así no se pierde nada. Si no lo pones, el buscador de parecidos (`exScore`/`sameEx`: ignora acentos, plurales, sinónimos y veta polea↔mancuerna, inclinado↔plano, sentado↔de pie, "A o B" vs simple) intenta ligarlo, pero `hist` es lo seguro.
- Tipos de ejercicio (`exKind`): `cardio` (minutos + bpm, sin kg), `time` (segundos, p. ej. plancha/vacuum) y `lift` (kg × reps). Se deducen del nombre/`muscle`/`tReps`, o se fijan con `kind`. Los ejercicios con `block:"abs"` o `muscle:"Core"` se agrupan bajo "Bloque de abdomen". Las series de cardio/tiempo se guardan con `unit:"min"|"s"` en `reps` (y `bpm`), nunca en `weight`; `fmtSet` las muestra.
- Cada plan muestra su fecha de carga (`planLoadedAt`: `createdAt` al importar, `updated` en las oficiales, o el id si es marca de tiempo) y la etiqueta "MÁS RECIENTE" entre planes importados con los mismos días. Al subir `seedV`, actualiza también `updated`.
- `NUTRI_TARGET` y `NUTRI_MEALS`: plan de comidas con macros por comida (`kcal`, `p`, `c`, `f`). Los macros de cada comida deben ser la SUMA REAL de sus alimentos según `FOOD_DB` (carnes en peso cocido) y el día debe quedar a ±2% de la meta. Dieta vigente (25 oct 2026), meta 2,000 kcal · 160 P · 210 C · 60 G. La grasa se alterna por día con `menuKeyFor(fecha)`: A = día de aguacate (100 g, Lun·Mié·Vie·Dom, ~2,042 · 171 · 219 · 56) y B = día de crema de cacahuate (30 g, Mar·Jue·Sáb, ~2,064 · 175 · 218 · 57). `food.menu` ya no se usa.
- `SHOP_BASE`: básicos de la lista de compras, acordes a la dieta vigente.
- Nutrición: `NUTRI_MENUS` (A y B, mismos ids `n1`–`n4`, horas y macros; `NUTRI_MEALS` = menú A, lo usa Hoy). `FOOD_DB` = alimentos con macros por 100 g (`pz`/`taza` = gramos por pieza/taza) y `parseFoodText` entiende "2 tortillas y 150 g de pollo". `nutriCoach` da qué falta/sobra, proyección del día y recortes concretos (`NUTRI_CUTS`) sin tocar la proteína.
- Registro de comidas en el estado `food` = `{days:{fecha:[{id,t,meal,name,src,kcal,p,c,f}]},menu}`. `nutriLog[fecha][nX]` sigue siendo la palomita de cada comida (Hoy la usa); `dayFood` suma entradas + comidas palomeadas sin detalle (= plan tal cual).
- "Mis comidas": `food.saved` = `[{id,name,items:[{name,q,u,pzN,per}],uses}]` (per = macros de 1 unidad). Se guardan al registrar con la casilla ⭐ y se reusan desde chips. Cada alimento del borrador y cada entrada registrada guarda `q`, `u` y `per`, así los botones − + recalculan macros (`unitStep`: piezas de 1 en 1, g de 10, ml de 25, tazas/porciones de ½). Sin cantidad escrita = 1 pieza.
- `NUTRI_RECIPES`: palabras que arman varios alimentos editables ("batido", "sándwich", "omelette"…); "batido con 100 g de avena" reemplaza solo ese ingrediente. `CON_RE` evita partir nombres con "con" (café con leche).
- Al registrar fuera del plan se elige a qué comida corresponde (`guessSlot`: la comida sin palomear de −45 a +60 min de la hora actual; si no, Extra). Las entradas `src:"plan"` siempre usan los macros vigentes del plan × porción (`dayFood`).
- Búsqueda en Open Food Facts (`searchOFF`, solo al tocar el botón; límite 10 búsquedas/min por IP): macros por 100 g de la etiqueta; el producto elegido reemplaza lo escrito.
- Enlace `?comida=n1`…`n4` abre Comidas con esa comida lista para registrar. Los eventos diarios "🥗 Comida N" del calendario (los crea el asistente) llevan ese enlace.
- Comidas tiene selector de día (‹ ›, o tocar una barra de "Últimos 7 días") para registrar o corregir días anteriores; en días pasados el coach evalúa el día completo y "Extra" es la opción por defecto.
- Fechas: `td()`/`ds()` son en hora LOCAL (antes UTC y el día cambiaba a las 6 PM en México).

### Entreno en curso
`gymDraft` guarda la sesión a medias (pesos y reps) para que no se pierda si Android cierra la app. Se limpia al terminar o cancelar.

## Estilo
Tema oscuro y tranquilo: sin animaciones llamativas ni brillos. Clases en `CSS`: `.card`, `.sect`, `.row`, `.chk`, `.pill`, `.bar`, `.lfi`, `.lbp`, `.lbs`. Español mexicano en toda la interfaz.

## Pedidos típicos
- "Actualiza la rutina" → pegar texto, editar `SEED_PLANS`, subir `seedV`, conservar nombres repetidos o poner `hist`.
- Importador en la app (`parseRoutineText`): separa varias rutinas pegadas juntas en planes distintos (corta en encabezados "OPCIÓN 1", "Rutina de N días", "Día 1" que reinicia, o cuando la semana vuelve a empezar) y liga cada ejercicio a su historial con `findHistMatch`.
- "Cambia la dieta" → `NUTRI_TARGET`, `NUTRI_MEALS`, `SHOP_BASE`; verificar que los macros sumen.
- "Agrega X" → componente nuevo + estado (los 5 lugares) + render en el módulo que corresponda.

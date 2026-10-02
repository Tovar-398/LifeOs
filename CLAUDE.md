# LifeOS — contexto para el agente

App personal de Eduardo: PWA instalable para controlar día a día (entrenos, comidas, hábitos, finanzas).
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
- `HoyModule` — agenda del día: comidas, entreno, hábitos, tareas, próxima comida
- `CuerpoModule` — `GymEntrenar` / `GymHistorial` / `GymPlanes`
- `ComidasModule` — `CuerpoNutricion` (contador de macros) / `ShoppingList` / `PesoTab`
- `FinModule` — `QuickAdd`, `FinResumen`, gastos, tarjetas, ahorros
- `MasModule` — hábitos y tareas, revisión semanal, perfil con nivel y logros

### Datos sembrados
- `SEED_PLANS`: rutinas de gimnasio. **Para actualizar una rutina, sube su `seedV`**; al abrir la app reemplaza la versión vieja. Si no lo subes, no se actualiza.
- Conserva el **nombre exacto** de los ejercicios que se repiten entre versiones: el historial de pesos se busca por nombre (`lastSetsFor`). Cambiar el nombre = empezar ese ejercicio de cero.
- `NUTRI_TARGET` y `NUTRI_MEALS`: plan de comidas con macros por comida (`kcal`, `p`, `c`, `f`). La suma de las comidas debe cuadrar con el objetivo.
- `SHOP_BASE`: básicos de la lista de compras, acordes a la dieta vigente.

### Entreno en curso
`gymDraft` guarda la sesión a medias (pesos y reps) para que no se pierda si Android cierra la app. Se limpia al terminar o cancelar.

## Estilo
Tema oscuro y tranquilo: sin animaciones llamativas ni brillos. Clases en `CSS`: `.card`, `.sect`, `.row`, `.chk`, `.pill`, `.bar`, `.lfi`, `.lbp`, `.lbs`. Español mexicano en toda la interfaz.

## Pedidos típicos
- "Actualiza la rutina" → pegar texto, editar `SEED_PLANS`, subir `seedV`, conservar nombres repetidos.
- "Cambia la dieta" → `NUTRI_TARGET`, `NUTRI_MEALS`, `SHOP_BASE`; verificar que los macros sumen.
- "Agrega X" → componente nuevo + estado (los 5 lugares) + render en el módulo que corresponda.

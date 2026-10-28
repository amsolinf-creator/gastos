// ---------- Guía rápida dentro de la app (Ajustes → Cómo usar la app) ----------
const AYUDA = [
  { t: 'Instalar la app', p: [
    'Abrí Ajustes: arriba de todo, tocá el botón «Instalar ahora». Si no aparece el botón, usá el menú de Chrome: tocá los tres puntos ⋮ y elegí «Instalar aplicación» (o «Agregar a la pantalla principal»).',
    'Si usás iPhone: en Safari tocá Compartir → «Agregar a inicio».',
    'Queda en tu pantalla de inicio y se abre a pantalla completa. Tus datos se guardan solo en tu celular.' ] },
  { t: 'Lista de precios por voz', p: [
    'En la pestaña Compra tocá «Lista de precios» y el micrófono.',
    'Decí, por ejemplo: «tomate a 3000 el kilo», «tomate el kilo 3000», «rúcula atado 2000» o «leche el litro 1800».',
    'Para cambiar o borrar: «cambiar tomate el kilo 3500», «borrá la rúcula». También podés eliminar toda la lista.',
    'Es una lista temporal: cambiala cuando quieras.' ] },
  { t: 'Hacer la compra con el carrito', p: [
    'En Compra, con el modo «Carrito», tocá el micrófono y dictá lo que ponés en el changuito: «dos kilos de tomate», «300 gramos de queso», «cuatro leches».',
    'Si no decís kilo, gramo o litro, la app cuenta por unidad.',
    'Para productos con etiqueta de precio (balanza o góndola), tocá el botón de la cámara junto al micrófono: la IA lee el nombre, el peso y el precio, y lo agrega al carrito.',
    'Revisá lo que entendió y tocá ✓. Abajo ves el total estimado.' ] },
  { t: 'Guardar con el total de la caja', p: [
    'Al llegar a la caja, escribí el total que te cobran en «Total que marca la caja».',
    'La app te muestra la diferencia con tu estimado.',
    'Elegí cómo pagaste y tocá «Guardar compra»: se guarda el total real, repartido entre los productos.' ] },
  { t: 'Registrar escaneando el ticket', p: [
    'En Gasto tocá «Escanear un ticket». Sacá una foto o elegí una captura de la galería.',
    'Encuadrá solo el ticket (arrastrá las esquinas, usá «Girar»). Si es largo, elegí varias capturas seguidas.',
    'Revisá los productos y montos. Si el total del ticket no coincide por una promoción, elegí «Registrarla como descuento».',
    'Confirmá la fecha, el medio de pago y guardá. La foto se envía a Google para leerla y no se guarda en la app.',
    'Para corregir una compra ya cargada: Historial → abrila → «Conciliar con el ticket».' ] },
  { t: 'Anotar un gasto suelto', p: [
    'En Gasto tocá el micrófono y decí: «repuesto para auto mil doscientos».',
    'Revisá categoría, monto y fecha antes de guardar.',
    'Si no reconoce el lugar, aparece «¿Dónde lo compraste?»: dictalo, escribilo o elegí uno de los atajos.' ] },
  { t: 'Tarjeta de crédito y cuotas', p: [
    'Al registrar un gasto elegí «Medio de pago» → «Tarjeta de crédito», la tarjeta (➕ Agregar tarjeta… la primera vez) y la cantidad de cuotas.',
    'En la pestaña Cuotas ves cuánto pagás este mes, el saldo y los próximos meses de cada tarjeta.',
    'Si tu tarjeta cobra la primera cuota el mes siguiente, cambialo en Ajustes → Mis tarjetas.',
    'Para controlar el banco: en Cuotas, dentro de cada tarjeta, tocá «Importar resumen del banco» y elegí el PDF o una foto. La app guarda solo fechas y montos: vencimiento, total, pago mínimo y las cuotas por vencer, y las compara con las tuyas.',
    'Elegí también la fecha de cierre del resumen (se usa solo el día, por ejemplo el 24): las compras hechas después de esa fecha pasan a la cuota del mes siguiente.' ] },
  { t: 'Historial: corregir y borrar', p: [
    'Tocá una compra para ver el detalle y corregir la categoría, el lugar o la fecha.',
    'Dentro de una compra abierta podés elegir el lugar (es el título de la compra), o agregar uno nuevo con «➕ Agregar lugar…».',
    'Cada compra y cada gasto tiene un campo «Observaciones» para anotar lo que quieras, por ejemplo «Reintegro del 20% en el próximo resumen». La nota se ve en el Historial, en Cuotas y en el Excel.',
    'Para borrar varios juntos: «Seleccionar para borrar varios», marcá compras, gastos o días enteros y tocá Borrar.',
    'En Ajustes → «Ordenar mis categorías» podés unir categorías repetidas.' ] },
  { t: 'Estadísticas y reporte en Excel', p: [
    'En Estadísticas ves lo gastado por día, semana, mes o año, y por categoría, lugar y medio de pago.',
    'En Historial → «Reporte en Excel» elegí el período y tocá Descargar o Compartir.',
    'El archivo trae las hojas: Resumen, Gastos, Compras, Por categoría, Por lugar, Por medio de pago, Por mes, Por día y Cuotas.' ] },
  { t: 'Copia de seguridad', p: [
    'Tus gastos viven solo en tu celular: si borrás los datos del navegador o desinstalás la app, se pierden.',
    'En Ajustes → «Enviar copia por WhatsApp» te mandás una copia con un toque. La app te recuerda hacerla.',
    'En un celular nuevo: abrí la app, Ajustes → «Importar copia» y elegí el archivo.' ] },
];

function renderAyuda() {
  const c = $('ayudaCont'); if (!c) return;
  c.innerHTML = AYUDA.map((x, i) => `<details class="ayuda-tema"><summary><span class="ayuda-n">${i + 1}</span><span>${esc(x.t)}</span></summary><ol>${x.p.map(p => `<li>${esc(p)}</li>`).join('')}</ol></details>`).join('');
}
renderAyuda();

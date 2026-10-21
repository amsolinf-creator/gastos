// Intérprete local (sin IA): "leche mil doscientos cincuenta, dos lucas de verdura"
const CATEGORIAS = ['Comida', 'Verdulería', 'Carnicería', 'Limpieza', 'Transporte', 'Salud', 'Hogar', 'Ocio', 'Ropa', 'Servicios', 'Otros'];

const sinTildes = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

// Palabras clave por categoría: sin tildes y en singular (el plural se reconoce solo).
// Las frases de varias palabras tienen prioridad ("tomate triturado" es Comida aunque "tomate" sea Verdulería).
const PALABRAS_CAT = {
  'Limpieza': ['lavandina', 'detergente', 'jabon', 'limpieza', 'esponja', 'desodorante', 'shampoo', 'acondicionador', 'papel higienico', 'rollo de cocina', 'servilleta', 'bolsa de residuo', 'trapo', 'escoba', 'suavizante', 'limpiador', 'desinfectante', 'insecticida', 'cepillo', 'pasta dental', 'dentifrico', 'algodon', 'toallita', 'panal', 'higiene', 'lysoform', 'cif', 'ayudin', 'alcohol en gel', 'trapo de piso', 'bolsa de basura'],
  'Verdulería': ['verdura', 'fruta', 'tomate', 'papa', 'batata', 'cebolla', 'verdeo', 'ajo', 'zanahoria', 'zapallo', 'zapallito', 'calabaza', 'pepino', 'pimiento', 'morron', 'aji', 'choclo', 'arveja', 'remolacha', 'repollo', 'coliflor', 'brocoli', 'apio', 'puerro', 'perejil', 'cilantro', 'albahaca', 'menta', 'lechuga', 'rucula', 'acelga', 'espinaca', 'achicoria', 'radicheta', 'berenjena', 'hongo', 'champignon', 'palta', 'limon', 'naranja', 'mandarina', 'pomelo', 'manzana', 'pera', 'banana', 'frutilla', 'uva', 'durazno', 'ciruela', 'kiwi', 'melon', 'sandia', 'anana', 'mango', 'cereza', 'higo', 'arandano', 'mandioca', 'hinojo', 'nabo', 'rabano', 'rabanito', 'esparrago', 'alcachofa', 'zucchini', 'zuccini', 'chaucha', 'jengibre', 'ensalada', 'aceituna fresca', 'damasco', 'membrillo', 'pelon', 'pomelo', 'lima', 'maiz', 'verdulería', 'verduleria', 'cabutia', 'batata'],
  'Carnicería': ['carne', 'asado', 'vacio', 'bife', 'bondiola', 'pollo', 'pechuga', 'muslo', 'milanesa', 'chorizo', 'morcilla', 'salchicha', 'cerdo', 'cordero', 'pescado', 'merluza', 'salmon', 'jamon', 'fiambre', 'salame', 'panceta', 'hamburguesa', 'matambre', 'costilla', 'picada', 'carnaza', 'nalga', 'peceto', 'cuadril', 'lomo', 'higado', 'achura', 'mondongo', 'chinchulin', 'entraña', 'entrana', 'tapa de asado', 'carniceria', 'carnicería', 'paleta', 'osobuco', 'bola de lomo', 'pata muslo', 'suprema', 'mortadela', 'bacon'],
  'Comida': ['leche', 'pan', 'queso', 'huevo', 'fideo', 'arroz', 'aceite', 'yerba', 'cafe', 'te', 'azucar', 'harina', 'galletita', 'gaseosa', 'agua', 'cerveza', 'vino', 'almuerzo', 'cena', 'desayuno', 'pizza', 'empanada', 'helado', 'super', 'supermercado', 'comida', 'factura', 'medialuna', 'manteca', 'yogur', 'crema', 'dulce de leche', 'mermelada', 'sal', 'vinagre', 'salsa', 'tomate triturado', 'pure de tomate', 'tomate en lata', 'papa frita', 'papas fritas', 'cereal', 'avena', 'pasta', 'ravioles', 'tallarin', 'polenta', 'pure', 'mayonesa', 'ketchup', 'mostaza', 'snack', 'chocolate', 'alfajor', 'caramelo', 'chicle', 'golosina', 'jugo', 'soda', 'energizante', 'hielo', 'pan rallado', 'rebozador', 'premezcla', 'gelatina', 'flan', 'postre', 'dulce', 'miel', 'aceituna', 'atun', 'caballa', 'sardina', 'conserva', 'legumbre', 'lenteja', 'garbanzo', 'poroto', 'sopa', 'caldo', 'condimento', 'pimienta', 'oregano', 'comino', 'pimenton', 'tostada', 'budin', 'torta', 'masa', 'tapa de empanada', 'rico', 'bebida', 'fernet', 'whisky', 'gin', 'licor', 'champagne', 'sidra', 'mani', 'nuez', 'almendra', 'pasa de uva', 'fruta seca', 'granola', 'barra de cereal', 'mate cocido', 'gaseosas', 'coca', 'cola', 'pepsi', 'sprite', 'fanta', 'schweppes', 'manaos', 'panaderia', 'panadería', 'kiosco', 'almacen', 'almacén'],
  'Transporte': ['nafta', 'colectivo', 'bondi', 'sube', 'taxi', 'uber', 'cabify', 'peaje', 'estacionamiento', 'combustible', 'gnc', 'remis', 'tren', 'subte', 'pasaje', 'cochera', 'gasoil', 'patente', 'lavadero', 'neumatico', 'cubierta'],
  'Salud': ['farmacia', 'remedio', 'medico', 'doctor', 'dentista', 'analisis', 'obra social', 'prepaga', 'ibuprofeno', 'paracetamol', 'vitamina', 'curita', 'termometro', 'anteojo', 'optica', 'consulta', 'kinesiologo', 'psicologo', 'medicamento', 'jarabe', 'pastilla', 'crema dental'],
  'Hogar': ['alquiler', 'expensas', 'ferreteria', 'arreglo', 'plomero', 'electricista', 'mueble', 'lampara', 'pintura', 'herramienta', 'cortina', 'sabana', 'almohada', 'pila', 'foco', 'tornillo', 'cable de luz', 'cerradura', 'colchon', 'toalla', 'vajilla', 'olla', 'sarten', 'vaso', 'plato'],
  'Ocio': ['cine', 'netflix', 'spotify', 'salida', 'bar', 'boliche', 'juego', 'libro', 'regalo', 'restaurante', 'resto', 'cafeteria', 'cumpleanos', 'entrada', 'teatro', 'recital', 'streaming', 'juguete', 'viaje', 'hotel', 'excursion', 'gimnasio', 'club'],
  'Ropa': ['remera', 'pantalon', 'zapatilla', 'campera', 'ropa', 'zapato', 'media', 'camisa', 'calzado', 'buzo', 'vestido', 'pollera', 'ropa interior', 'bufanda', 'gorra', 'short', 'jean', 'sandalia', 'ojota'],
  'Servicios': ['luz', 'gas', 'internet', 'celular', 'telefono', 'cable', 'abl', 'monotributo', 'impuesto', 'seguro', 'recarga', 'wifi', 'municipal', 'rentas', 'factura de luz', 'factura de gas', 'factura de agua', 'tasa', 'cuota', 'matricula', 'cooperativa', 'inmobiliario'],
};

// Palabras del texto en minúscula y sin tildes
const palabrasDe = texto => sinTildes(texto.toLowerCase()).split(/[^a-z0-9]+/).filter(Boolean);

const FRASES_CAT = [];       // [categoria, ' palabra palabra ']
const PALABRAS_SUELTAS = []; // [categoria, palabra]
const CONOCIDAS = new Set();
for (const lista of Object.values(PALABRAS_CAT)) for (const kw of lista) palabrasDe(kw).forEach(w => CONOCIDAS.add(w));

// Lleva el plural a la forma del diccionario: "tomates" => "tomate", "limones" => "limon", "papas" => "papa"
function singular(w) {
  if (w.endsWith('es') && CONOCIDAS.has(w.slice(0, -2))) return w.slice(0, -2);
  if (w.endsWith('s') && CONOCIDAS.has(w.slice(0, -1))) return w.slice(0, -1);
  return w;
}

for (const [cat, lista] of Object.entries(PALABRAS_CAT)) {
  for (const kw of lista) {
    const ws = palabrasDe(kw);
    if (ws.length > 1) {
      FRASES_CAT.push([cat, ' ' + ws.join(' ') + ' ']);
      FRASES_CAT.push([cat, ' ' + ws.map(singular).join(' ') + ' ']);
    } else if (ws.length === 1) PALABRAS_SUELTAS.push([cat, ws[0]]);
  }
}

function adivinarCategoria(texto) {
  const ws = palabrasDe(texto).map(singular);
  if (!ws.length) return 'Otros';
  const flat = ' ' + ws.join(' ') + ' ';
  for (const [cat, frase] of FRASES_CAT) if (flat.includes(frase)) return cat;
  for (const [cat, w] of PALABRAS_SUELTAS) if (ws.includes(w)) return cat;
  return 'Otros';
}

const UNIDADES = { cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21, veintiun: 21, veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29 };
const DECENAS = { treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 };
const CENTENAS = { cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300, cuatrocientos: 400, cuatrocientas: 400, quinientos: 500, quinientas: 500, seiscientos: 600, seiscientas: 600, setecientos: 700, setecientas: 700, ochocientos: 800, ochocientas: 800, novecientos: 900, novecientas: 900 };

const esPalabraNum = w => w in UNIDADES || w in DECENAS || w in CENTENAS || w === 'mil' || w === 'medio' || w === 'millon' || w === 'millones';
const esDigitos = w => /^\d[\d.,]*$/.test(w);

function parseDigitos(w) {
  // "1.250" -> 1250 ; "12,50" -> 12.5 ; "1250" -> 1250
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(w)) return parseFloat(w.replace(/\./g, '').replace(',', '.'));
  return parseFloat(w.replace(',', '.'));
}

function parsePalabrasNum(ws) {
  let total = 0, actual = 0;
  for (const w of ws) {
    if (w === 'y') continue;
    if (esDigitos(w)) actual += parseDigitos(w);
    else if (w in UNIDADES) actual += UNIDADES[w];
    else if (w in DECENAS) actual += DECENAS[w];
    else if (w in CENTENAS) actual += CENTENAS[w];
    else if (w === 'mil') { total += (actual || 1) * 1000; actual = 0; }
    else if (w === 'millon' || w === 'millones') { total += (actual || 1) * 1e6; actual = 0; }
    else if (w === 'medio') actual += 0.5;
  }
  return total + actual;
}

function fechaISO(d) {
  const z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

// El dictado a veces pega las palabras ("cienmil", "diezmil") o mezcla cifras y letras ("100mil"):
// se separan para que "cien mil" valga 100000 y no 100.
function separarNumeros(t) {
  return t.replace(/\b([a-z]+?)(mil|millon|millones)\b/g, (m, p, q) => (esPalabraNum(p) ? p + ' ' + q : m))
    .replace(/(\d)(mil|millon|millones|lucas?|k)\b/g, '$1 $2');
}

// El dictado escribe los miles de varias formas: "40.000", "40 000" (espacio común o especial), "40,000".
// Todas valen 40000. Una coma seguida de 3 cifras no se toca si lo que sigue es una medida ("1,250 kilos").
function unirMiles(t) {
  const medida = '(?! ?(?:kilos?|kgs?|kilogramos?|gramos?|grs?|gr|litros?|lts?|ml)\\b)';
  return t.replace(/[  ]/g, ' ')
    .replace(new RegExp('(?<![\\d.,])(\\d{1,3}(?: \\d{3})+)(?![\\d]|[.,]\\d)' + medida, 'g'), m => m.replace(/ /g, ''))
    .replace(new RegExp('(?<![\\d.,])(\\d{1,3}(?:,\\d{3})+)(?![\\d]|[.,]\\d)' + medida, 'g'), m => m.replace(/,/g, ''));
}

function interpretarLocal(texto, hoy = new Date()) {
  let t = unirMiles(separarNumeros(sinTildes(texto.toLowerCase()))).replace(/[$]/g, ' ').replace(/[;:]/g, ',');
  let fecha = new Date(hoy);
  if (/\banteayer\b/.test(t)) { fecha.setDate(fecha.getDate() - 2); t = t.replace(/\banteayer\b/, ' '); }
  else if (/\bayer\b/.test(t)) { fecha.setDate(fecha.getDate() - 1); t = t.replace(/\bayer\b/, ' '); }
  else t = t.replace(/\bhoy\b/, ' ');

  const tokens = t.replace(/(?<!\d),|,(?!\d)/g, ' , ').split(/\s+/).filter(Boolean);
  const items = [];
  let nombre = [];
  let i = 0;
  while (i < tokens.length) {
    const w = tokens[i];
    if (w === ',') { i++; continue; }
    if (esDigitos(w) || esPalabraNum(w)) {
      // juntar la corrida numérica
      const corrida = [];
      let j = i;
      while (j < tokens.length) {
        const x = tokens[j];
        if (esDigitos(x) || esPalabraNum(x)) { corrida.push(x); j++; }
        else if (x === 'y' && corrida.length && j + 1 < tokens.length && esPalabraNum(tokens[j + 1]) && esPalabraNum(corrida[corrida.length - 1])) { corrida.push(x); j++; }
        else break;
      }
      // solo cifras: la primera; palabras o mezcla ("100 mil", "dos mil"): se calcula todo junto
      let monto = corrida.every(esDigitos) ? parseDigitos(corrida[0]) : parsePalabrasNum(corrida);
      if (/^(luca|lucas|k)$/.test(tokens[j] || '')) { monto *= 1000; j++; if (tokens[j] === 'y' && /^(media|medio)$/.test(tokens[j + 1] || '')) { monto += 500; j += 2; } }
      if (/^(pesos|peso|mangos|mango)$/.test(tokens[j] || '')) j++;
      if (!nombre.length) { // "dos lucas de verdura": el nombre viene después del monto
        while (j < tokens.length && tokens[j] !== ',' && !esDigitos(tokens[j]) && !esPalabraNum(tokens[j])) nombre.push(tokens[j++]);
      }
      const limpio = nombre.filter(x => !['de', 'del', 'la', 'el', 'los', 'las', 'y', 'compre', 'gaste', 'pague', 'en', 'por', 'un', 'una', 'unos', 'unas', 'son', 'salio'].includes(x) || nombre.length === 1).join(' ').trim();
      if (monto > 0) items.push({ producto: limpio || 'Gasto', monto, categoria: adivinarCategoria(limpio), fecha: fechaISO(fecha) });
      nombre = [];
      i = j;
    } else {
      nombre.push(w);
      i++;
    }
  }
  const res = items.map(it => ({ ...it, producto: it.producto.charAt(0).toUpperCase() + it.producto.slice(1) }));
  // "dudosos" > 0 = quedaron palabras sin monto o un renglón sin nombre: conviene consultar a la IA
  res.dudosos = (nombre.length ? 1 : 0) + items.filter(it => it.producto === 'Gasto').length;
  return res;
}

// ---------- Modo compra: precios por kilo y cantidades ----------
// Convierte "dos lucas", "mil doscientos", "2 mil" en dígitos planos ("2000", "1200")
function numerosADigitos(t) {
  t = unirMiles(separarNumeros(t));
  const tokens =t.replace(/(?<!\d),|,(?!\d)/g, ' , ').split(/\s+/).filter(Boolean);
  const out = [];
  let i = 0;
  while (i < tokens.length) {
    if (!(esDigitos(tokens[i]) || esPalabraNum(tokens[i]))) { out.push(tokens[i++]); continue; }
    const corrida = [];
    let j = i;
    while (j < tokens.length) {
      const x = tokens[j];
      if (esDigitos(x) || esPalabraNum(x)) { corrida.push(x); j++; }
      else if (x === 'y' && corrida.length && esPalabraNum(tokens[j + 1] || '') && esPalabraNum(corrida[corrida.length - 1])) { corrida.push(x); j++; }
      else break;
    }
    let v = parsePalabrasNum(corrida);
    if (/^(luca|lucas|k)$/.test(tokens[j] || '')) { v *= 1000; j++; if (tokens[j] === 'y' && /^(media|medio)$/.test(tokens[j + 1] || '')) { v += 500; j += 2; } }
    if (/^(pesos|peso|mangos|mango)$/.test(tokens[j] || '')) j++;
    out.push(String(v));
    i = j;
  }
  return out.join(' ');
}

// Envases y presentaciones que cuentan como "unidad": "rúcula, atado, 2000" => 2000 por unidad
const ENV = 'atados?|paquetes?|bolsas?|bolsones?|cajas?|cajones?|maples?|bandejas?|packs?|botellas?|latas?|frascos?|racimos?|manojos?|cabezas?';
const UNI = '(kilos?|kgs?|gramos?|grs?|gr|g|litros?|lts?|lt|l|mililitros?|ml|unidad(?:es)?|unid|u|docenas?|' + ENV + ')';
const NUM = '(\\d+(?:\\.\\d+)?)';
const ENV_RE = new RegExp('\\b(' + ENV + ')\\b');
const ENV_EXACTO = new RegExp('^(?:' + ENV + ')$');

// "atados" => "atado"; '' si no es un envase
function etiquetaDe(u) { return u && ENV_EXACTO.test(u) ? u.replace(/ones$/, 'on').replace(/s$/, '') : ''; }

// Saca el envase del nombre: "rucula atado" => { nombre: "rucula", etiqueta: "atado" }
function sacarEnvase(nombre) {
  const m = nombre.match(ENV_RE);
  if (!m) return { nombre, etiqueta: '' };
  const sin = nombre.replace(ENV_RE, ' ').replace(/\s+/g, ' ').trim();
  return { nombre: limpiarNombre(sin) || nombre, etiqueta: etiquetaDe(m[1]) };
}

const PRODUCTOS_POR_UNIDAD = /\b(lechuga|rucula|acelga|espinaca|perejil|cilantro|albahaca|apio|puerro|verdeo|coliflor|brocoli|remolacha|huevo|pan|baguette|facturas?|medialunas?|gaseosa|cerveza|yogur|alfajor|galletitas|fideos|arroz|yerba|azucar|harina|sal)\b/;
const PRODUCTOS_POR_LITRO = /\b(leche|aceite|agua|jugo|vinagre|vino|lavandina|detergente)\b/;

// Unidad más probable para un producto sin unidad explícita: kg, l o u
function sugerirUnidad(nombre) {
  const n = sinTildes(nombre.toLowerCase());
  if (ENV_RE.test(n) || PRODUCTOS_POR_UNIDAD.test(n)) return 'u';
  if (PRODUCTOS_POR_LITRO.test(n)) return 'l';
  return 'kg';
}

function normUnidad(u) {
  if (!u) return 'u';
  if (ENV_EXACTO.test(u)) return 'u';
  if (u === 'ml' || /^mili/.test(u)) return 'ml';
  if (/^k/.test(u)) return 'kg';
  if (/^g/.test(u)) return 'g';
  if (/^l/.test(u)) return 'l';
  if (/^d/.test(u)) return 'docena';
  return 'u';
}

function limpiarNombre(n) {
  return n.replace(/\b(el|la|los|las|un|una|unos|unas|de|del|por|que|con)\b/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/^(?:en|a|al)\s+/, '').replace(/\s+(?:en|a|al)$/, '');   // "tomate en 1300" => "tomate"
}

function parseSegmento(s) {
  for (let k = 0; k < 3; k++) s = s.trim().replace(/^(tambien|ademas|ahora|dame|quiero|compre|llevo|puse|agrega|agregar|anota|anotame|sumame|suma|poneme|pone)\s+/, '');
  s = s.trim();
  if (!s) return null;

  // Declaración de precio: "tomate a 2500 el kilo" / "2500 el kilo de tomate"
  let m = s.match(new RegExp(`^(.*?)\\s*(?:\\b(?:a|sale|cuesta|esta|vale)\\b)?\\s*${NUM}\\s*(?:el|la|por|x|cada|/)\\s*${UNI}\\b\\s*(?:de\\s+(.+))?$`));
  let producto, precio, uni, etiqueta = '';
  if (m && (limpiarNombre(m[1]) || m[4])) {
    producto = limpiarNombre(m[1]) || limpiarNombre(m[4]); precio = +m[2]; uni = normUnidad(m[3]); etiqueta = etiquetaDe(m[3]);
  } else if ((m = s.match(new RegExp(`^(?:el|la)\\s+${UNI}\\s+de\\s+(.+?)\\s*(?:\\b(?:sale|cuesta|esta|vale|a)\\b)?\\s*${NUM}$`)))) {
    producto = limpiarNombre(m[2]); precio = +m[3]; uni = normUnidad(m[1]); etiqueta = etiquetaDe(m[1]);
  } else if ((m = s.match(new RegExp(`^(.+?)\\s+(?:el|la|por|x|cada|/)\\s*${UNI}\\s*(?:\\b(?:a|sale|cuesta|esta|vale)\\b)?\\s*${NUM}$`))) && limpiarNombre(m[1])) {
    // "tomate el kilo 3000" / "tomate por kilo a 3000": el precio viene después de la unidad
    producto = limpiarNombre(m[1]); uni = normUnidad(m[2]); etiqueta = etiquetaDe(m[2]); precio = +m[3];
  }
  if (producto) {
    if (uni === 'docena') { precio /= 12; uni = 'u'; }
    if (uni === 'g') uni = 'kg';
    return { tipo: 'precio', producto, precio, unidad: uni, etiqueta };
  }

  // Compra. Precio incluido: "2 kilos de tomate a 2500"
  let inline = 0;
  const mp = s.match(new RegExp(`^(.+?)\\s+(?:a|sale|cuesta|vale)\\s+${NUM}$`));
  if (mp) { s = mp[1]; inline = +mp[2]; }

  let cantidad, unidad, nombre, fijo = false, etiq = '';
  if ((m = s.match(new RegExp(`^${NUM}\\s*${UNI}\\b\\s*(?:de\\s+)?(.+)$`)))) { cantidad = +m[1]; unidad = normUnidad(m[2]); etiq = etiquetaDe(m[2]); nombre = m[3]; }
  else if ((m = s.match(new RegExp(`^(.+?)\\s+${NUM}\\s*${UNI}$`)))) { cantidad = +m[2]; unidad = normUnidad(m[3]); etiq = etiquetaDe(m[3]); nombre = m[1]; }
  else if ((m = s.match(new RegExp(`^${NUM}\\s+(?:de\\s+)?(.+)$`)))) { cantidad = +m[1]; unidad = 'u'; nombre = m[2]; }
  else if (!inline && (m = s.match(new RegExp(`^(.+?)\\s+${NUM}$`)))) { cantidad = 1; nombre = m[1]; inline = +m[2]; fijo = true; }
  else { cantidad = 1; unidad = 'u'; nombre = s; }

  if (unidad === 'docena') { cantidad *= 12; unidad = 'u'; }
  nombre = limpiarNombre(nombre);
  const env = sacarEnvase(nombre);   // "rucula atado" => "rucula" + etiqueta "atado"
  nombre = env.nombre; etiq = etiq || env.etiqueta;
  if (!nombre) return null;
  // "Rúcula atado 2000" / "tomate 2500": precio por la unidad más probable (atado => unidad, tomate => kilo)
  if (fijo) unidad = 'u';   // sin "kilo"/"gramos" dichos, se cuenta por unidad
  // "tomate 2500 kilo": una cantidad de 100 o más kilos/litros no es una cantidad, es un precio por kilo/litro
  if (!inline && (unidad === 'kg' || unidad === 'l') && cantidad >= 100) return { tipo: 'precio', producto: nombre, precio: cantidad, unidad, etiqueta: etiq };
  return { tipo: 'compra', producto: nombre, cantidad, unidad, precio: inline, guardarPrecio: !!inline, etiqueta: etiq };
}

// ---------- Edición de la lista de precios por voz ----------
const VERBOS_BORRAR = /^(?:borra|borrar|borrame|elimina|eliminar|eliminame|saca|sacar|sacame|quita|quitar|quitame|suprimi|suprime|suprimir)\b\s*/;
const VERBOS_EDITAR = /^(?:cambia|cambiar|cambiame|actualiza|actualizar|modifica|modificar|corregi|corregir|pone|poner|poneme|ahora|subi|subir|baja|bajar|agrega|agregar|anota|anotame)\b\s*/;
const BORRAR_TODO = /^(?:todo|todos|toda|todas)\b|\b(?:toda|todo|completa|entera)\b.*\blista\b|^(?:la )?lista(?: de precios)?(?: completa| entera)?$|^los precios$/;

// Devuelve acciones: { accion: 'precio', producto, precio, unidad|null, etiqueta } | { accion: 'borrar', producto } | { accion: 'borrar_todo' }
// unidad null = que la app decida (la que ya tenía el producto, o la más probable)
function interpretarPreciosLocal(texto) {
  const t = numerosADigitos(normMedidas(sinTildes(texto.toLowerCase())).replace(/\$/g, ' '));
  const acciones = [];
  let dudosos = 0;
  for (let seg of t.split(/\s*(?:,|\by\b|\bmas\b|\btambien\b)\s*/)) {
    seg = seg.trim();
    if (!seg) continue;
    if (VERBOS_BORRAR.test(seg)) {
      const resto = seg.replace(VERBOS_BORRAR, '').trim();
      if (BORRAR_TODO.test(resto)) { acciones.push({ accion: 'borrar_todo' }); continue; }
      const nombre = limpiarNombre(resto.replace(/\b(?:de la lista|de los precios|de precios|la lista|el precio de|los precios de|precios?)\b/g, ' '));
      const env = sacarEnvase(nombre);
      if (env.nombre) acciones.push({ accion: 'borrar', producto: env.nombre });
      continue;
    }
    seg = seg.replace(VERBOS_EDITAR, '').replace(/^(?:el |los )?precios? (?:del? (?:la |el |los |las )?)?/, '');
    // en la lista de precios, "tomate kilo 3000" (sin "el") también es un precio por kilo
    const mb = seg.match(new RegExp(`^(.+?)\\s+${UNI}\\s*(?:\\b(?:a|sale|cuesta|esta|vale)\\b)?\\s*${NUM}$`));
    if (mb && limpiarNombre(mb[1])) {
      let u = normUnidad(mb[2]), pr = +mb[3];
      if (u === 'docena') { pr /= 12; u = 'u'; }
      acciones.push({ accion: 'precio', producto: limpiarNombre(mb[1]), precio: pr, unidad: u === 'g' ? 'kg' : u, etiqueta: etiquetaDe(mb[2]) || '' });
      continue;
    }
    const r = parseSegmento(seg);
    if (!r) { dudosos++; continue; }
    if (r.tipo === 'precio') acciones.push({ accion: 'precio', producto: r.producto, precio: r.precio, unidad: r.unidad, etiqueta: r.etiqueta || '' });
    else if (!(r.precio > 0)) dudosos++;
    else if (r.precio > 0) {
      const explicita = r.unidad !== 'u' || r.etiqueta;
      acciones.push({ accion: 'precio', producto: r.producto, precio: r.precio, unidad: explicita ? (r.etiqueta ? 'u' : (r.unidad === 'g' ? 'kg' : r.unidad === 'ml' ? 'l' : r.unidad)) : null, etiqueta: r.etiqueta || '' });
    }
  }
  const res = acciones.map(a => a.producto ? { ...a, producto: a.producto.charAt(0).toUpperCase() + a.producto.slice(1) } : a);
  res.dudosos = dudosos;
  return res;
}

// "kilogramo(s)" se trata igual que "kilo(s)"
const normMedidas = t => t.replace(/\bkilogramos\b/g, 'kilos').replace(/\bkilogramo\b/g, 'kilo');

function interpretarCompraLocal(texto) {
  let t = normMedidas(sinTildes(texto.toLowerCase())).replace(/\$/g, ' ');
  t = t.replace(/\b(?:tres cuartos|3\/4)(?: de)? kilos?\b/g, '0.75 kilo')
       .replace(/\b(?:un )?cuarto(?: de)? kilos?\b/g, '0.25 kilo')
       .replace(/\b(?:un )?kilo y medio\b/g, '1.5 kilos')
       .replace(/\b(?:un )?kilo y cuarto\b/g, '1.25 kilos');
  t = numerosADigitos(t);
  // "un kilo doscientos cincuenta" => 1.25 kilos; "dos kilos cien" => 2.1 kilos (lo que sigue al kilo, si es menor a 1000, son gramos)
  t = t.replace(/(\d+(?:\.\d+)?) (kilos?|kgs?|litros?|lts?) (?:y )?(\d{1,3})(?![\d.])(?: (?:gramos?|grs?|gr|g)\b)?(?! ?(?:kilos?|kgs?|litros?|lts?|unidad|unidades|docenas?|el|la|por|x|cada)\b)/g,
    (m, n, u, g) => (Math.round((parseFloat(n) + parseInt(g, 10) / 1000) * 1000) / 1000) + ' ' + u);
  t = t.replace(/(\d+(?:\.\d+)?) (kilos?|kgs?|litros?) y 0\.5\b/g, (_, n, u) => (parseFloat(n) + 0.5) + ' ' + u);
  const parseados = t.split(/\s*(?:,|\by\b|\bmas\b|\btambien\b|\bademas\b)\s*/).filter(sg => sg.trim()).map(parseSegmento);
  const res = parseados.filter(Boolean).map(it => ({ ...it, producto: it.producto.charAt(0).toUpperCase() + it.producto.slice(1) }));
  // "dudosos" > 0 = un tramo no se entendió o quedó un nombre con números: conviene consultar a la IA
  res.dudosos = parseados.filter(x => !x).length + res.filter(it => /\d/.test(it.producto) || it.producto.length < 2).length;
  return res;
}

if (typeof module !== 'undefined') module.exports = { interpretarPreciosLocal, interpretarCompraLocal, interpretarLocal, adivinarCategoria, CATEGORIAS, fechaISO };

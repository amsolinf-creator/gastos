// Intérprete local (sin IA): "leche mil doscientos cincuenta, dos lucas de verdura"
const CATEGORIAS = ['Comida', 'Verdulería', 'Carnicería', 'Limpieza', 'Transporte', 'Salud', 'Hogar', 'Ocio', 'Ropa', 'Servicios', 'Otros'];

const PALABRAS_CAT = {
  'Verdulería': ['verdura', 'verduras', 'fruta', 'frutas', 'tomate', 'papa', 'papas', 'cebolla', 'lechuga', 'banana', 'manzana', 'zapallo', 'zanahoria', 'limon'],
  'Carnicería': ['carne', 'asado', 'pollo', 'milanesa', 'milanesas', 'chorizo', 'cerdo', 'pescado', 'jamon', 'fiambre', 'bife', 'carnicería', 'carniceria'],
  'Comida': ['leche', 'pan', 'queso', 'huevos', 'huevo', 'fideos', 'arroz', 'aceite', 'yerba', 'cafe', 'azucar', 'harina', 'galletitas', 'gaseosa', 'agua', 'cerveza', 'vino', 'almuerzo', 'cena', 'desayuno', 'pizza', 'empanadas', 'helado', 'super', 'supermercado', 'comida', 'facturas', 'medialunas', 'manteca', 'yogur'],
  'Limpieza': ['lavandina', 'detergente', 'jabon', 'limpieza', 'esponja', 'desodorante', 'shampoo', 'papel higienico'],
  'Transporte': ['nafta', 'colectivo', 'bondi', 'sube', 'taxi', 'uber', 'cabify', 'peaje', 'estacionamiento', 'combustible', 'gnc', 'remis', 'tren', 'subte'],
  'Salud': ['farmacia', 'remedio', 'remedios', 'medico', 'doctor', 'dentista', 'analisis', 'obra social', 'prepaga', 'ibuprofeno'],
  'Hogar': ['alquiler', 'expensas', 'ferreteria', 'arreglo', 'plomero', 'electricista', 'muebles', 'lampara'],
  'Ocio': ['cine', 'netflix', 'spotify', 'salida', 'bar', 'boliche', 'juego', 'libro', 'regalo', 'restaurante', 'resto', 'cafeteria'],
  'Ropa': ['remera', 'pantalon', 'zapatillas', 'campera', 'ropa', 'zapatos', 'medias', 'camisa'],
  'Servicios': ['luz', 'gas', 'internet', 'celular', 'telefono', 'cable', 'abl', 'monotributo', 'impuesto', 'seguro', 'recarga'],
};

const sinTildes = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

function adivinarCategoria(texto) {
  const t = sinTildes(texto.toLowerCase());
  for (const [cat, palabras] of Object.entries(PALABRAS_CAT)) {
    if (palabras.some(p => new RegExp('\\b' + sinTildes(p) + '\\b').test(t))) return cat;
  }
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
    if (w in UNIDADES) actual += UNIDADES[w];
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

function interpretarLocal(texto, hoy = new Date()) {
  let t = sinTildes(texto.toLowerCase()).replace(/[$]/g, ' ').replace(/[;:]/g, ',');
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
      let monto = corrida.every(esDigitos) && corrida.length === 1 ? parseDigitos(corrida[0])
        : corrida.every(x => esPalabraNum(x) || x === 'y') ? parsePalabrasNum(corrida)
        : parseDigitos(corrida.find(esDigitos));
      if (/^(luca|lucas|k)$/.test(tokens[j] || '')) { monto *= 1000; j++; }
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
  return items.map(it => ({ ...it, producto: it.producto.charAt(0).toUpperCase() + it.producto.slice(1) }));
}

if (typeof module !== 'undefined') module.exports = { interpretarLocal, adivinarCategoria, CATEGORIAS, fechaISO };

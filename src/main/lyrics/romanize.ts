// F30 · Romanización básica de letras CJK — hiragana/katakana → romaji (Hepburn
// simplificado) y hangul → Revised Romanization sin dependencias externas.
// El hanzi/CJK unified sin un diccionario razonable se deja como estaba: es
// preferible mostrar el original a soltar pinyin inventado.
//
// Nota: es "best effort", pensado para dar una guía de pronunciación al oyente
// no hablante. No cubre okurigana ni sokuon en compuestos raros, pero acierta
// los kana básicos, digramas (きゃ/しゅ…) y sokuon (っ).

/** ¿La cadena contiene al menos un carácter de un bloque CJK? */
export function hasCjk(text: string): boolean {
  return /[぀-ヿ㐀-鿿가-힯]/.test(text)
}

// ---------- Tabla kana → romaji ----------

// Base hiragana (a la vez sirve para katakana: se normaliza restando 0x60).
const KANA: Record<string, string> = {
  // vocales
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o',
  // k
  か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko',
  が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go',
  // s
  さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so',
  ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
  // t
  た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to',
  だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do',
  // n
  な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no',
  // h
  は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
  ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo',
  ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po',
  // m
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo',
  // y
  や: 'ya', ゆ: 'yu', よ: 'yo',
  // r
  ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro',
  // w
  わ: 'wa', ゐ: 'wi', ゑ: 'we', を: 'wo',
  // n final
  ん: 'n',
  // pequeñas (autónomas, para digramas se combinan aparte)
  ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o',
  ゃ: 'ya', ゅ: 'yu', ょ: 'yo',
  ゎ: 'wa',
  // sokuon (っ) se trata como duplicador de consonante en el bucle.
  // alargador ー también se trata aparte
  // vau v
  ゔ: 'vu'
}

// Digramas (yōon): combinan consonante base + ya/yu/yo pequeñas.
const YOON: Record<string, string> = {
  きゃ: 'kya', きゅ: 'kyu', きょ: 'kyo',
  ぎゃ: 'gya', ぎゅ: 'gyu', ぎょ: 'gyo',
  しゃ: 'sha', しゅ: 'shu', しょ: 'sho',
  じゃ: 'ja', じゅ: 'ju', じょ: 'jo',
  ちゃ: 'cha', ちゅ: 'chu', ちょ: 'cho',
  ぢゃ: 'ja', ぢゅ: 'ju', ぢょ: 'jo',
  にゃ: 'nya', にゅ: 'nyu', にょ: 'nyo',
  ひゃ: 'hya', ひゅ: 'hyu', ひょ: 'hyo',
  びゃ: 'bya', びゅ: 'byu', びょ: 'byo',
  ぴゃ: 'pya', ぴゅ: 'pyu', ぴょ: 'pyo',
  みゃ: 'mya', みゅ: 'myu', みょ: 'myo',
  りゃ: 'rya', りゅ: 'ryu', りょ: 'ryo',
  ふぁ: 'fa', ふぃ: 'fi', ふぇ: 'fe', ふぉ: 'fo',
  ゔぁ: 'va', ゔぃ: 'vi', ゔぇ: 've', ゔぉ: 'vo',
  てぃ: 'ti', でぃ: 'di', でゅ: 'dyu',
  つぁ: 'tsa', つぃ: 'tsi', つぇ: 'tse', つぉ: 'tso',
  うぃ: 'wi', うぇ: 'we', うぉ: 'wo',
  しぇ: 'she', じぇ: 'je', ちぇ: 'che'
}

/** Convierte katakana a hiragana para simplificar el lookup. */
function toHiragana(ch: string): string {
  const code = ch.charCodeAt(0)
  // Bloque katakana estándar U+30A1..U+30F6 → hiragana U+3041..U+3096
  if (code >= 0x30a1 && code <= 0x30f6) {
    return String.fromCharCode(code - 0x60)
  }
  return ch
}

/** Romanización de kana (mezcla de hiragana + katakana). */
function romanizeKana(text: string): string {
  let out = ''
  let sokuon = false
  let lastVowel = ''
  const chars = Array.from(text)
  for (let i = 0; i < chars.length; i++) {
    const original = chars[i]
    const hira = toHiragana(original)
    // Alargador ー: repite la última vocal
    if (original === 'ー' || hira === 'ー') {
      out += lastVowel
      continue
    }
    // Sokuon っ/ッ: duplica la siguiente consonante
    if (hira === 'っ') {
      sokuon = true
      continue
    }
    // Digrama con siguiente pequeña
    const nextHira = i + 1 < chars.length ? toHiragana(chars[i + 1]) : ''
    const pair = hira + nextHira
    if (YOON[pair]) {
      let roma = YOON[pair]
      if (sokuon) {
        roma = roma[0] + roma
        sokuon = false
      }
      out += roma
      lastVowel = roma[roma.length - 1]
      i++
      continue
    }
    if (KANA[hira]) {
      let roma = KANA[hira]
      if (sokuon) {
        roma = roma[0] + roma
        sokuon = false
      }
      out += roma
      lastVowel = roma[roma.length - 1]
      continue
    }
    // No kana: emitir tal cual (romaji ya escrito, signos, hanzi…).
    out += original
    lastVowel = ''
    sokuon = false
  }
  return out
}

// ---------- Hangul (silabario coreano) → Revised Romanization ----------

const HANGUL_ONSET = [
  'g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's',
  'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'
]
const HANGUL_NUCLEUS = [
  'a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa',
  'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'
]
const HANGUL_CODA = [
  '', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k',
  'm', 'l', 'l', 'l', 'l', 'l', 'm', 'p', 'p', 't',
  't', 'ng', 't', 't', 'k', 't', 'p', 't'
]

function romanizeHangulChar(ch: string): string {
  const code = ch.charCodeAt(0)
  if (code < 0xac00 || code > 0xd7a3) return ch
  const syl = code - 0xac00
  const onset = Math.floor(syl / 588)
  const nucleus = Math.floor((syl % 588) / 28)
  const coda = syl % 28
  return HANGUL_ONSET[onset] + HANGUL_NUCLEUS[nucleus] + HANGUL_CODA[coda]
}

/**
 * Romaniza una cadena que puede mezclar kana, hangul, hanzi y latino. El hanzi
 * (CJK unified) se deja tal cual porque romanizar bien necesita diccionario.
 */
export function romanize(text: string): string {
  let out = ''
  for (const ch of text) {
    const code = ch.charCodeAt(0)
    if (code >= 0xac00 && code <= 0xd7a3) {
      out += romanizeHangulChar(ch)
    } else {
      out += ch
    }
  }
  // Kana en bloque (con sokuon/alargador dependen del carácter anterior).
  out = romanizeKana(out)
  return out
}

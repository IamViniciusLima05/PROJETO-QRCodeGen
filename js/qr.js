/* qr.js — gerador de QR Code (ISO/IEC 18004) em JavaScript puro, modo byte (UTF-8), versões 1 a 40.
   Uso: const qr = QR.gerar('texto', 'M'); qr.tamanho, qr.escuro(x, y) */

const QR = (() => {
  const NIVEIS = { L: 0, M: 1, Q: 2, H: 3 };
  const BITS_FORMATO = [1, 0, 3, 2]; // L, M, Q, H
  // códigos de correção por bloco e número de blocos, por nível e versão (índice 0 não é usado)
  const ECC_POR_BLOCO = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
  ];
  const BLOCOS = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
  ];

  const bit = (x, i) => ((x >>> i) & 1) !== 0;

  function modulosBrutos(ver) {
    let r = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      const n = Math.floor(ver / 7) + 2;
      r -= (25 * n - 10) * n - 55;
      if (ver >= 7) r -= 36;
    }
    return r;
  }
  const codewordsDeDados = (ver, n) => Math.floor(modulosBrutos(ver) / 8) - ECC_POR_BLOCO[n][ver] * BLOCOS[n][ver];

  /* ---- Reed-Solomon sobre GF(2^8) ---- */
  function mult(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
    return z & 0xff;
  }
  function divisor(grau) {
    const r = new Array(grau).fill(0); r[grau - 1] = 1;
    let raiz = 1;
    for (let i = 0; i < grau; i++) {
      for (let j = 0; j < r.length; j++) { r[j] = mult(r[j], raiz); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
      raiz = mult(raiz, 0x02);
    }
    return r;
  }
  function resto(dados, div) {
    const r = new Array(div.length).fill(0);
    for (const b of dados) {
      const f = b ^ r.shift(); r.push(0);
      div.forEach((c, i) => { r[i] ^= mult(c, f); });
    }
    return r;
  }

  function posicoesAlinhamento(ver, tam) {
    if (ver === 1) return [];
    const n = Math.floor(ver / 7) + 2;
    const passo = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
    const r = [6];
    for (let p = tam - 7; r.length < n; p -= passo) r.splice(1, 0, p);
    return r;
  }

  const MASCARAS = [
    (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
    (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0
  ];

  function gerar(texto, nivelNome = 'M') {
    const n = NIVEIS[nivelNome] ?? 1;
    const bytes = [...new TextEncoder().encode(texto)];

    // escolhe a menor versão em que os dados cabem
    let ver = 1, cap;
    for (; ver <= 40; ver++) {
      cap = codewordsDeDados(ver, n) * 8;
      const usados = 4 + (ver < 10 ? 8 : 16) + bytes.length * 8;
      if (usados <= cap) break;
    }
    if (ver > 40) throw new Error('Texto longo demais para um QR Code');

    // fluxo de bits: modo byte, contagem, dados, terminador e preenchimento
    const bits = [];
    const add = (v, len) => { for (let i = len - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
    add(0b0100, 4); add(bytes.length, ver < 10 ? 8 : 16); bytes.forEach((b) => add(b, 8));
    add(0, Math.min(4, cap - bits.length));
    add(0, (8 - (bits.length % 8)) % 8);
    for (let p = 0xec; bits.length < cap; p ^= 0xec ^ 0x11) add(p, 8);
    const dados = [];
    for (let i = 0; i < bits.length; i += 8) dados.push(parseInt(bits.slice(i, i + 8).join(''), 2));

    // divide em blocos, calcula a correção e intercala
    const nBlocos = BLOCOS[n][ver], eccLen = ECC_POR_BLOCO[n][ver];
    const brutos = Math.floor(modulosBrutos(ver) / 8);
    const curtos = nBlocos - (brutos % nBlocos), lenCurto = Math.floor(brutos / nBlocos);
    const div = divisor(eccLen), blocos = [];
    for (let i = 0, k = 0; i < nBlocos; i++) {
      const d = dados.slice(k, k + lenCurto - eccLen + (i < curtos ? 0 : 1)); k += d.length;
      const ecc = resto(d, div);
      if (i < curtos) d.push(0);
      blocos.push(d.concat(ecc));
    }
    const final = [];
    for (let i = 0; i < blocos[0].length; i++) blocos.forEach((b, j) => { if (i !== lenCurto - eccLen || j >= curtos) final.push(b[i]); });

    // matriz
    const tam = ver * 4 + 17;
    const mod = Array.from({ length: tam }, () => new Array(tam).fill(false));
    const fun = Array.from({ length: tam }, () => new Array(tam).fill(false));
    const set = (x, y, v) => { mod[y][x] = v; fun[y][x] = true; };

    for (let i = 0; i < tam; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const localizador = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
        if (x >= 0 && x < tam && y >= 0 && y < tam) set(x, y, d !== 2 && d !== 4);
      }
    };
    localizador(3, 3); localizador(tam - 4, 3); localizador(3, tam - 4);
    const al = posicoesAlinhamento(ver, tam), na = al.length;
    for (let i = 0; i < na; i++) for (let j = 0; j < na; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    const formato = (mascara) => {
      const d = (BITS_FORMATO[n] << 3) | mascara;
      let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      const b = ((d << 10) | r) ^ 0x5412;
      for (let i = 0; i <= 5; i++) set(8, i, bit(b, i));
      set(8, 7, bit(b, 6)); set(8, 8, bit(b, 7)); set(7, 8, bit(b, 8));
      for (let i = 9; i < 15; i++) set(14 - i, 8, bit(b, i));
      for (let i = 0; i < 8; i++) set(tam - 1 - i, 8, bit(b, i));
      for (let i = 8; i < 15; i++) set(8, tam - 15 + i, bit(b, i));
      set(8, tam - 8, true);
    };
    formato(0);
    if (ver >= 7) {
      let r = ver; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
      const b = (ver << 12) | r;
      for (let i = 0; i < 18; i++) { const a = tam - 11 + (i % 3), c = Math.floor(i / 3); set(a, c, bit(b, i)); set(c, a, bit(b, i)); }
    }

    // posiciona os dados em zigue-zague
    let ib = 0;
    for (let dir = tam - 1; dir >= 1; dir -= 2) {
      if (dir === 6) dir = 5;
      for (let v = 0; v < tam; v++) for (let j = 0; j < 2; j++) {
        const x = dir - j, subindo = ((dir + 1) & 2) === 0, y = subindo ? tam - 1 - v : v;
        if (!fun[y][x] && ib < final.length * 8) { mod[y][x] = bit(final[ib >>> 3], 7 - (ib & 7)); ib++; }
      }
    }

    // testa as 8 máscaras e fica com a de menor penalidade
    const aplicar = (m) => { for (let y = 0; y < tam; y++) for (let x = 0; x < tam; x++) if (!fun[y][x] && MASCARAS[m](x, y)) mod[y][x] = !mod[y][x]; };
    let melhor = 0, menor = Infinity;
    for (let m = 0; m < 8; m++) {
      aplicar(m); formato(m);
      const p = penalidade(mod, tam);
      if (p < menor) { menor = p; melhor = m; }
      aplicar(m);
    }
    aplicar(melhor); formato(melhor);
    return { versao: ver, tamanho: tam, nivel: nivelNome, mascara: melhor, bytes: bytes.length, escuro: (x, y) => mod[y][x], matriz: mod };
  }

  function penalidade(m, t) {
    let p = 0, escuros = 0;
    const linha = (get) => {
      for (let i = 0; i < t; i++) {
        let run = 1;
        const seq = [];
        for (let j = 0; j < t; j++) {
          const v = get(i, j); seq.push(v ? 1 : 0);
          if (j > 0) { if (v === get(i, j - 1)) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; }
        }
        const s = seq.join('');
        p += 40 * ((s.match(/(?=10111010000)/g) || []).length + (s.match(/(?=00001011101)/g) || []).length);
      }
    };
    linha((i, j) => m[i][j]); linha((i, j) => m[j][i]);
    for (let y = 0; y < t; y++) for (let x = 0; x < t; x++) {
      if (m[y][x]) escuros++;
      if (x < t - 1 && y < t - 1 && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;
    }
    const total = t * t;
    p += (Math.ceil(Math.abs(escuros * 20 - total * 10) / total) - 1) * 10;
    return p;
  }

  return { gerar };
})();

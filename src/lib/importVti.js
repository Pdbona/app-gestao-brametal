// Importação de VTI/UD por planilha — Fluxo A da Fase 2 (17/09/2026,
// FASE_2_TELAS_1-3_BRAMETAL.md, Tela 1). Ficou bloqueado desde
// 11/09/2026 até o Pablo mandar as colunas; ele mandou o layout junto
// com o pedido desta tela.
//
// Mesmo padrão do import de Colaborador do app-gestao-ml
// (colaboradoresImport.js): 100% client-side com `xlsx`/SheetJS, só
// devolve as linhas já validadas — quem grava no Firestore é a tela
// (ImportacaoScreen.jsx).
//
// Colunas obrigatórias (nomes do documento, com pequenas variações
// aceitas): VTI_ID | UD_ID | PRODUTO | PESO (kg) | DESTINO_PADRAO.
// DESTINO_PADRAO é um texto livre da planilha da Brametal (ex: "Pátio
// 1") que precisa ser mapeado pra uma área já cadastrada — esse
// mapeamento é feito na tela, não aqui, porque depende de já ter
// carregado as áreas do Firestore.
import * as XLSX from 'xlsx';

export const COLUNAS_MODELO = ['VTI_ID', 'UD_ID', 'PRODUTO', 'PESO', 'DESTINO_PADRAO'];

function normalizarCabecalho(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

const SINONIMOS_COLUNA = {
  vtiId: ['vti_id', 'vti', 'numero vti', 'nº vti'],
  udId: ['ud_id', 'ud', 'codigo ud', 'codigo da ud'],
  produto: ['produto'],
  peso: ['peso (kg)', 'peso', 'peso kg'],
  destinoPadrao: ['destino_padrao', 'destino padrao', 'destino']
};

function mapearColunas(linhaCabecalho) {
  const indices = {};
  (linhaCabecalho || []).forEach((celula, i) => {
    const norm = normalizarCabecalho(celula);
    Object.entries(SINONIMOS_COLUNA).forEach(([campo, sinonimos]) => {
      if (indices[campo] === undefined && sinonimos.includes(norm)) indices[campo] = i;
    });
  });
  return indices;
}

const CAMPOS_OBRIGATORIOS = ['vtiId', 'udId', 'destinoPadrao'];

// Gera o arquivo-modelo (.xlsx) pra quem for preencher a planilha.
export function gerarModeloImportacaoVti() {
  const linhas = [
    COLUNAS_MODELO,
    ['001', 'UD-001', 'Chapa Aço 10mm', 500, 'Pátio 1'],
    ['001', 'UD-002', 'Chapa Aço 10mm', 500, 'Pátio 1'],
    ['001', 'UD-003', 'Tubo Aço 30mm', 700, 'Pátio 2']
  ];
  const planilha = XLSX.utils.aoa_to_sheet(linhas);
  planilha['!cols'] = [{ wch: 10 }, { wch: 14 }, { wch: 22 }, { wch: 10 }, { wch: 16 }];
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, planilha, 'Importacao VTI');
  XLSX.writeFile(livro, 'modelo-importacao-vti.xlsx');
}

// Lê o arquivo e devolve:
// - `colunasFaltando`: nomes de campo (chave de SINONIMOS_COLUNA) cujo
//   cabeçalho não foi reconhecido — se vier não-vazio, `vtis`/`itens`
//   ficam vazios (planilha nem foi processada linha a linha).
// - `itens`: uma entrada por linha de dado, com `erro` preenchido
//   quando não pode ser importada.
// - `destinosDistintos`: valores únicos de DESTINO_PADRAO encontrados,
//   pra tela pedir o mapeamento pra área antes de liberar o botão
//   Importar.
export async function lerPlanilhaImportacaoVti(arquivo) {
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const livro = XLSX.read(bytes, { type: 'array', codepage: 65001 });
  const primeiraAba = livro.Sheets[livro.SheetNames[0]];
  const linhas = XLSX.utils.sheet_to_json(primeiraAba, { header: 1, raw: false, defval: '' });

  if (linhas.length === 0) {
    return { colunasFaltando: CAMPOS_OBRIGATORIOS, itens: [], destinosDistintos: [] };
  }

  const colunas = mapearColunas(linhas[0]);
  const colunasFaltando = CAMPOS_OBRIGATORIOS.filter((campo) => colunas[campo] === undefined);
  if (colunasFaltando.length > 0) {
    return { colunasFaltando, itens: [], destinosDistintos: [] };
  }

  const valorDaCelula = (linha, campo) =>
    colunas[campo] !== undefined ? String(linha[colunas[campo]] ?? '').trim() : '';

  const itens = linhas
    .slice(1)
    .filter((linha) => (linha || []).some((celula) => String(celula || '').trim() !== ''))
    .map((linha, i) => {
      const vtiId = valorDaCelula(linha, 'vtiId');
      const udId = valorDaCelula(linha, 'udId');
      const produto = valorDaCelula(linha, 'produto');
      const pesoTexto = valorDaCelula(linha, 'peso').replace(',', '.');
      const peso = pesoTexto === '' ? 0 : Number(pesoTexto);
      const destinoPadrao = valorDaCelula(linha, 'destinoPadrao');

      let erro = '';
      if (!vtiId) erro = 'VTI_ID em branco.';
      else if (!udId) erro = 'UD_ID em branco.';
      else if (!destinoPadrao) erro = 'DESTINO_PADRAO em branco.';

      return {
        linhaPlanilha: i + 2,
        vtiId,
        udId,
        produto,
        pesoKg: Number.isFinite(peso) ? peso : 0,
        destinoPadrao,
        erro
      };
    });

  // UD_ID repetido dentro da própria planilha — mesma regra do import de
  // Colaborador (1ª ocorrência vale, as demais viram erro).
  const vistos = new Set();
  itens.forEach((item) => {
    if (item.erro) return;
    if (vistos.has(item.udId)) {
      item.erro = 'UD_ID duplicado nesta planilha.';
    } else {
      vistos.add(item.udId);
    }
  });

  const destinosDistintos = Array.from(new Set(itens.filter((it) => !it.erro).map((it) => it.destinoPadrao))).sort();

  return { colunasFaltando: [], itens, destinosDistintos };
}

// Agrupa os itens válidos por VTI, calculando os agregados que a Tela 1
// mostra (contagem por área de destino mapeada, peso total). `mapaDestinos`
// é { destinoPadrao: areaId } resolvido pela tela a partir do que o
// Administrativo escolheu pra cada valor distinto encontrado na planilha.
export function agruparPorVti(itensValidos, mapaDestinos, areasPorId) {
  const porVti = new Map();
  itensValidos.forEach((item) => {
    const areaId = mapaDestinos[item.destinoPadrao] || null;
    const area = areaId ? areasPorId[areaId] : null;
    if (!porVti.has(item.vtiId)) {
      porVti.set(item.vtiId, { vtiId: item.vtiId, uds: [], pesoTotal: 0, contagemPorArea: new Map() });
    }
    const grupo = porVti.get(item.vtiId);
    grupo.uds.push({ ...item, destinoAreaId: areaId, destinoAreaNome: area ? area.nome : item.destinoPadrao });
    grupo.pesoTotal += item.pesoKg || 0;
    const chave = area ? area.nome : item.destinoPadrao;
    grupo.contagemPorArea.set(chave, (grupo.contagemPorArea.get(chave) || 0) + 1);
  });

  return Array.from(porVti.values()).map((grupo) => ({
    vtiId: grupo.vtiId,
    uds: grupo.uds,
    pesoTotal: grupo.pesoTotal,
    destinoResumo: Array.from(grupo.contagemPorArea.keys()).join(' / '),
    contagemPorArea: Object.fromEntries(grupo.contagemPorArea)
  }));
}

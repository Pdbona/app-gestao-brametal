// ============================================================
// CAMADA DE DADOS — API no formato do Firestore, guardando local
// ============================================================
//
// O projeto Firebase da Brametal ainda não existe (decisão do Pablo em
// 10/09/2026: Firebase e GitHub ficam pra depois). Pra o app já rodar,
// ser testável e não precisar ser reescrito quando a nuvem chegar, TODAS
// as telas importam daqui em vez de 'firebase/firestore' — e este arquivo
// expõe exatamente a mesma API (collection, doc, addDoc, setDoc,
// updateDoc, deleteDoc, getDoc, getDocs, onSnapshot, query, where,
// orderBy, serverTimestamp), só que gravando no localStorage.
//
// PRA MIGRAR PRO FIREBASE (quando o projeto existir): não se mexe em
// nenhuma tela. Troca-se só o corpo deste arquivo por
//   export { collection, doc, addDoc, ... } from 'firebase/firestore';
//   export { db } from '../firebase';
// (ver src/firebase.js, já deixado pronto com o lugar da config).
//
// Limitações conhecidas e ACEITAS enquanto for local: os dados vivem só
// no navegador de quem usa (não são compartilhados entre celulares nem
// entre o celular e o desktop) e somem se o usuário limpar os dados do
// site. Serve pra construir/validar as telas — não pra operar de verdade.

const PREFIXO = 'brametal';

export const db = { __local: true };

// ======== Persistência bruta ========

function chave(caminho) {
  return PREFIXO + ':' + caminho;
}

function lerColecao(caminho) {
  try {
    const bruto = window.localStorage.getItem(chave(caminho));
    return bruto ? JSON.parse(bruto) : {};
  } catch (e) {
    // localStorage indisponível (modo privado, cota estourada) — o app
    // segue funcionando, só sem persistir.
    return {};
  }
}

function gravarColecao(caminho, mapa) {
  try {
    window.localStorage.setItem(chave(caminho), JSON.stringify(mapa));
  } catch (e) {
    // Silencioso de propósito: quem chamou já trata o erro de negócio; um
    // throw aqui derrubaria a tela inteira por causa de cota.
  }
  notificar(caminho);
}

function gerarId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ======== Listeners (o que faz o onSnapshot funcionar) ========

const listeners = new Map(); // caminho -> Set(callback)

function notificar(caminho) {
  const inscritos = listeners.get(caminho);
  if (!inscritos) return;
  inscritos.forEach((cb) => {
    try {
      cb();
    } catch (e) {
      /* um listener quebrado não pode derrubar os outros */
    }
  });
}

function inscrever(caminho, cb) {
  if (!listeners.has(caminho)) listeners.set(caminho, new Set());
  listeners.get(caminho).add(cb);
  return () => {
    const inscritos = listeners.get(caminho);
    if (inscritos) inscritos.delete(cb);
  };
}

// Mudança feita em OUTRA aba do mesmo navegador (o evento 'storage' só
// dispara pras outras abas, nunca pra quem escreveu) — mantém duas abas
// em sincronia, que é o cenário real de testar o registro de presença
// numa aba e o Dashboard na outra.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (evento) => {
    if (evento.key && evento.key.indexOf(PREFIXO + ':') === 0) {
      notificar(evento.key.slice(PREFIXO.length + 1));
    }
  });
}

// ======== Referências ========

export function collection(_db, caminho) {
  return { __tipo: 'colecao', caminho };
}

// Três formas, iguais às do Firestore:
//   doc(db, 'areas', 'abc')  → documento com id conhecido
//   doc(colecaoRef, 'abc')   → idem, a partir da coleção
//   doc(colecaoRef)          → id novo gerado na hora (usado quando se
//                              precisa do id ANTES de gravar)
export function doc(alvo, a, b) {
  if (alvo && alvo.__tipo === 'colecao') {
    return { __tipo: 'doc', caminho: alvo.caminho, id: a || gerarId() };
  }
  return { __tipo: 'doc', caminho: a, id: b || gerarId() };
}

export function query(colecaoRef, ...restricoes) {
  return { __tipo: 'query', caminho: colecaoRef.caminho, restricoes };
}

export function where(campo, operador, valor) {
  return { __tipo: 'where', campo, operador, valor };
}

export function orderBy(campo, direcao = 'asc') {
  return { __tipo: 'orderBy', campo, direcao };
}

// Sentinela resolvida na hora da gravação (o Firestore resolve no
// servidor). Vira uma string ISO — paraMillis() em lib/data.js já aceita
// ISO, Date e Timestamp do Firestore, então nada mais precisa mudar na
// hora de migrar.
const SENTINELA_AGORA = { __sentinela: 'serverTimestamp' };

export function serverTimestamp() {
  return SENTINELA_AGORA;
}

function resolverSentinelas(dados) {
  const saida = {};
  Object.entries(dados || {}).forEach(([k, v]) => {
    saida[k] = v === SENTINELA_AGORA ? new Date().toISOString() : v;
  });
  return saida;
}

// ======== Consulta ========

function comparar(valorDoc, operador, valorFiltro) {
  switch (operador) {
    case '==':
      return valorDoc === valorFiltro;
    case '!=':
      return valorDoc !== valorFiltro;
    case '<':
      return valorDoc < valorFiltro;
    case '<=':
      return valorDoc <= valorFiltro;
    case '>':
      return valorDoc > valorFiltro;
    case '>=':
      return valorDoc >= valorFiltro;
    case 'in':
      return Array.isArray(valorFiltro) && valorFiltro.indexOf(valorDoc) >= 0;
    case 'array-contains':
      return Array.isArray(valorDoc) && valorDoc.indexOf(valorFiltro) >= 0;
    default:
      return false;
  }
}

function materializar(refOuQuery) {
  const caminho = refOuQuery.caminho;
  const mapa = lerColecao(caminho);
  let itens = Object.entries(mapa).map(([id, dados]) => ({ id, dados }));

  const restricoes = refOuQuery.restricoes || [];
  restricoes
    .filter((r) => r.__tipo === 'where')
    .forEach((r) => {
      itens = itens.filter((item) => comparar(item.dados[r.campo], r.operador, r.valor));
    });

  const ordenacoes = restricoes.filter((r) => r.__tipo === 'orderBy');
  if (ordenacoes.length > 0) {
    itens.sort((a, b) => {
      for (let i = 0; i < ordenacoes.length; i += 1) {
        const o = ordenacoes[i];
        const va = a.dados[o.campo];
        const vb = b.dados[o.campo];
        if (va === vb) continue;
        // Documento sem o campo vai pro fim (o Firestore o omitiria do
        // resultado; aqui preferimos não sumir com o registro).
        if (va == null) return 1;
        if (vb == null) return -1;
        const cmp = va > vb ? 1 : -1;
        return o.direcao === 'desc' ? -cmp : cmp;
      }
      return 0;
    });
  }

  return itens;
}

function snapshotDoc(caminho, id, dados) {
  return {
    id,
    ref: { __tipo: 'doc', caminho, id },
    exists: () => dados !== undefined,
    data: () => (dados === undefined ? undefined : { ...dados })
  };
}

function snapshotConsulta(refOuQuery) {
  const itens = materializar(refOuQuery);
  const docs = itens.map((i) => snapshotDoc(refOuQuery.caminho, i.id, i.dados));
  return {
    docs,
    size: docs.length,
    empty: docs.length === 0,
    forEach: (fn) => docs.forEach(fn)
  };
}

// ======== Leitura ========

export async function getDoc(docRef) {
  const mapa = lerColecao(docRef.caminho);
  return snapshotDoc(docRef.caminho, docRef.id, mapa[docRef.id]);
}

export async function getDocs(refOuQuery) {
  return snapshotConsulta(refOuQuery);
}

// Dispara uma vez na hora (como o Firestore faz com o cache local) e
// depois a cada gravação naquela coleção.
export function onSnapshot(refOuQuery, onNext, onError) {
  const emitir = () => {
    try {
      onNext(snapshotConsulta(refOuQuery));
    } catch (e) {
      if (onError) onError(e);
    }
  };
  emitir();
  return inscrever(refOuQuery.caminho, emitir);
}

// ======== Escrita ========

export async function addDoc(colecaoRef, dados) {
  const id = gerarId();
  const mapa = lerColecao(colecaoRef.caminho);
  mapa[id] = resolverSentinelas(dados);
  gravarColecao(colecaoRef.caminho, mapa);
  return { __tipo: 'doc', caminho: colecaoRef.caminho, id };
}

export async function setDoc(docRef, dados) {
  const mapa = lerColecao(docRef.caminho);
  mapa[docRef.id] = resolverSentinelas(dados);
  gravarColecao(docRef.caminho, mapa);
  return docRef;
}

export async function updateDoc(docRef, parcial) {
  const mapa = lerColecao(docRef.caminho);
  if (!mapa[docRef.id]) throw new Error('Documento inexistente: ' + docRef.caminho + '/' + docRef.id);
  mapa[docRef.id] = { ...mapa[docRef.id], ...resolverSentinelas(parcial) };
  gravarColecao(docRef.caminho, mapa);
  return docRef;
}

export async function deleteDoc(docRef) {
  const mapa = lerColecao(docRef.caminho);
  delete mapa[docRef.id];
  gravarColecao(docRef.caminho, mapa);
}

// ======== Extras que só existem no modo local ========
// Usados pelo aviso de "dados locais" no cabeçalho e por rotinas de
// manutenção durante o desenvolvimento. Somem naturalmente quando este
// arquivo for trocado pelo Firestore de verdade.

export const MODO_LOCAL = true;

export function apagarTudo() {
  const caminhos = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const k = window.localStorage.key(i);
    if (k && k.indexOf(PREFIXO + ':') === 0) caminhos.push(k.slice(PREFIXO.length + 1));
  }
  caminhos.forEach((c) => {
    window.localStorage.removeItem(chave(c));
    notificar(c);
  });
}

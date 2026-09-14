// ============================================================
// ÁREAS — o cadastro central deste app
// ============================================================
//
// Modelo em DOIS NÍVEIS (redesenhado em 10/09/2026 a partir do print do
// Pablo vendo a tela real e detalhando o que cada tipo de área precisa):
//
//   `tipo` (nível 1) — separa as duas famílias de área que a Brametal tem:
//     - 'servico'  → onde os COLABORADORES batem presença (chegada/saída).
//     - 'operacao' → onde as VTIs são MOVIMENTADAS (pátio/produção) — a
//                    base pras fases seguintes (Conferente/Tratorista);
//                    ainda não tem tela própria, só o cadastro já existe.
//
//   `subtipo` (nível 2) — o comportamento dentro de cada família:
//     - servico:  'dds' (só chegada, sem saída — o ponto de DDS da
//                 Brametal, GEMBA registra "Presença em DDS SEM
//                 checkout") | 'trabalho' (chegada E saída).
//     - operacao: 'patio' (terá endereços — cadastro à parte, feito pelo
//                 Pablo) | 'gal' (Galpão de Produção).
//
// Um colaborador só se vincula a áreas do tipo 'servico' (é o que resolve
// os "dois locais de chegada": o DDS e a área de trabalho onde ele foi
// alocado) — ver ColaboradoresCadastro.jsx e RegistroPresencaScreen.jsx.
//
// Geolocalização + raio de abrangência valem pros DOIS tipos — a
// validação por GPS é a regra em toda a operação (presença hoje,
// movimentação de VTI mais adiante), com QR Code sempre opcional como
// atalho.

import { distanciaMetros } from './geo';

export const TIPOS_AREA = [
  {
    id: 'servico',
    label: 'Área de Serviço',
    descricao: 'Chegada e saída dos colaboradores (registro de presença).'
  },
  {
    id: 'operacao',
    label: 'Área de Operação',
    descricao: 'Movimentação de VTIs — pátios e produção.'
  }
];

export const SUBTIPOS_SERVICO = [
  { id: 'dds', label: 'Ponto de DDS', descricao: 'Só registra a chegada (sem saída).' },
  { id: 'trabalho', label: 'Área de trabalho', descricao: 'Registra chegada e saída.' }
];

export const SUBTIPOS_OPERACAO = [
  { id: 'patio', label: 'Pátio', descricao: 'Terá endereços próprios (cadastro à parte).' },
  { id: 'gal', label: 'GAL (Produção)', descricao: 'Galpão de produção.' }
];

// Ponto de partida do campo "raio de abrangência" no cadastro. O GPS de
// celular já tem erro próprio de algumas dezenas de metros, então nada
// abaixo de ~20m costuma ser confiável a céu aberto.
export const RAIO_PADRAO_METROS = 100;
export const RAIO_MINIMO_METROS = 20;
export const RAIO_MAXIMO_METROS = 2000;

// Lista "achatada" (nível 1 + nível 2 num só) usada no formulário de
// cadastro — pedido do Pablo (14/09/2026) pra simplificar de 2 campos
// (Tipo + Comportamento) pra 1 só, já com "DDS" como opção direta. A
// área continua guardando `tipo`/`subtipo` separados por baixo (é o que
// o resto do app usa: filtro de área de serviço, alocação de
// colaborador, dashboards) — só a TELA de cadastro ficou mais simples.
export const OPCOES_TIPO_AREA = [
  {
    tipo: 'servico',
    subtipo: 'dds',
    grupo: 'Área de Serviço',
    label: 'DDS',
    descricao: 'Só registra a chegada dos colaboradores (sem saída).'
  },
  {
    tipo: 'servico',
    subtipo: 'trabalho',
    grupo: 'Área de Serviço',
    label: 'Área de trabalho',
    descricao: 'Registra chegada e saída dos colaboradores.'
  },
  {
    tipo: 'operacao',
    subtipo: 'patio',
    grupo: 'Área de Operação',
    label: 'Pátio',
    descricao: 'Movimentação de VTIs — terá endereços próprios.'
  },
  {
    tipo: 'operacao',
    subtipo: 'gal',
    grupo: 'Área de Operação',
    label: 'GAL (Produção)',
    descricao: 'Movimentação de VTIs — galpão de produção.'
  }
];

export function valorTipoArea(tipo, subtipo) {
  return `${tipo}:${subtipo}`;
}

export function opcaoTipoArea(tipo, subtipo) {
  return OPCOES_TIPO_AREA.find((o) => o.tipo === tipo && o.subtipo === subtipo) || null;
}

export function rotuloTipoArea(id) {
  const t = TIPOS_AREA.find((x) => x.id === id);
  return t ? t.label : id || '-';
}

export function rotuloSubtipoServico(id) {
  const s = SUBTIPOS_SERVICO.find((x) => x.id === id);
  return s ? s.label : id || '-';
}

export function rotuloSubtipoOperacao(id) {
  const s = SUBTIPOS_OPERACAO.find((x) => x.id === id);
  return s ? s.label : id || '-';
}

// Rótulo do 2º nível, dado o objeto área completo — usado nas listagens,
// que não sabem de antemão se a área é 'servico' ou 'operacao'.
export function rotuloSubtipoArea(area) {
  if (!area) return '-';
  return area.tipo === 'operacao' ? rotuloSubtipoOperacao(area.subtipo) : rotuloSubtipoServico(area.subtipo);
}

export function raioDaArea(area) {
  const raio = Number(area && area.raioMetros);
  return Number.isFinite(raio) && raio > 0 ? raio : RAIO_PADRAO_METROS;
}

export function temGeo(area) {
  return Boolean(area) && area.geoLat != null && area.geoLng != null;
}

// { distancia, dentro } de um ponto em relação a uma área. `distancia`
// vem null quando a área ainda não teve a geolocalização capturada.
export function avaliarArea(area, lat, lng) {
  if (!temGeo(area)) return { distancia: null, dentro: false };
  const distancia = distanciaMetros(lat, lng, area.geoLat, area.geoLng);
  return { distancia, dentro: distancia <= raioDaArea(area) };
}

// Descobre em qual área a pessoa está, a partir do GPS — o caminho de
// quem NÃO escaneou QR Code. Entre as áreas cujo raio contém o ponto,
// vence a mais próxima do centro (duas áreas podem se sobrepor quando os
// raios são generosos). Devolve também a lista completa avaliada, em
// ordem de distância, pra a tela conseguir dizer "você está a 340m da
// área mais próxima" quando nenhuma bate.
export function resolverAreaPorGeo(areas, lat, lng) {
  const avaliadas = areas
    .map((area) => ({ area, ...avaliarArea(area, lat, lng) }))
    .filter((a) => a.distancia != null)
    .sort((a, b) => a.distancia - b.distancia);

  const dentro = avaliadas.filter((a) => a.dentro);
  return { escolhida: dentro.length > 0 ? dentro[0] : null, avaliadas };
}

// Áreas que um colaborador pode usar: as que ele tem vinculadas no
// cadastro. Sem nenhum vínculo, ele não registra presença em lugar
// nenhum — é proposital, o vínculo é o que diz onde a pessoa foi alocada.
// Só existem vínculos com áreas do tipo 'servico' (ver
// ColaboradoresCadastro.jsx), mas a função não impõe isso — quem monta a
// lista de áreas já filtra antes de chamar.
export function areasDoColaborador(colaborador, areas) {
  const ids = [];
  if (colaborador && colaborador.areaDdsId) ids.push(colaborador.areaDdsId);
  if (colaborador && Array.isArray(colaborador.areasTrabalhoIds)) {
    colaborador.areasTrabalhoIds.forEach((id) => ids.push(id));
  }
  return areas.filter((a) => ids.indexOf(a.id) >= 0);
}

// URL que o QR Code da área aponta — cai direto na tela pública de
// registro de presença, sem passar pelo login do sistema. Query string
// (não rota por path) funciona em qualquer host estático.
export function montarUrlRegistro(areaId) {
  const base = window.location.origin + process.env.PUBLIC_URL + '/';
  return areaId ? base + '?presenca=' + areaId : base + '?presenca=';
}

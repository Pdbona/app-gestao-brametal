// ============================================================
// ÁREAS — o cadastro central deste app
// ============================================================
//
// Modelo em 1 NÍVEL, 3 tipos (simplificado em 14/09/2026 a partir do
// pedido do Pablo — ANTES disso existiam 2 níveis, tipo+subtipo, com 4
// combinações; ele achou o campo confuso vendo a tela real e pediu pra
// achatar):
//
//   - 'dds'      → registra só o momento da DDS (sem saída). Pode ter
//                  mais de um local.
//   - 'servico'  → local onde a ML presta serviço de mão de obra pro
//                  cliente: registra CHEGADA e SAÍDA dos colaboradores,
//                  e é sobre esse horário que a tolerância/janela vale.
//   - 'operacao' → local de movimentação das VTIs (pátio, produção) — a
//                  base pras fases seguintes (Conferente/Tratorista);
//                  ainda não tem tela própria, só o cadastro já existe.
//                  ATÉ 14/09/2026 isso se dividia em Pátio/GAL (só Pátio
//                  ganhava Endereço) — o Pablo pediu pra juntar num tipo
//                  só: qualquer área de Operação pode ganhar Endereço
//                  agora (ver EnderecosCadastro.jsx).
//
// Um colaborador só se vincula a áreas do tipo 'dds' ou 'servico' (é o
// que resolve os "dois locais de chegada": o DDS e a área de trabalho
// onde ele foi alocado) — ver ColaboradoresCadastro.jsx e
// RegistroPresencaScreen.jsx. `ehTipoDePresenca()` abaixo é o jeito
// central de checar isso.
//
// Geolocalização + raio de abrangência valem pros 3 tipos — a validação
// por GPS é a regra em toda a operação (presença hoje, movimentação de
// VTI mais adiante), com QR Code sempre opcional como atalho.

import { distanciaMetros } from './geo';

export const TIPOS_AREA = [
  {
    id: 'dds',
    label: 'DDS',
    descricao: 'Só registra o momento da DDS (sem saída) — pode ter mais de um local.'
  },
  {
    id: 'servico',
    label: 'Serviço',
    descricao:
      'Local onde a ML presta serviço de mão de obra pro cliente — registra chegada e saída dos colaboradores.'
  },
  {
    id: 'operacao',
    label: 'Operação',
    descricao: 'Local de movimentação das VTIs (pátio, produção).'
  }
];

// Ponto de partida do campo "raio de abrangência" no cadastro. O GPS de
// celular já tem erro próprio de algumas dezenas de metros, então nada
// abaixo de ~20m costuma ser confiável a céu aberto.
export const RAIO_PADRAO_METROS = 100;
export const RAIO_MINIMO_METROS = 20;
export const RAIO_MAXIMO_METROS = 2000;

export function rotuloTipoArea(id) {
  const t = TIPOS_AREA.find((x) => x.id === id);
  return t ? t.label : id || '-';
}

// Área usada pra presença de colaborador (DDS ou Serviço) — é a checagem
// central que separa esses 2 tipos do tipo Operação (que é sobre
// movimentação de VTI, sem relação com presença de pessoas).
export function ehTipoDePresenca(tipo) {
  return tipo === 'dds' || tipo === 'servico';
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
// Só existem vínculos com áreas de presença (tipo 'dds' ou 'servico', ver
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

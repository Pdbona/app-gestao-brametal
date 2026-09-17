// ============================================================
// VTI / UD — constantes e helpers compartilhados (Fase 2, plano de
// 11/09/2026: PLANO_FASE2_VTI_UD_11set2026.md)
// ============================================================
//
// VTI = carreta puxada pelo trator. UD = fardo de aço com código de
// barras; uma VTI carrega N UDs (terminologia fechada com o Pablo em
// 10/09/2026, ver memória do projeto).
//
// Status da VTI é SEMPRE informado por quem movimenta (bipagem na
// origem ou o tratorista ao pegar a VTI) — nunca deduzido pelo
// histórico, porque uma VTI pode ter carga de fora da ML.
//
// 'em_transporte' e 'parcial' entraram em 17/09/2026 (Telas 1-3 da Fase
// 2 — importação, check-in do Operador e endereçamento no pátio):
//   - 'em_transporte': o tratorista já iniciou a movimentação
//     (`movimentacoesVti` com fase INÍCIO gravada), mas ainda não
//     confirmou chegada no destino — status transitório, some assim que
//     a fase FIM é confirmada (vira o `statusInformado` daquele
//     movimento).
//   - 'parcial': o conferente encerrou o endereçamento desta VTI num
//     pátio, mas ainda restam UDs com destino diferente (só acontece
//     pra VTI que veio da importação de planilha — Fluxo A — com UDs
//     misturadas pra mais de um pátio; a Bipagem na origem, Fluxo B,
//     não tem essa informação).
export const STATUS_VTI = [
  { id: 'cheia', label: 'Cheia' },
  { id: 'vazia', label: 'Vazia' },
  { id: 'em_transporte', label: 'Em transporte' },
  { id: 'parcial', label: 'Parcialmente armazenada' }
];

export function rotuloStatusVti(id) {
  const s = STATUS_VTI.find((x) => x.id === id);
  return s ? s.label : id || '-';
}

// Cor de badge por status — mesmo padrão de badges já usado no resto do
// app (ver lib/styles.js), centralizado aqui pra não duplicar o switch
// em cada tela que lista VTI.
export function badgeStatusVti(id) {
  if (id === 'cheia') return 'badgeVermelho';
  if (id === 'em_transporte') return 'badgeAzul';
  if (id === 'parcial') return 'badgeLaranja';
  return 'badgeCinza'; // vazia
}

// Status da UD: nasce 'na_vti' (bipada na origem, ainda dentro de uma
// VTI), vira 'endereçada' quando o conferente do pátio associa um
// enderecoId (fase 5 do plano), e 'armazenada' é reservado pra uma
// conferência posterior (ainda sem tela) — por enquanto o fluxo só usa
// os dois primeiros.
export const STATUS_UD = [
  { id: 'na_vti', label: 'Na VTI' },
  { id: 'enderecada', label: 'Endereçada' },
  { id: 'armazenada', label: 'Armazenada' }
];

export function rotuloStatusUd(id) {
  const s = STATUS_UD.find((x) => x.id === id);
  return s ? s.label : id || '-';
}

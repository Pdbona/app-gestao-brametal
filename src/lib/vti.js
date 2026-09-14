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

export const STATUS_VTI = [
  { id: 'cheia', label: 'Cheia' },
  { id: 'vazia', label: 'Vazia' }
];

export function rotuloStatusVti(id) {
  const s = STATUS_VTI.find((x) => x.id === id);
  return s ? s.label : id || '-';
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

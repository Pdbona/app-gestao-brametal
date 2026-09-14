// Utilitários de "dia civil local" (YYYY-MM-DD) — o app inteiro usa esse
// formato pra comparar "hoje" (planejamento, presença, operações do
// Coletor). NUNCA usar `new Date().toISOString().slice(0,10)` direto: o
// `toISOString()` sempre calcula o dia em UTC, que diverge do dia local
// sempre que o horário local já passou da meia-noite em UTC — no Brasil
// (UTC-3), isso acontece todo dia entre ~21h e 23h59: `toISOString()` já
// mostra o dia seguinte.
//
// Bug real causado por isso (03/09/2026): um colaborador confirmando
// presença à noite via QR Code via CheckinPublicScreen via `hojeISO()`
// buscava o planejamento de "amanhã" (pelo relógio UTC) em vez de hoje,
// não achava nada, caía no fallback de "mostrar todos os turnos" e
// deixava escolher um turno diferente do planejado.
export function dataLocalISO(valor) {
  const d = valor instanceof Date ? valor : new Date(valor);
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

export function hojeISO() {
  return dataLocalISO(new Date());
}

// Lista de datas (YYYY-MM-DD) entre início e fim, inclusive — usada tanto
// pra lançar um período de planejamento quanto pra agregar um relatório
// por intervalo.
export function datasNoIntervalo(inicio, fim) {
  const datas = [];
  let atual = new Date(`${inicio}T00:00:00`);
  const limite = new Date(`${fim}T00:00:00`);
  if (Number.isNaN(atual.getTime()) || Number.isNaN(limite.getTime()) || atual > limite) return datas;
  while (atual <= limite) {
    datas.push(dataLocalISO(atual));
    atual.setDate(atual.getDate() + 1);
  }
  return datas;
}

export function formatarDataBr(iso) {
  if (!iso) return '-';
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function addDiasISO(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return dataLocalISO(d);
}

export function labelDataCurta(iso, ehHoje) {
  if (ehHoje) return 'Hoje';
  const d = new Date(`${iso}T00:00:00`);
  return `${DIAS_SEMANA[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Timestamp do Firestore, Date ou string → milissegundos (ou null).
export function paraMillis(valor) {
  if (!valor) return null;
  return valor?.toMillis ? valor.toMillis() : new Date(valor).getTime();
}

export function ehMesmoDia(valor, diaISO) {
  const ms = paraMillis(valor);
  if (!ms) return false;
  return dataLocalISO(new Date(ms)) === diaISO;
}

export function formatarHorario(valor) {
  const ms = paraMillis(valor);
  if (!ms) return '--:--';
  return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Data + hora curta (ex: "07/09 23:44") — diferente de `formatarHorario`
// (só hora), usada onde o dia pode não ser hoje (ex: operação em aberto de
// um dia anterior — ver `coletorSupervisao` em lib/permissoes.js).
export function formatarDataHoraCurta(valor) {
  const ms = paraMillis(valor);
  if (!ms) return '--/-- --:--';
  return new Date(ms).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// "Há quanto tempo" desde um timestamp até `agora` (ms) — em min/h/dia,
// sempre arredondando pra baixo. Usada pra destacar operação parada há
// muito tempo (Coletor em modo supervisão, Dashboard "Operações em
// aberto").
export function tempoDecorridoTexto(valor, agora) {
  const ms = paraMillis(valor);
  if (!ms) return '--';
  const minutos = Math.max(0, Math.floor((agora - ms) / 60000));
  if (minutos < 60) return `${minutos}min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `${horas}h${String(minutos % 60).padStart(2, '0')}min`;
  const dias = Math.floor(horas / 24);
  return `${dias}d ${horas % 24}h`;
}

// Minutos decorridos desde um horário ("HH:mm") até `agora` — usada tanto
// pro horaInicio do turno (janela de chegada) quanto pro horaFim (janela de
// saída, ver abaixo), mesma técnica de parse já usada em DashboardTab.jsx
// (split(':') + setHours), centralizada aqui pra não duplicar de novo.
// Negativo se o horário de referência ainda não chegou. `null` se o
// horário não estiver cadastrado.
export function minutosDesdeInicioTurno(horaInicio, agora = new Date()) {
  if (!horaInicio) return null;
  const [h, m] = horaInicio.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const inicio = new Date(agora);
  inicio.setHours(h, m, 0, 0);
  return Math.round((agora.getTime() - inicio.getTime()) / 60000);
}

// Janela de CHEGADA (04/09/2026, substitui a janela antiga de 0/+60/+180min
// — pedido do Pablo: colaborador pode chegar até 10min antes do início, e a
// tolerância de atraso sem pedir autorização também caiu pra 10min). O teto
// de 3h que antes bloqueava de vez ("expirado") foi removido de propósito —
// confirmado com o Pablo via AskUserQuestion: depois de 10min de atraso a
// solicitação de autorização fica pendente SEM prazo de expiração
// automática, só a liderança aprova/nega em Autorizações.
// Valor de fábrica — o formulário de Área (AreasCadastro.jsx, campo
// "Tolerância de entrada") pré-preenche uma área nova com este número,
// mas cada área grava o PRÓPRIO valor (`toleranciaEntradaMin`). Esta
// constante também serve de fallback pra área antiga que não tenha o
// campo gravado ainda.
export const TOLERANCIA_ENTRADA_MINUTOS = 10;

// Classifica a tentativa de registrar CHEGADA em relação ao horaInicio do
// turno: 'sem_horario' (turno sem horaInicio cadastrado, não bloqueia por
// erro de cadastro) | 'antes' (mais que `toleranciaMin` antes do início —
// turno ainda não começou) | 'normal' (dentro da janela — segue direto) |
// 'atraso' (mais que `toleranciaMin` depois — pede autorização da
// liderança). `toleranciaMin` veio, até 10/09/2026, de uma constante
// global única; agora (pedido do Pablo) é cadastrada por ÁREA
// (`area.toleranciaEntradaMin`) — quem chama passa esse valor, caindo no
// padrão de fábrica acima quando a área não tiver o campo.
export function statusJanelaEntrada(horaInicio, agora = new Date(), toleranciaMin = TOLERANCIA_ENTRADA_MINUTOS) {
  const minutos = minutosDesdeInicioTurno(horaInicio, agora);
  if (minutos == null) return 'sem_horario';
  if (minutos < -toleranciaMin) return 'antes';
  if (minutos <= toleranciaMin) return 'normal';
  return 'atraso';
}

// Janela de SAÍDA (feature nova, 04/09/2026) — mesma folga pros dois lados
// do horaFim do turno, mas NUNCA bloqueia: fora da janela só passa a
// exigir uma justificativa (ver RegistroPresencaScreen.jsx), gravada junto
// do registro pra compor o relatório de presença (folha/cobrança). Valor
// de fábrica — cada área grava o PRÓPRIO `toleranciaSaidaMin` (mesmo
// contorno de `TOLERANCIA_ENTRADA_MINUTOS` acima).
export const TOLERANCIA_SAIDA_MINUTOS = 10;

// Minutos entre `agora` e o horaFim REAL do turno — diferente de
// `minutosDesdeInicioTurno`, sabe resolver turno que cruza a meia-noite
// (ex. Noturno 18:00–03:00): se `horaFim` (em minutos do dia) é MENOR ou
// IGUAL a `horaInicio`, o fim cai no dia SEGUINTE ao dia em que o turno
// começou — não no mesmo dia civil de `agora`. `dataInicioISO` é a data
// (YYYY-MM-DD) em que ESSE turno específico começou (a `data` já gravada
// na presença aberta, sempre "hoje" no momento da chegada) — é a partir
// dela, não de `agora`, que o fim é calculado, porque na hora de sair já
// pode ser depois da meia-noite (outro dia civil).
//
// Bug real (07/09/2026): antes disso, o cálculo comparava direto com
// `agora` (como `minutosDesdeInicioTurno` faz) — pra um turno 16:00–01:50,
// tentar sair antes da meia-noite calculava o "01:50" como se fosse HOJE
// (já passado, várias horas atrás), soando como se a saída estivesse
// muito atrasada, quando na verdade o turno ainda nem tinha terminado
// (01:50 era amanhã).
export function minutosAteFimTurno(dataInicioISO, horaInicio, horaFim, agora = new Date()) {
  if (!horaFim) return null;
  const [hf, mf] = horaFim.split(':').map(Number);
  if (Number.isNaN(hf) || Number.isNaN(mf)) return null;

  const [hi, mi] = (horaInicio || '').split(':').map(Number);
  const temInicioValido = !Number.isNaN(hi) && !Number.isNaN(mi);
  const cruzaMeiaNoite = temInicioValido && hf * 60 + mf <= hi * 60 + mi;

  const [ano, mes, dia] = dataInicioISO.split('-').map(Number);
  const fim = new Date(ano, mes - 1, dia, hf, mf, 0, 0);
  if (cruzaMeiaNoite) fim.setDate(fim.getDate() + 1);

  return Math.round((agora.getTime() - fim.getTime()) / 60000);
}

// 'sem_horario' (turno sem horaFim cadastrado, não exige justificativa) |
// 'antecipada' (mais que `toleranciaMin` ANTES do fim — pode gerar
// desconto em folha) | 'normal' (dentro da janela) | 'atrasada' (mais que
// `toleranciaMin` DEPOIS do fim — hora extra, precisa justificar pra
// cobrança ao cliente). `toleranciaMin` é a `area.toleranciaSaidaMin`
// cadastrada (ver nota em `statusJanelaEntrada` acima).
export function statusJanelaSaida(dataInicioISO, horaInicio, horaFim, agora = new Date(), toleranciaMin = TOLERANCIA_SAIDA_MINUTOS) {
  const minutos = minutosAteFimTurno(dataInicioISO, horaInicio, horaFim, agora);
  if (minutos == null) return 'sem_horario';
  if (minutos < -toleranciaMin) return 'antecipada';
  if (minutos <= toleranciaMin) return 'normal';
  return 'atrasada';
}

// Soma uma duração (em minutos) a um horário "HH:mm", devolvendo o
// horário resultante — sempre "quebra" corretamente pra depois da meia-
// noite (aritmética mod 24h, sem precisar de nenhuma detecção de
// cruzamento à parte). Usada em TurnosCadastro.jsx (07/09/2026, sugestão
// do Pablo): cadastro pede Início + Duração, em vez do Administrativo
// calcular o horaFim de cabeça (foi digitando esse cálculo à mão que um
// turno Noturno acabou com o horaFim errado — ver bugfix de
// `minutosAteFimTurno` acima, no mesmo dia).
export function somarMinutosAoHorario(horaInicio, duracaoMinutos) {
  const [h, m] = (horaInicio || '').split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m) || !Number.isFinite(duracaoMinutos)) return '';
  const totalMinutos = (((h * 60 + m + duracaoMinutos) % 1440) + 1440) % 1440;
  const hf = Math.floor(totalMinutos / 60);
  const mf = totalMinutos % 60;
  return `${String(hf).padStart(2, '0')}:${String(mf).padStart(2, '0')}`;
}

// Inverso de `somarMinutosAoHorario` — duração em minutos entre horaInicio
// e horaFim, assumindo que o turno nunca passa de 24h (se horaFim ficar
// numericamente ≤ horaInicio, soma 24h — mesma convenção de "cruza a
// meia-noite" de `minutosAteFimTurno`). Só serve pra RECALCULAR a duração
// de turnos antigos que já tinham `horaFim` gravado direto (cadastrados
// antes da duração virar o campo de entrada) — usada só pra pré-preencher
// o formulário de edição quando o turno ainda não tem `duracaoMinutos`
// salvo.
export function duracaoEntreHorarios(horaInicio, horaFim) {
  const [hi, mi] = (horaInicio || '').split(':').map(Number);
  const [hf, mf] = (horaFim || '').split(':').map(Number);
  if ([hi, mi, hf, mf].some((n) => Number.isNaN(n))) return null;
  const inicioMin = hi * 60 + mi;
  let fimMin = hf * 60 + mf;
  if (fimMin <= inicioMin) fimMin += 1440;
  return fimMin - inicioMin;
}

// Sábado ou domingo — não considera feriados (o app ainda não tem
// calendário de feriados). Usada pra "dia útil seguinte"/"N dias úteis
// depois" (lib/planejamentoSemRegistro.js).
export function ehFimDeSemana(iso) {
  const dia = new Date(`${iso}T00:00:00`).getDay();
  return dia === 0 || dia === 6;
}

// Soma N dias ÚTEIS (pula sábado/domingo) a uma data ISO.
export function addDiasUteisISO(iso, n) {
  let atual = iso;
  let restantes = n;
  while (restantes > 0) {
    atual = addDiasISO(atual, 1);
    if (!ehFimDeSemana(atual)) restantes -= 1;
  }
  return atual;
}

// { inicio, fim } (ISO) da quinzena corrente a partir de diaISO: dia 1-15 do
// mês, ou dia 16-até o último dia do mês. Usada como período padrão do
// relatório de presença (ciclo de cobrança quinzenal da ML).
export function quinzenaAtual(diaISO = hojeISO()) {
  const [anoStr, mesStr, diaStr] = diaISO.split('-');
  const ano = Number(anoStr);
  const mes = Number(mesStr); // 1-12
  const dia = Number(diaStr);
  if (dia <= 15) {
    return { inicio: `${anoStr}-${mesStr}-01`, fim: `${anoStr}-${mesStr}-15` };
  }
  const ultimoDia = new Date(ano, mes, 0).getDate();
  return { inicio: `${anoStr}-${mesStr}-16`, fim: `${anoStr}-${mesStr}-${String(ultimoDia).padStart(2, '0')}` };
}

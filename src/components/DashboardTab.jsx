import React, { useEffect, useMemo, useState } from 'react';
import { db, collection, onSnapshot, query, where, orderBy } from '../lib/db';
import { ui, NAVY } from '../lib/styles';
import { hojeISO, formatarHorario, formatarDataBr, paraMillis, ehMesmoDia } from '../lib/data';
import { rotuloStatusVti, badgeStatusVti } from '../lib/vti';
import MapaOperacional from './MapaOperacional';

// Dashboard — Fase 1 cobria só presença. Em 17/09/2026 (passos 6-9 do
// PLANO_FASE2_VTI_UD_11set2026.md) entraram os 3 dashboards de VTI/UD
// (rastreamento, Operador de Trator, Armazenamento/Conferência) + o
// refinamento do de presença.
//
// NOTA IMPORTANTE sobre "disponibilidade" do Operador: o plano original
// (11/09) calculava isso a partir do checkin/checkout de PRESENÇA do
// tratorista. Em 17/09 o Pablo decidiu que o Check-in do Operador NÃO
// reaproveita mais presença — ele é autocontido, sem hora de início/fim
// de turno conhecida pelo sistema. Por isso "disponível" foi redefinido
// aqui como a SOMA DOS INTERVALOS ENTRE MOVIMENTAÇÕES CONCLUÍDAS do dia
// (do fim de uma até o início da próxima) — não inclui o tempo antes da
// 1ª nem depois da última movimentação, porque não há como saber quando
// o operador "começou"/"terminou" o dia sem um checkin próprio. Vale
// confirmar com o Pablo se essa definição faz sentido pra ele.
export default function DashboardTab() {
  const hoje = hojeISO();
  const [registros, setRegistros] = useState([]);
  const [areas, setAreas] = useState([]);
  const [colaboradores, setColaboradores] = useState([]);
  const [areaExpandida, setAreaExpandida] = useState(null);
  const [vtis, setVtis] = useState([]);
  const [movimentacoes, setMovimentacoes] = useState([]);
  const [uds, setUds] = useState([]);
  const [enderecos, setEnderecos] = useState([]);
  const [vtiExpandida, setVtiExpandida] = useState(null);

  useEffect(() => {
    const unsubRegistros = onSnapshot(
      query(collection(db, 'registrosPresenca'), where('data', '==', hoje)),
      (snap) => setRegistros(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setRegistros([])
    );
    const unsubAreas = onSnapshot(query(collection(db, 'areas'), orderBy('nome')), (snap) =>
      setAreas(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubColabs = onSnapshot(query(collection(db, 'colaboradores'), orderBy('nome')), (snap) =>
      setColaboradores(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubVtis = onSnapshot(query(collection(db, 'vtis'), orderBy('numero')), (snap) =>
      setVtis(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubMovimentacoes = onSnapshot(collection(db, 'movimentacoesVti'), (snap) =>
      setMovimentacoes(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubUds = onSnapshot(collection(db, 'uds'), (snap) => setUds(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    const unsubEnderecos = onSnapshot(collection(db, 'enderecos'), (snap) =>
      setEnderecos(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => {
      unsubRegistros();
      unsubAreas();
      unsubColabs();
      unsubVtis();
      unsubMovimentacoes();
      unsubUds();
      unsubEnderecos();
    };
  }, [hoje]);

  // Só áreas de presença (DDS/Serviço) entram no Dashboard — Operação
  // (pátio/produção de VTI) ganha sua própria seção quando a tela de
  // movimentação existir.
  const areasTrabalho = areas.filter((a) => a.status !== 'inativo' && a.tipo === 'servico');
  const areasDds = areas.filter((a) => a.status !== 'inativo' && a.tipo === 'dds');
  const colaboradoresAtivos = colaboradores.filter((c) => c.ativo !== false);

  const registrosDds = registros.filter((r) => r.tipoRegistro === 'dds');
  const registrosTrabalho = registros.filter((r) => r.tipoRegistro === 'trabalho');
  const presentesAgora = registrosTrabalho.filter((r) => !r.dataHoraSaida);

  // Dispersão DDS → área: minutos entre o registro do DDS e a primeira
  // chegada numa área de trabalho, por colaborador. Só entra na conta
  // quem tem os dois registros hoje.
  const dispersoes = useMemo(() => {
    const porColaborador = new Map();
    registrosDds.forEach((r) => {
      const ms = paraMillis(r.dataHoraEntrada);
      if (ms) porColaborador.set(r.colaboradorId, { nome: r.colaboradorNome, dds: ms });
    });
    const resultado = [];
    registrosTrabalho.forEach((r) => {
      const base = porColaborador.get(r.colaboradorId);
      const ms = paraMillis(r.dataHoraEntrada);
      if (!base || !ms || ms < base.dds) return;
      const minutos = Math.round((ms - base.dds) / 60000);
      const jaTem = resultado.find((x) => x.colaboradorId === r.colaboradorId);
      // Vale a PRIMEIRA chegada em área depois do DDS.
      if (!jaTem || minutos < jaTem.minutos) {
        const registro = { colaboradorId: r.colaboradorId, nome: base.nome, areaNome: r.areaNome, minutos };
        if (jaTem) resultado[resultado.indexOf(jaTem)] = registro;
        else resultado.push(registro);
      }
    });
    return resultado.sort((a, b) => b.minutos - a.minutos);
  }, [registrosDds, registrosTrabalho]);

  const dispersaoMedia =
    dispersoes.length > 0 ? Math.round(dispersoes.reduce((s, d) => s + d.minutos, 0) / dispersoes.length) : null;

  const registrosDaArea = (areaId) => registrosTrabalho.filter((r) => r.areaId === areaId);

  // ======== Presença: "Online agora" por situação (passo 9) ========
  const situacaoColaborador = (colaboradorId) => {
    const doColaborador = registros.filter((r) => r.colaboradorId === colaboradorId);
    if (doColaborador.some((r) => r.tipoRegistro === 'trabalho' && !r.dataHoraSaida)) return 'trabalho';
    if (doColaborador.some((r) => r.tipoRegistro === 'dds')) return 'so_dds';
    return 'fora';
  };
  const contagemSituacao = useMemo(() => {
    const c = { trabalho: 0, so_dds: 0, fora: 0 };
    colaboradoresAtivos.forEach((col) => {
      c[situacaoColaborador(col.id)] += 1;
    });
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colaboradoresAtivos, registros]);

  // ======== VTI / UD — Fase 2 (Telas 1-3, 17/09/2026) ========
  const areasOperacao = areas.filter((a) => a.status !== 'inativo' && a.tipo === 'operacao');
  const enderecoAreaId = useMemo(() => new Map(enderecos.map((e) => [e.id, e.areaId])), [enderecos]);
  const movimentacoesHoje = useMemo(() => movimentacoes.filter((m) => ehMesmoDia(m.criadoEm, hoje)), [movimentacoes, hoje]);

  // Peso total das UDs de cada VTI (soma sempre pelo `vtiId` gravado na
  // UD, mesmo já endereçada — é o que permite estimar tonelagem
  // movimentada por operador, ver comentário no topo do arquivo).
  const pesoPorVti = useMemo(() => {
    const mapa = new Map();
    uds.forEach((u) => {
      if (!u.vtiId) return;
      mapa.set(u.vtiId, (mapa.get(u.vtiId) || 0) + (u.pesoKg || 0));
    });
    return mapa;
  }, [uds]);

  // Histórico do dia por VTI: como não existe um array de eventos
  // gravado no doc da VTI, o "histórico" é reconstruído combinando UDs
  // bipadas/endereçadas hoje + fases de movimentação hoje, ordenado por
  // horário.
  const eventosPorVtiHoje = useMemo(() => {
    const mapa = new Map();
    const empilhar = (vtiId, evento) => {
      if (!vtiId) return;
      if (!mapa.has(vtiId)) mapa.set(vtiId, []);
      mapa.get(vtiId).push(evento);
    };
    uds.forEach((u) => {
      if (ehMesmoDia(u.criadoEm, hoje)) {
        empilhar(u.vtiId, { tipo: 'UD bipada', detalhe: u.codigo, quando: u.criadoEm });
      }
      if (u.status === 'enderecada' && ehMesmoDia(u.atualizadoEm, hoje)) {
        empilhar(u.vtiId, { tipo: 'UD endereçada', detalhe: `${u.codigo} → ${u.enderecoCodigo || '-'}`, quando: u.atualizadoEm });
      }
    });
    movimentacoesHoje.forEach((m) => {
      empilhar(m.vtiId, { tipo: 'Saída', detalhe: m.areaOrigemNome, quando: m.horaInicio });
      if (m.status === 'concluida') empilhar(m.vtiId, { tipo: 'Chegada', detalhe: m.areaDestinoNome, quando: m.horaFim });
    });
    mapa.forEach((lista) => lista.sort((a, b) => (paraMillis(a.quando) || 0) - (paraMillis(b.quando) || 0)));
    return mapa;
  }, [uds, movimentacoesHoje, hoje]);

  const vtisAtivas = vtis.filter((v) => v.status !== 'vazia');
  const vtisVazias = vtis.filter((v) => v.status === 'vazia');

  const formatarMinutos = (min) => {
    if (min == null || !Number.isFinite(min)) return '—';
    if (min < 60) return `${Math.round(min)}min`;
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return `${h}h${String(m).padStart(2, '0')}min`;
  };

  // Dashboard Operador de Trator (passo 7). Ver nota no topo do arquivo
  // sobre a redefinição de "disponível" desde que o Check-in parou de
  // reaproveitar presença.
  const porOperador = useMemo(() => {
    const mapa = new Map();
    movimentacoesHoje.forEach((m) => {
      const chave = m.operadorUid || m.operadorNome;
      if (!mapa.has(chave)) mapa.set(chave, { nome: m.operadorNome, movimentos: [] });
      mapa.get(chave).movimentos.push(m);
    });
    return Array.from(mapa.values())
      .map((op) => {
        const concluidos = [...op.movimentos]
          .filter((m) => m.status === 'concluida')
          .sort((a, b) => (paraMillis(a.horaInicio) || 0) - (paraMillis(b.horaInicio) || 0));
        let tempoTrabalhandoMin = 0;
        let kmPercorrido = 0;
        let temKm = false;
        let tonsMovimentadas = 0;
        concluidos.forEach((m) => {
          const ini = paraMillis(m.horaInicio);
          const fim = paraMillis(m.horaFim);
          if (ini && fim) tempoTrabalhandoMin += (fim - ini) / 60000;
          if (m.distanciaPercorridaMetros != null) {
            kmPercorrido += m.distanciaPercorridaMetros / 1000;
            temKm = true;
          }
          tonsMovimentadas += (pesoPorVti.get(m.vtiId) || 0) / 1000;
        });
        let tempoDisponivelMin = 0;
        for (let i = 1; i < concluidos.length; i++) {
          const fimAnterior = paraMillis(concluidos[i - 1].horaFim);
          const inicioAtual = paraMillis(concluidos[i].horaInicio);
          if (fimAnterior && inicioAtual && inicioAtual > fimAnterior) {
            tempoDisponivelMin += (inicioAtual - fimAnterior) / 60000;
          }
        }
        return {
          nome: op.nome,
          qtdCheias: concluidos.filter((m) => m.statusInformado === 'cheia').length,
          qtdVazias: concluidos.filter((m) => m.statusInformado === 'vazia').length,
          tempoTrabalhandoMin,
          tempoDisponivelMin,
          kmPercorrido: temKm ? kmPercorrido : null,
          tonsMovimentadas,
          emAndamento: op.movimentos.some((m) => m.status === 'em_andamento')
        };
      })
      .sort((a, b) => b.tempoTrabalhandoMin - a.tempoTrabalhandoMin);
  }, [movimentacoesHoje, pesoPorVti]);

  // Dashboard Armazenamento/Conferência (passo 8).
  const udsEnderecadasHoje = uds.filter((u) => u.status === 'enderecada' && ehMesmoDia(u.atualizadoEm, hoje));
  const udsAguardando = uds.filter((u) => u.status === 'na_vti');
  const tonsEnderecadasHoje = udsEnderecadasHoje.reduce((s, u) => s + (u.pesoKg || 0), 0) / 1000;
  // Só entram áreas que já têm pelo menos 1 Endereço cadastrado — é o
  // que as diferencia de uma área de Operação qualquer (ex: GAL, que
  // não costuma ter Endereço) pra fins desta tabela.
  const porPatio = areasOperacao
    .filter((a) => enderecos.some((e) => e.areaId === a.id))
    .map((a) => {
      const doPatio = udsEnderecadasHoje.filter((u) => enderecoAreaId.get(u.enderecoId) === a.id);
      return { area: a, qtd: doPatio.length, tons: doPatio.reduce((s, u) => s + (u.pesoKg || 0), 0) / 1000 };
    });

  const statusBadge = (registro) => {
    if (registro.entradaStatusJanela === 'atraso') {
      return { estilo: { ...ui.badge, ...ui.badgeVermelho }, texto: 'Chegou atrasado' };
    }
    if (registro.saidaStatusJanela === 'antecipada') {
      return { estilo: { ...ui.badge, ...ui.badgeLaranja }, texto: 'Saída antecipada' };
    }
    if (registro.saidaStatusJanela === 'atrasada') {
      return { estilo: { ...ui.badge, ...ui.badgeAzul }, texto: 'Tempo extra' };
    }
    return null;
  };

  return (
    <div>
      <div style={ui.sectionHeaderRow}>
        <h2 style={ui.sectionTitle}>Dashboard — {formatarDataBr(hoje)}</h2>
      </div>

      {/* ======== Indicadores do dia ======== */}
      <div style={ui.cardsRow}>
        <div style={ui.statCard}>
          <div style={ui.statValue}>{colaboradoresAtivos.length}</div>
          <div style={ui.statLabel}>Colaboradores ativos</div>
        </div>
        <div style={ui.statCard}>
          <div style={ui.statValue}>{registrosDds.length}</div>
          <div style={ui.statLabel}>DDS registrados hoje</div>
        </div>
        <div style={ui.statCard}>
          <div style={ui.statValue}>{presentesAgora.length}</div>
          <div style={ui.statLabel}>Em área agora</div>
        </div>
        <div style={ui.statCard}>
          <div style={ui.statValue}>{dispersaoMedia == null ? '—' : `${dispersaoMedia}min`}</div>
          <div style={ui.statLabel}>Dispersão média DDS → área</div>
        </div>
        <div style={ui.statCard}>
          <div style={ui.statValue}>{contagemSituacao.so_dds}</div>
          <div style={ui.statLabel}>Só no DDS (sem chegar na área)</div>
        </div>
        <div style={ui.statCard}>
          <div style={ui.statValue}>{contagemSituacao.fora}</div>
          <div style={ui.statLabel}>Fora do local hoje</div>
        </div>
      </div>

      {/* ======== Mapa ======== */}
      <MapaOperacional
        areas={areas}
        vtis={vtis}
        uds={uds}
        registrosDds={registrosDds}
        presentesAgora={presentesAgora}
      />

      {/* ======== Áreas ======== */}
      <h3 style={styles.tituloSecao}>Áreas de Serviço</h3>
      {areasTrabalho.length === 0 ? (
        <p style={ui.placeholderNote}>
          Nenhuma área de Serviço cadastrada ainda — comece por Cadastros → Operação → Área.
        </p>
      ) : (
        <div style={styles.gridCards}>
          {areasTrabalho.map((area) => {
            const daArea = registrosDaArea(area.id);
            const presentes = daArea.filter((r) => !r.dataHoraSaida);
            const saidos = daArea.filter((r) => r.dataHoraSaida);
            const expandida = areaExpandida === area.id;
            return (
              <button
                key={area.id}
                type="button"
                onClick={() => setAreaExpandida(expandida ? null : area.id)}
                style={{
                  ...styles.cardArea,
                  borderLeftColor: presentes.length > 0 ? '#1E7A34' : '#CCC'
                }}
              >
                <div style={styles.cardAreaTopo}>
                  <strong style={{ color: NAVY }}>{area.nome}</strong>
                  {area.codigo && <span style={styles.codigo}>{area.codigo}</span>}
                </div>
                <div style={styles.cardAreaNumeros}>
                  <span style={styles.numeroGrande}>{presentes.length}</span>
                  <span style={styles.numeroLabel}>em área</span>
                  <span style={styles.numeroSecundario}>{saidos.length} já saíram</span>
                </div>
                {expandida && (
                  <div style={styles.detalheArea}>
                    {daArea.length === 0 ? (
                      <span style={{ color: '#999' }}>Nenhum registro hoje.</span>
                    ) : (
                      daArea.map((r) => (
                        <div key={r.id} style={styles.detalheLinha}>
                          <span>{r.colaboradorNome}</span>
                          <span style={{ color: '#777' }}>
                            {formatarHorario(r.dataHoraEntrada)}
                            {r.dataHoraSaida ? ` → ${formatarHorario(r.dataHoraSaida)}` : ' → em área'}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {areasDds.length > 0 && (
        <>
          <h3 style={styles.tituloSecao}>DDS</h3>
          <div style={styles.gridCards}>
            {areasDds.map((area) => {
              const daArea = registrosDds.filter((r) => r.areaId === area.id);
              return (
                <div key={area.id} style={{ ...styles.cardArea, borderLeftColor: '#2B4C7E', cursor: 'default' }}>
                  <div style={styles.cardAreaTopo}>
                    <strong style={{ color: NAVY }}>{area.nome}</strong>
                  </div>
                  <div style={styles.cardAreaNumeros}>
                    <span style={styles.numeroGrande}>{daArea.length}</span>
                    <span style={styles.numeroLabel}>registros hoje</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ======== Dispersão ======== */}
      {dispersoes.length > 0 && (
        <>
          <h3 style={styles.tituloSecao}>Dispersão DDS → área de trabalho</h3>
          <div style={ui.tableWrapper}>
            <table style={ui.table}>
              <thead>
                <tr>
                  <th style={ui.th}>Colaborador</th>
                  <th style={ui.th}>Chegou em</th>
                  <th style={ui.th}>Tempo entre DDS e área</th>
                </tr>
              </thead>
              <tbody>
                {dispersoes.map((d) => (
                  <tr key={d.colaboradorId}>
                    <td style={ui.td}>{d.nome}</td>
                    <td style={ui.td}>{d.areaNome}</td>
                    <td style={ui.td}>
                      <span
                        style={{
                          ...ui.badge,
                          ...(d.minutos > 30 ? ui.badgeVermelho : d.minutos > 15 ? ui.badgeLaranja : ui.badgeVerde)
                        }}
                      >
                        {d.minutos} min
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ======== Registros do dia ======== */}
      <h3 style={styles.tituloSecao}>Registros de hoje</h3>
      {registros.length === 0 ? (
        <p style={ui.placeholderNote}>Nenhum registro de presença hoje.</p>
      ) : (
        <div style={ui.tableWrapper}>
          <table style={ui.table}>
            <thead>
              <tr>
                <th style={ui.th}>Colaborador</th>
                <th style={ui.th}>Perfil</th>
                <th style={ui.th}>Área</th>
                <th style={ui.th}>Turno</th>
                <th style={ui.th}>Chegada</th>
                <th style={ui.th}>Saída</th>
                <th style={ui.th}>Observação</th>
              </tr>
            </thead>
            <tbody>
              {[...registros]
                .sort((a, b) => (paraMillis(b.dataHoraEntrada) || 0) - (paraMillis(a.dataHoraEntrada) || 0))
                .map((r) => {
                  const badge = statusBadge(r);
                  return (
                    <tr key={r.id}>
                      <td style={ui.td}>{r.colaboradorNome}</td>
                      <td style={ui.td}>{r.perfilNome || <span style={{ color: '#999' }}>—</span>}</td>
                      <td style={ui.td}>
                        {r.areaNome}
                        {r.tipoRegistro === 'dds' && (
                          <span style={{ ...ui.badge, ...ui.badgeAzul, marginLeft: 6 }}>DDS</span>
                        )}
                      </td>
                      <td style={ui.td}>{r.turnoNome || '—'}</td>
                      <td style={ui.td}>{formatarHorario(r.dataHoraEntrada)}</td>
                      <td style={ui.td}>
                        {r.tipoRegistro === 'dds' ? (
                          <span style={{ color: '#999' }}>não se aplica</span>
                        ) : r.dataHoraSaida ? (
                          formatarHorario(r.dataHoraSaida)
                        ) : (
                          <span style={{ ...ui.badge, ...ui.badgeVerde }}>Em área</span>
                        )}
                      </td>
                      <td style={ui.td}>
                        {badge && <span style={badge.estilo}>{badge.texto}</span>}
                        {(r.entradaJustificativa || r.saidaJustificativa) && (
                          <div style={styles.justificativa}>{r.saidaJustificativa || r.entradaJustificativa}</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      {/* ======== Dashboard VTI (rastreamento) — passo 6 ======== */}
      {vtis.length > 0 && (
        <>
          <h3 style={styles.tituloSecao}>VTIs em operação</h3>
          <div style={ui.cardsRow}>
            <div style={ui.statCard}>
              <div style={ui.statValue}>{vtisAtivas.length}</div>
              <div style={ui.statLabel}>VTIs com carga/em transporte</div>
            </div>
            <div style={ui.statCard}>
              <div style={ui.statValue}>{vtisVazias.length}</div>
              <div style={ui.statLabel}>VTIs vazias</div>
            </div>
          </div>
          <div style={styles.gridCards}>
            {[...vtis]
              .sort((a, b) => (a.status === 'vazia') - (b.status === 'vazia') || (a.numero || '').localeCompare(b.numero || ''))
              .map((v) => {
                const eventos = eventosPorVtiHoje.get(v.id) || [];
                const expandida = vtiExpandida === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVtiExpandida(expandida ? null : v.id)}
                    style={{ ...styles.cardArea, borderLeftColor: v.status === 'vazia' ? '#CCC' : '#B3261E' }}
                  >
                    <div style={styles.cardAreaTopo}>
                      <strong style={{ color: NAVY }}>{v.numero}</strong>
                      <span style={{ ...ui.badge, ...ui[badgeStatusVti(v.status)] }}>{rotuloStatusVti(v.status)}</span>
                    </div>
                    <div style={styles.cardAreaNumeros}>
                      <span style={{ fontSize: 14, color: '#555' }}>{v.areaAtualNome || '—'}</span>
                    </div>
                    {eventos.length > 0 && (
                      <div style={{ fontSize: 12, color: '#999', marginTop: 6 }}>{eventos.length} evento(s) hoje</div>
                    )}
                    {expandida && (
                      <div style={styles.detalheArea}>
                        {eventos.length === 0 ? (
                          <span style={{ color: '#999' }}>Nenhum evento hoje.</span>
                        ) : (
                          eventos.map((ev, i) => (
                            <div key={i} style={styles.detalheLinha}>
                              <span>
                                {ev.tipo} — {ev.detalhe}
                              </span>
                              <span style={{ color: '#777' }}>{formatarHorario(ev.quando)}</span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
          </div>
        </>
      )}

      {/* ======== Dashboard Operador de Trator — passo 7 ======== */}
      {porOperador.length > 0 && (
        <>
          <h3 style={styles.tituloSecao}>Operador de Trator (hoje)</h3>
          <div style={ui.tableWrapper}>
            <table style={ui.table}>
              <thead>
                <tr>
                  <th style={ui.th}>Operador</th>
                  <th style={ui.th}>VTIs cheias</th>
                  <th style={ui.th}>VTIs vazias</th>
                  <th style={ui.th}>Tempo trabalhando</th>
                  <th style={ui.th}>Disponível*</th>
                  <th style={ui.th}>Km percorrido</th>
                  <th style={ui.th}>Toneladas (aprox.)</th>
                </tr>
              </thead>
              <tbody>
                {porOperador.map((op) => (
                  <tr key={op.nome}>
                    <td style={ui.td}>
                      {op.nome}
                      {op.emAndamento && <span style={{ ...ui.badge, ...ui.badgeAzul, marginLeft: 6 }}>Em operação</span>}
                    </td>
                    <td style={ui.td}>{op.qtdCheias}</td>
                    <td style={ui.td}>{op.qtdVazias}</td>
                    <td style={ui.td}>{formatarMinutos(op.tempoTrabalhandoMin)}</td>
                    <td style={ui.td}>{formatarMinutos(op.tempoDisponivelMin)}</td>
                    <td style={ui.td}>{op.kmPercorrido == null ? '—' : `${op.kmPercorrido.toFixed(1)} km`}</td>
                    <td style={ui.td}>{op.tonsMovimentadas.toFixed(1)} t</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 12, color: '#999', marginTop: 6 }}>
            *Disponível = soma dos intervalos entre o fim de uma movimentação e o início da próxima — não inclui
            antes da 1ª nem depois da última (o Check-in não tem hora de início/fim de turno).
          </p>
        </>
      )}

      {/* ======== Dashboard Armazenamento/Conferência — passo 8 ======== */}
      {(udsEnderecadasHoje.length > 0 || udsAguardando.length > 0) && (
        <>
          <h3 style={styles.tituloSecao}>Armazenamento / Conferência</h3>
          <div style={ui.cardsRow}>
            <div style={ui.statCard}>
              <div style={ui.statValue}>{udsEnderecadasHoje.length}</div>
              <div style={ui.statLabel}>UDs endereçadas hoje</div>
            </div>
            <div style={ui.statCard}>
              <div style={ui.statValue}>{tonsEnderecadasHoje.toFixed(1)} t</div>
              <div style={ui.statLabel}>Tonelagem endereçada hoje</div>
            </div>
            <div style={ui.statCard}>
              <div style={ui.statValue}>{udsAguardando.length}</div>
              <div style={ui.statLabel}>UDs aguardando armazenagem (agora)</div>
            </div>
          </div>
          {porPatio.length > 0 && (
            <div style={ui.tableWrapper}>
              <table style={ui.table}>
                <thead>
                  <tr>
                    <th style={ui.th}>Pátio</th>
                    <th style={ui.th}>UDs endereçadas hoje</th>
                    <th style={ui.th}>Tonelagem hoje</th>
                  </tr>
                </thead>
                <tbody>
                  {porPatio.map((p) => (
                    <tr key={p.area.id}>
                      <td style={ui.td}>{p.area.nome}</td>
                      <td style={ui.td}>{p.qtd}</td>
                      <td style={ui.td}>{p.tons.toFixed(1)} t</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const styles = {
  tituloSecao: { color: NAVY, fontSize: 17, margin: '28px 0 12px' },
  gridCards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 },
  cardArea: {
    background: '#FFF',
    border: '1px solid #EEE',
    borderLeft: '4px solid #CCC',
    borderRadius: 8,
    padding: 16,
    textAlign: 'left',
    cursor: 'pointer',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    font: 'inherit'
  },
  cardAreaTopo: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 },
  codigo: { fontSize: 11, fontWeight: 700, color: '#666', background: '#F0F0F0', borderRadius: 4, padding: '2px 6px' },
  cardAreaNumeros: { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  numeroGrande: { fontSize: 30, fontWeight: 700, color: NAVY, lineHeight: 1 },
  numeroLabel: { fontSize: 13, color: '#666' },
  numeroSecundario: { fontSize: 12, color: '#999', marginLeft: 'auto' },
  detalheArea: {
    marginTop: 12,
    paddingTop: 10,
    borderTop: '1px solid #EEE',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    fontSize: 13
  },
  detalheLinha: { display: 'flex', justifyContent: 'space-between', gap: 10 },
  justificativa: { fontSize: 12, color: '#888', marginTop: 4, maxWidth: 260 }
};

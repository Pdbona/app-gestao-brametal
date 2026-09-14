import React, { useEffect, useMemo, useState } from 'react';
import { db, collection, onSnapshot, query, where, orderBy } from '../lib/db';
import { ui, NAVY } from '../lib/styles';
import { hojeISO, formatarHorario, formatarDataBr, paraMillis } from '../lib/data';

// Dashboard da Fase 1 — tudo que existe hoje é presença, então é isso que
// ele mostra: quem já passou pelo DDS, quem está em qual área agora, e a
// DISPERSÃO entre o DDS e a chegada na área de trabalho (o indicador que
// o GEMBA apontou como prioritário: "alta variação no tempo entre check-in
// DDS e chegada na área").
//
// Os blocos de VTI/UD (ciclo da carreta, tempo por unidade, gargalos)
// entram aqui quando aquelas telas existirem.
export default function DashboardTab() {
  const hoje = hojeISO();
  const [registros, setRegistros] = useState([]);
  const [areas, setAreas] = useState([]);
  const [colaboradores, setColaboradores] = useState([]);
  const [areaExpandida, setAreaExpandida] = useState(null);

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
    return () => {
      unsubRegistros();
      unsubAreas();
      unsubColabs();
    };
  }, [hoje]);

  // Só áreas de SERVIÇO entram no Dashboard de presença — Área de
  // Operação (pátio/produção de VTI) ganha sua própria seção quando a
  // tela de movimentação existir.
  const areasServico = areas.filter((a) => a.status !== 'inativo' && a.tipo === 'servico');
  const areasTrabalho = areasServico.filter((a) => a.subtipo === 'trabalho');
  const areasDds = areasServico.filter((a) => a.subtipo === 'dds');
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
      </div>

      {/* ======== Áreas ======== */}
      <h3 style={styles.tituloSecao}>Áreas de trabalho</h3>
      {areasTrabalho.length === 0 ? (
        <p style={ui.placeholderNote}>
          Nenhuma área de trabalho cadastrada ainda — comece por Cadastros → Operação → Área.
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

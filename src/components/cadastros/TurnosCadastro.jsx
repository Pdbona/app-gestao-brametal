import React, { useEffect, useState } from 'react';
import { db, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy } from '../../lib/db';
import { ui, NAVY } from '../../lib/styles';
import { somarMinutosAoHorario, duracaoEntreHorarios } from '../../lib/data';

const TURNO_VAZIO = { nome: '', horaInicio: '', duracaoHoras: '', duracaoMinutos: '', ativo: true };

// O turno baliza as janelas de chegada e saída do registro de presença
// (±10min do início e do fim, ver lib/data.js).
//
// O formulário pede Início + DURAÇÃO, não Início + Fim: foi a correção
// adotada no app-gestao-ml depois de um turno noturno ser cadastrado com
// o fim errado, calculado de cabeça sem perceber que cruzava a meia-noite.
// `horaFim` continua sendo gravado (é o campo que o resto do app lê) —
// só que calculado aqui, não digitado.
export default function TurnosCadastro({ permissoes, compacto = false }) {
  const temAcesso = Boolean(permissoes.acessos?.turnos);
  const perm = { criar: temAcesso, editar: temAcesso, deletar: temAcesso };

  const [turnos, setTurnos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [formAberto, setFormAberto] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState(TURNO_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, 'turnos'), orderBy('horaInicio')),
      (snap) => {
        setTurnos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setCarregando(false);
      },
      () => setCarregando(false)
    );
    return () => unsubscribe();
  }, []);

  const abrirNovo = () => {
    setForm(TURNO_VAZIO);
    setEditandoId(null);
    setFormAberto(true);
    setErro('');
  };

  const abrirEdicao = (turno) => {
    const totalMin =
      turno.duracaoMinutos != null ? turno.duracaoMinutos : duracaoEntreHorarios(turno.horaInicio, turno.horaFim);
    setForm({
      nome: turno.nome || '',
      horaInicio: turno.horaInicio || '',
      duracaoHoras: totalMin != null ? String(Math.floor(totalMin / 60)) : '',
      duracaoMinutos: totalMin != null ? String(totalMin % 60) : '',
      ativo: turno.ativo !== false
    });
    setEditandoId(turno.id);
    setFormAberto(true);
    setErro('');
  };

  const cancelar = () => {
    setFormAberto(false);
    setEditandoId(null);
    setForm(TURNO_VAZIO);
    setErro('');
  };

  const duracaoTotalMin = (Number(form.duracaoHoras) || 0) * 60 + (Number(form.duracaoMinutos) || 0);
  const horaFimCalculado =
    form.horaInicio && duracaoTotalMin > 0 ? somarMinutosAoHorario(form.horaInicio, duracaoTotalMin) : '';
  const cruzaMeiaNoite = (() => {
    const [h, m] = (form.horaInicio || '').split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return false;
    return h * 60 + m + duracaoTotalMin >= 1440;
  })();

  const salvar = async () => {
    if (!form.nome.trim()) {
      setErro('Informe o nome do turno.');
      return;
    }
    if (!form.horaInicio) {
      setErro('Informe o horário de início do turno.');
      return;
    }
    if (duracaoTotalMin <= 0) {
      setErro('Informe a duração do turno (maior que zero).');
      return;
    }
    const duplicado = turnos.some(
      (t) => t.id !== editandoId && (t.nome || '').trim().toLowerCase() === form.nome.trim().toLowerCase()
    );
    if (duplicado) {
      setErro('Já existe um turno com esse nome.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      const payload = {
        nome: form.nome.trim(),
        horaInicio: form.horaInicio,
        horaFim: horaFimCalculado,
        duracaoMinutos: duracaoTotalMin,
        ativo: form.ativo
      };
      if (editandoId) {
        await updateDoc(doc(db, 'turnos', editandoId), payload);
      } else {
        await addDoc(collection(db, 'turnos'), payload);
      }
      cancelar();
    } catch (e) {
      setErro('Falha ao salvar o turno. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (turno) => {
    if (!window.confirm(`Excluir o turno "${turno.nome}"?`)) return;
    try {
      await deleteDoc(doc(db, 'turnos', turno.id));
    } catch (e) {
      setErro('Falha ao excluir. Tente novamente.');
    }
  };

  return (
    <div style={compacto ? styles.cardCompacto : undefined}>
      <div style={ui.sectionHeaderRow}>
        {compacto ? <h3 style={styles.tituloCompacto}>Turno</h3> : <h2 style={ui.sectionTitle}>Turnos</h2>}
        {perm.criar && !formAberto && (
          <button style={compacto ? ui.smallButton : ui.primaryButton} onClick={abrirNovo}>
            ➕ {compacto ? 'Turno' : 'Novo turno'}
          </button>
        )}
      </div>

      {erro && <div style={ui.erro}>❌ {erro}</div>}

      {formAberto && (
        <div style={ui.formCard}>
          <h3 style={{ marginTop: 0 }}>{editandoId ? 'Editar turno' : 'Novo turno'}</h3>

          <div style={ui.formGrid}>
            <label style={ui.label}>
              Nome *
              <input
                style={ui.input}
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex: Diurno"
              />
            </label>
            <label style={ui.label}>
              Início do turno *
              <input
                type="time"
                style={ui.input}
                value={form.horaInicio}
                onChange={(e) => setForm({ ...form, horaInicio: e.target.value })}
              />
            </label>
            <label style={ui.label}>
              Duração *
              <div style={styles.duracaoLinha}>
                <input
                  type="number"
                  min="0"
                  max="23"
                  style={{ ...ui.input, width: 70 }}
                  value={form.duracaoHoras}
                  onChange={(e) => setForm({ ...form, duracaoHoras: e.target.value })}
                  placeholder="0"
                />
                <span style={styles.duracaoUnidade}>h</span>
                <input
                  type="number"
                  min="0"
                  max="59"
                  style={{ ...ui.input, width: 70 }}
                  value={form.duracaoMinutos}
                  onChange={(e) => setForm({ ...form, duracaoMinutos: e.target.value })}
                  placeholder="00"
                />
                <span style={styles.duracaoUnidade}>min</span>
              </div>
            </label>
            <label style={ui.label}>
              Status
              <select
                style={ui.input}
                value={form.ativo ? 'ativo' : 'inativo'}
                onChange={(e) => setForm({ ...form, ativo: e.target.value === 'ativo' })}
              >
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </label>
          </div>

          {horaFimCalculado && (
            <p style={styles.preview}>
              Fim do turno: <strong>{horaFimCalculado}</strong>
              {cruzaMeiaNoite && <span style={{ color: '#B85700' }}> (dia seguinte)</span>}
            </p>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button style={ui.primaryButton} onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
            <button style={ui.secondaryButton} onClick={cancelar} disabled={salvando}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {carregando ? (
        <p>Carregando turnos...</p>
      ) : turnos.length === 0 ? (
        <p style={ui.placeholderNote}>Nenhum turno cadastrado ainda.</p>
      ) : compacto ? (
        <div style={styles.listaCompacta}>
          {turnos.map((t) => (
            <div key={t.id} style={styles.itemCompacto}>
              <div>
                <strong>{t.nome}</strong>
                <div style={{ fontSize: 12, color: '#777' }}>
                  {t.horaInicio} – {t.horaFim}
                </div>
              </div>
              <div>
                {perm.editar && (
                  <button style={ui.linkButton} onClick={() => abrirEdicao(t)}>
                    Editar
                  </button>
                )}
                {perm.deletar && (
                  <button style={{ ...ui.linkButton, color: '#D32F2F' }} onClick={() => excluir(t)}>
                    Excluir
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={ui.tableWrapper}>
          <table style={ui.table}>
            <thead>
              <tr>
                <th style={ui.th}>Nome</th>
                <th style={ui.th}>Início</th>
                <th style={ui.th}>Fim</th>
                <th style={ui.th}>Duração</th>
                <th style={ui.th}>Status</th>
                <th style={ui.th}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {turnos.map((t) => (
                <tr key={t.id}>
                  <td style={ui.td}>{t.nome}</td>
                  <td style={ui.td}>{t.horaInicio}</td>
                  <td style={ui.td}>{t.horaFim}</td>
                  <td style={ui.td}>
                    {Math.floor((t.duracaoMinutos || 0) / 60)}h{String((t.duracaoMinutos || 0) % 60).padStart(2, '0')}
                  </td>
                  <td style={ui.td}>
                    <span style={{ ...ui.badge, ...(t.ativo !== false ? ui.badgeVerde : ui.badgeCinza) }}>
                      {t.ativo !== false ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td style={ui.td}>
                    {perm.editar && (
                      <button style={ui.linkButton} onClick={() => abrirEdicao(t)}>
                        Editar
                      </button>
                    )}
                    {perm.deletar && (
                      <button style={{ ...ui.linkButton, color: '#D32F2F' }} onClick={() => excluir(t)}>
                        Excluir
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const styles = {
  cardCompacto: {
    background: '#FFF',
    borderRadius: 8,
    padding: 16,
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    width: '100%'
  },
  tituloCompacto: { margin: '0 0 12px', fontSize: 15, color: NAVY },
  listaCompacta: { display: 'flex', flexDirection: 'column', gap: 8 },
  itemCompacto: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
    padding: '8px 0',
    borderBottom: '1px solid #EEE',
    fontSize: 13
  },
  duracaoLinha: { display: 'flex', alignItems: 'center', gap: 6 },
  duracaoUnidade: { fontSize: 13, color: '#666', fontWeight: 600 },
  preview: { fontSize: 14, color: NAVY, background: '#F0F3F7', borderRadius: 6, padding: '8px 12px', margin: '0 0 16px' }
};

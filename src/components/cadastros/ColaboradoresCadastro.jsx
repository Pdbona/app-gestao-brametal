import React, { useEffect, useState } from 'react';
import { db, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy } from '../../lib/db';
import { ui, NAVY } from '../../lib/styles';
import { formatarCpf, normalizarCpf, validarCpf } from '../../lib/cpf';

const COLABORADOR_VAZIO = {
  nome: '',
  cpf: '',
  areaDdsId: '',
  areaTrabalhoId: '',
  ativo: true
};

// Base de colaboradores da ML que atuam na Brametal. É contra este
// cadastro que a tela pública de presença valida quem está registrando.
//
// Esta tela NÃO tem Perfil nem Turno padrão (removidos em 14/09/2026 a
// pedido do Pablo: "esta tela seria apenas para liberar o registro de
// chegada e saída") — só o vínculo com Área importa aqui. O colaborador
// nunca logou no sistema mesmo (só aparece pelo CPF na tela pública de
// presença), então não havia RBAC envolvido nessa remoção.
//
// O vínculo com Área é o que resolve o ponto levantado pelo Pablo: parte
// dos colaboradores tem DOIS locais de chegada — o ponto de DDS (comum a
// todos) e a área de Serviço em que foram alocados. Sem vínculo, a
// pessoa não consegue registrar presença em lugar nenhum (proposital: o
// vínculo é a alocação). Só entram aqui áreas do tipo 'dds' ou 'servico'
// — área do tipo Operação (pátio/produção de VTI) não tem relação com
// presença.
export default function ColaboradoresCadastro({ permissoes }) {
  const temAcesso = Boolean(permissoes.acessos?.colaboradores);
  const perm = { criar: temAcesso, editar: temAcesso, deletar: temAcesso };

  const [colaboradores, setColaboradores] = useState([]);
  const [areas, setAreas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [formAberto, setFormAberto] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState(COLABORADOR_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    const unsubColabs = onSnapshot(
      query(collection(db, 'colaboradores'), orderBy('nome')),
      (snap) => {
        setColaboradores(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setCarregando(false);
      },
      () => setCarregando(false)
    );
    const unsubAreas = onSnapshot(query(collection(db, 'areas'), orderBy('nome')), (snap) => {
      setAreas(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => {
      unsubColabs();
      unsubAreas();
    };
  }, []);

  // Só áreas de presença (DDS ou Serviço) entram na alocação do
  // colaborador — Operação (pátio/produção de VTI) é sobre movimentação
  // de carga, sem relação com presença de pessoas.
  const areasDds = areas.filter((a) => a.status !== 'inativo' && a.tipo === 'dds');
  const areasTrabalho = areas.filter((a) => a.status !== 'inativo' && a.tipo === 'servico');
  const areasPresenca = [...areasDds, ...areasTrabalho];
  const nomeArea = (id) => areas.find((a) => a.id === id)?.nome || '';

  const abrirNovo = () => {
    setForm({ ...COLABORADOR_VAZIO, areaDdsId: areasDds.length === 1 ? areasDds[0].id : '' });
    setEditandoId(null);
    setFormAberto(true);
    setErro('');
  };

  const abrirEdicao = (colaborador) => {
    setForm({
      nome: colaborador.nome || '',
      cpf: formatarCpf(colaborador.cpf || ''),
      areaDdsId: colaborador.areaDdsId || '',
      areaTrabalhoId: colaborador.areaTrabalhoId || '',
      ativo: colaborador.ativo !== false
    });
    setEditandoId(colaborador.id);
    setFormAberto(true);
    setErro('');
  };

  const cancelar = () => {
    setFormAberto(false);
    setEditandoId(null);
    setForm(COLABORADOR_VAZIO);
    setErro('');
  };

  const salvar = async () => {
    if (!form.nome.trim()) {
      setErro('Informe o nome do colaborador.');
      return;
    }
    const cpfLimpo = normalizarCpf(form.cpf);
    if (!validarCpf(cpfLimpo)) {
      setErro('CPF inválido — confira os números digitados.');
      return;
    }
    // A tela de presença identifica a pessoa só pelo CPF, então ele
    // precisa ser único entre os colaboradores ativos.
    const colisao = colaboradores.some(
      (c) => c.id !== editandoId && c.ativo !== false && normalizarCpf(c.cpf) === cpfLimpo
    );
    if (colisao) {
      setErro('Já existe um colaborador ativo com esse CPF.');
      return;
    }
    if (!form.areaDdsId && !form.areaTrabalhoId) {
      setErro('Vincule pelo menos uma área (DDS ou Serviço) — é ela que libera o registro de presença.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      const payload = {
        nome: form.nome.trim(),
        cpf: cpfLimpo,
        areaDdsId: form.areaDdsId || null,
        areaTrabalhoId: form.areaTrabalhoId || null,
        ativo: form.ativo
      };
      if (editandoId) {
        await updateDoc(doc(db, 'colaboradores', editandoId), payload);
      } else {
        await addDoc(collection(db, 'colaboradores'), payload);
      }
      cancelar();
    } catch (e) {
      setErro('Falha ao salvar o colaborador. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (colaborador) => {
    if (!window.confirm(`Excluir o colaborador "${colaborador.nome}"?`)) return;
    try {
      await deleteDoc(doc(db, 'colaboradores', colaborador.id));
    } catch (e) {
      setErro('Falha ao excluir. Tente novamente.');
    }
  };

  return (
    <div>
      <div style={ui.sectionHeaderRow}>
        <h2 style={ui.sectionTitle}>Colaboradores</h2>
        {perm.criar && !formAberto && (
          <button style={ui.primaryButton} onClick={abrirNovo} disabled={areasPresenca.length === 0}>
            ➕ Novo colaborador
          </button>
        )}
      </div>

      {areasPresenca.length === 0 && (
        <p style={ui.placeholderNote}>
          Cadastre as áreas de serviço primeiro (Cadastros → Operação → Área) — é o vínculo com a
          área que libera o registro de presença do colaborador.
        </p>
      )}

      {erro && <div style={ui.erro}>❌ {erro}</div>}

      {formAberto && (
        <div style={ui.formCard}>
          <h3 style={{ marginTop: 0 }}>{editandoId ? 'Editar colaborador' : 'Novo colaborador'}</h3>

          <div style={ui.formGrid}>
            <label style={ui.label}>
              Nome completo *
              <input style={ui.input} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </label>
            <label style={ui.label}>
              CPF *
              <input
                style={ui.input}
                value={form.cpf}
                onChange={(e) => setForm({ ...form, cpf: formatarCpf(e.target.value) })}
                placeholder="000.000.000-00"
                maxLength={14}
              />
              <span style={styles.ajuda}>É o CPF que identifica a pessoa no registro de presença.</span>
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

          <h4 style={styles.subtitulo}>Alocação — onde este colaborador registra presença</h4>
          <div style={styles.alocacaoBox}>
            <label style={{ ...ui.label, maxWidth: 340 }}>
              Ponto de DDS (chegada)
              <select
                style={ui.input}
                value={form.areaDdsId}
                onChange={(e) => setForm({ ...form, areaDdsId: e.target.value })}
              >
                <option value="">Nenhum</option>
                {areasDds.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nome}
                  </option>
                ))}
              </select>
              <span style={styles.ajuda}>Registra só a chegada, sem saída.</span>
            </label>

            <label style={{ ...ui.label, maxWidth: 340, marginTop: 14 }}>
              Área de Serviço (chegada e saída)
              <select
                style={ui.input}
                value={form.areaTrabalhoId}
                onChange={(e) => setForm({ ...form, areaTrabalhoId: e.target.value })}
              >
                <option value="">Nenhuma</option>
                {areasTrabalho.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nome}
                  </option>
                ))}
              </select>
              <span style={styles.ajuda}>Um colaborador só pode ter uma Área de Serviço.</span>
            </label>
          </div>

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
        <p>Carregando colaboradores...</p>
      ) : colaboradores.length === 0 ? (
        <p style={ui.placeholderNote}>Nenhum colaborador cadastrado ainda.</p>
      ) : (
        <div style={ui.tableWrapper}>
          <table style={ui.table}>
            <thead>
              <tr>
                <th style={ui.th}>Nome</th>
                <th style={ui.th}>CPF</th>
                <th style={ui.th}>DDS</th>
                <th style={ui.th}>Área de Serviço</th>
                <th style={ui.th}>Status</th>
                <th style={ui.th}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {colaboradores.map((c) => (
                <tr key={c.id}>
                  <td style={ui.td}>{c.nome}</td>
                  <td style={ui.td}>{formatarCpf(c.cpf)}</td>
                  <td style={ui.td}>{nomeArea(c.areaDdsId) || <span style={{ color: '#999' }}>—</span>}</td>
                  <td style={ui.td}>
                    {c.areaTrabalhoId ? (
                      <span style={{ ...ui.badge, ...ui.badgeAzul }}>{nomeArea(c.areaTrabalhoId)}</span>
                    ) : (
                      <span style={{ color: '#999' }}>—</span>
                    )}
                  </td>
                  <td style={ui.td}>
                    <span style={{ ...ui.badge, ...(c.ativo !== false ? ui.badgeVerde : ui.badgeCinza) }}>
                      {c.ativo !== false ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td style={ui.td}>
                    {perm.editar && (
                      <button style={ui.linkButton} onClick={() => abrirEdicao(c)}>
                        Editar
                      </button>
                    )}
                    {perm.deletar && (
                      <button style={{ ...ui.linkButton, color: '#D32F2F' }} onClick={() => excluir(c)}>
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

      <p style={{ ...ui.placeholderNote, marginTop: 18 }}>
        Legenda: <strong>DDS</strong> registra só chegada; <strong>Serviço</strong> registra
        chegada e saída.
      </p>
    </div>
  );
}

const styles = {
  ajuda: { fontSize: 12, color: '#777', fontWeight: 400 },
  subtitulo: { margin: '18px 0 8px', color: NAVY },
  alocacaoBox: { background: '#F8F9FB', borderRadius: 8, padding: 16, marginBottom: 16 }
};

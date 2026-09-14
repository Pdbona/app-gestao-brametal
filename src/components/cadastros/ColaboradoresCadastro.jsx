import React, { useEffect, useState } from 'react';
import { db, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy } from '../../lib/db';
import { ui, NAVY } from '../../lib/styles';
import { formatarCpf, normalizarCpf, validarCpf } from '../../lib/cpf';
import { PERFIL_ADMIN_PADRAO } from '../../lib/permissoes';

const COLABORADOR_VAZIO = {
  nome: '',
  cpf: '',
  perfilId: '',
  areaDdsId: '',
  areasTrabalhoIds: [],
  turnoPadraoId: '',
  ativo: true
};

// Base de colaboradores da ML que atuam na Brametal. É contra este
// cadastro que a tela pública de presença valida quem está registrando.
//
// O "cargo" do colaborador é o mesmo PERFIL usado em Cadastros → Usuários
// → Perfil (pedido do Pablo, 10/09/2026: "a Função na verdade é perfil,
// deve seguir a tela de cadastro de perfil") — não existe mais uma lista
// própria de funções (Conferente/Tratorista/...) fixa no código; a lista
// vem de `perfis`, a mesma fonte que os Usuários do sistema usam pra
// permissão de tela. Um colaborador NÃO precisa logar no sistema (ele só
// aparece pelo CPF na tela pública de presença) — o perfil aqui é
// descritivo/organizacional, não concede acesso por si só.
//
// O vínculo com Área é o que resolve o ponto levantado pelo Pablo: parte
// dos colaboradores tem DOIS locais de chegada — o ponto de DDS (comum a
// todos) e a área de trabalho em que foram alocados. Sem vínculo, a
// pessoa não consegue registrar presença em lugar nenhum (proposital: o
// vínculo é a alocação). Só entram aqui áreas do tipo 'servico' — Área de
// Operação (pátio/produção de VTI) não tem relação com presença.
export default function ColaboradoresCadastro({ permissoes }) {
  const temAcesso = Boolean(permissoes.acessos?.colaboradores);
  const perm = { criar: temAcesso, editar: temAcesso, deletar: temAcesso };

  const [colaboradores, setColaboradores] = useState([]);
  const [areas, setAreas] = useState([]);
  const [turnos, setTurnos] = useState([]);
  const [perfis, setPerfis] = useState([]);
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
    const unsubTurnos = onSnapshot(query(collection(db, 'turnos'), orderBy('horaInicio')), (snap) => {
      setTurnos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubPerfis = onSnapshot(query(collection(db, 'perfis'), orderBy('nome')), (snap) => {
      setPerfis(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => {
      unsubColabs();
      unsubAreas();
      unsubTurnos();
      unsubPerfis();
    };
  }, []);

  // Só áreas de SERVIÇO entram na alocação do colaborador — Área de
  // Operação (pátio/produção de VTI) é sobre movimentação de carga, sem
  // relação com presença de pessoas.
  const areasServico = areas.filter((a) => a.status !== 'inativo' && a.tipo === 'servico');
  const areasDds = areasServico.filter((a) => a.subtipo === 'dds');
  const areasTrabalho = areasServico.filter((a) => a.subtipo === 'trabalho');
  const turnosAtivos = turnos.filter((t) => t.ativo !== false);
  const perfisDisponiveis = [PERFIL_ADMIN_PADRAO, ...perfis.filter((p) => p.id !== PERFIL_ADMIN_PADRAO.id)];
  const nomeArea = (id) => areas.find((a) => a.id === id)?.nome || '';
  const nomePerfil = (id) => perfisDisponiveis.find((p) => p.id === id)?.nome || '';

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
      perfilId: colaborador.perfilId || '',
      areaDdsId: colaborador.areaDdsId || '',
      areasTrabalhoIds: Array.isArray(colaborador.areasTrabalhoIds) ? colaborador.areasTrabalhoIds : [],
      turnoPadraoId: colaborador.turnoPadraoId || '',
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

  const toggleAreaTrabalho = (areaId) => {
    setForm((f) => {
      const jaTem = f.areasTrabalhoIds.indexOf(areaId) >= 0;
      return {
        ...f,
        areasTrabalhoIds: jaTem ? f.areasTrabalhoIds.filter((id) => id !== areaId) : [...f.areasTrabalhoIds, areaId]
      };
    });
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
    if (!form.perfilId) {
      setErro('Selecione o perfil do colaborador.');
      return;
    }
    if (!form.areaDdsId && form.areasTrabalhoIds.length === 0) {
      setErro('Vincule pelo menos uma área (DDS ou área de trabalho) — é ela que libera o registro de presença.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      const payload = {
        nome: form.nome.trim(),
        cpf: cpfLimpo,
        perfilId: form.perfilId,
        areaDdsId: form.areaDdsId || null,
        areasTrabalhoIds: form.areasTrabalhoIds,
        turnoPadraoId: form.turnoPadraoId || null,
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
          <button style={ui.primaryButton} onClick={abrirNovo} disabled={areasServico.length === 0}>
            ➕ Novo colaborador
          </button>
        )}
      </div>

      {areasServico.length === 0 && (
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
              Perfil *
              <select style={ui.input} value={form.perfilId} onChange={(e) => setForm({ ...form, perfilId: e.target.value })}>
                <option value="">Selecione...</option>
                {perfisDisponiveis.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
              <span style={styles.ajuda}>
                Mesma lista de Cadastros → Usuários → Perfil. Cadastre um perfil novo lá (ex:
                Conferente, Tratorista) se ainda não existir.
              </span>
            </label>
            <label style={ui.label}>
              Turno padrão
              <select
                style={ui.input}
                value={form.turnoPadraoId}
                onChange={(e) => setForm({ ...form, turnoPadraoId: e.target.value })}
              >
                <option value="">Perguntar no registro</option>
                {turnosAtivos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome} ({t.horaInicio}–{t.horaFim})
                  </option>
                ))}
              </select>
              <span style={styles.ajuda}>Se preenchido, o registro já entra nesse turno sem perguntar.</span>
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

            <div style={{ marginTop: 14 }}>
              <div style={styles.rotuloBloco}>Áreas de trabalho (chegada e saída)</div>
              {areasTrabalho.length === 0 ? (
                <p style={ui.placeholderNote}>Nenhuma área de trabalho cadastrada ainda.</p>
              ) : (
                <div style={styles.chipsAreas}>
                  {areasTrabalho.map((a) => {
                    const marcado = form.areasTrabalhoIds.indexOf(a.id) >= 0;
                    return (
                      <label key={a.id} style={{ ...styles.chipArea, ...(marcado ? styles.chipAreaMarcado : {}) }}>
                        <input type="checkbox" checked={marcado} onChange={() => toggleAreaTrabalho(a.id)} />
                        <span>
                          {a.nome}
                          {a.codigo ? ` (${a.codigo})` : ''}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
              <span style={styles.ajuda}>
                Marque mais de uma quando o colaborador circula entre áreas — no registro, a
                geolocalização decide em qual delas ele está.
              </span>
            </div>
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
                <th style={ui.th}>Perfil</th>
                <th style={ui.th}>DDS</th>
                <th style={ui.th}>Áreas de trabalho</th>
                <th style={ui.th}>Status</th>
                <th style={ui.th}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {colaboradores.map((c) => (
                <tr key={c.id}>
                  <td style={ui.td}>{c.nome}</td>
                  <td style={ui.td}>{formatarCpf(c.cpf)}</td>
                  <td style={ui.td}>{nomePerfil(c.perfilId) || <span style={{ color: '#999' }}>—</span>}</td>
                  <td style={ui.td}>{nomeArea(c.areaDdsId) || <span style={{ color: '#999' }}>—</span>}</td>
                  <td style={ui.td}>
                    {(c.areasTrabalhoIds || []).length === 0 ? (
                      <span style={{ color: '#999' }}>—</span>
                    ) : (
                      (c.areasTrabalhoIds || []).map((id) => (
                        <span key={id} style={{ ...ui.badge, ...ui.badgeAzul, marginRight: 4 }}>
                          {nomeArea(id) || id}
                        </span>
                      ))
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
        Legenda de área de serviço: <strong>Ponto de DDS</strong> registra só chegada;{' '}
        <strong>Área de trabalho</strong> registra chegada e saída.
      </p>
    </div>
  );
}

const styles = {
  ajuda: { fontSize: 12, color: '#777', fontWeight: 400 },
  subtitulo: { margin: '18px 0 8px', color: NAVY },
  alocacaoBox: { background: '#F8F9FB', borderRadius: 8, padding: 16, marginBottom: 16 },
  rotuloBloco: { fontSize: 13, fontWeight: 600, color: '#444', marginBottom: 6 },
  chipsAreas: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  chipArea: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 12px',
    background: '#FFF',
    border: '1px solid #E0E0E0',
    borderRadius: 20,
    fontSize: 13,
    cursor: 'pointer',
    userSelect: 'none'
  },
  chipAreaMarcado: { borderColor: '#FF6B00', background: '#FFF7EF', fontWeight: 600 }
};

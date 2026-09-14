import React, { useEffect, useState } from 'react';
import { db, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy } from '../../lib/db';
import { ui, NAVY } from '../../lib/styles';
import { PERFIL_ADMIN_PADRAO, permissoesVazias } from '../../lib/permissoes';
import PermissoesMatrix from '../PermissoesMatrix';

const PERFIL_VAZIO = { nome: '', descricao: '', permissoes: permissoesVazias() };

// `compacto` renderiza um card menor (lista em vez de tabela) — é assim
// que esta tela aparece ao lado de Usuários no grupo "Usuários" de
// Cadastros, já que perfil se mexe raramente e usuário todo dia.
export default function PerfisCadastro({ permissoes, compacto = false }) {
  const temAcesso = Boolean(permissoes.acessos?.perfis);
  const perm = { criar: temAcesso, editar: temAcesso, deletar: temAcesso };

  const [perfis, setPerfis] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [formAberto, setFormAberto] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState(PERFIL_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, 'perfis'), orderBy('nome')),
      (snap) => {
        setPerfis(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setCarregando(false);
      },
      () => setCarregando(false)
    );
    return () => unsubscribe();
  }, []);

  // O perfil de sistema (Administrador) sempre aparece primeiro, mesmo
  // com a base zerada — é ele que garante o primeiro acesso.
  const listaCompleta = [PERFIL_ADMIN_PADRAO, ...perfis.filter((p) => p.id !== PERFIL_ADMIN_PADRAO.id)];

  const abrirNovo = () => {
    setForm(PERFIL_VAZIO);
    setEditandoId(null);
    setFormAberto(true);
    setErro('');
  };

  const abrirEdicao = (perfil) => {
    setForm({
      nome: perfil.nome || '',
      descricao: perfil.descricao || '',
      permissoes: perfil.permissoes || permissoesVazias()
    });
    setEditandoId(perfil.id);
    setFormAberto(true);
    setErro('');
  };

  const cancelar = () => {
    setFormAberto(false);
    setEditandoId(null);
    setForm(PERFIL_VAZIO);
    setErro('');
  };

  const salvar = async () => {
    if (!form.nome.trim()) {
      setErro('Informe o nome do perfil.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      const payload = {
        nome: form.nome.trim(),
        descricao: form.descricao.trim(),
        permissoes: form.permissoes
      };
      if (editandoId) {
        await updateDoc(doc(db, 'perfis', editandoId), payload);
      } else {
        await addDoc(collection(db, 'perfis'), payload);
      }
      cancelar();
    } catch (e) {
      setErro('Falha ao salvar o perfil. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (perfil) => {
    if (!window.confirm(`Excluir o perfil "${perfil.nome}"? Usuários vinculados ficam sem perfil válido.`)) return;
    try {
      await deleteDoc(doc(db, 'perfis', perfil.id));
    } catch (e) {
      setErro('Falha ao excluir. Tente novamente.');
    }
  };

  return (
    <div style={compacto ? styles.cardCompacto : undefined}>
      <div style={ui.sectionHeaderRow}>
        {compacto ? <h3 style={styles.tituloCompacto}>Perfis</h3> : <h2 style={ui.sectionTitle}>Perfis</h2>}
        {perm.criar && !formAberto && (
          <button style={compacto ? ui.smallButton : ui.primaryButton} onClick={abrirNovo}>
            ➕ {compacto ? 'Perfil' : 'Novo perfil'}
          </button>
        )}
      </div>

      {erro && <div style={ui.erro}>❌ {erro}</div>}

      {formAberto && (
        <div style={ui.formCard}>
          <h3 style={{ marginTop: 0 }}>{editandoId ? 'Editar perfil' : 'Novo perfil'}</h3>

          <div style={ui.formGrid}>
            <label style={ui.label}>
              Nome do perfil *
              <input
                style={ui.input}
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex: Conferente"
              />
            </label>
            <label style={ui.label}>
              Descrição
              <input
                style={ui.input}
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              />
            </label>
          </div>

          <div style={{ marginTop: 10, marginBottom: 16 }}>
            <PermissoesMatrix value={form.permissoes} onChange={(p) => setForm({ ...form, permissoes: p })} />
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

      {carregando && <p style={ui.placeholderNote}>Carregando perfis...</p>}

      {compacto ? (
        <div style={styles.listaCompacta}>
          {listaCompleta.map((p) => (
            <div key={p.id} style={styles.itemCompacto}>
              <div>
                <strong>{p.nome}</strong>{' '}
                <span style={{ ...ui.badge, ...(p.sistema ? ui.badgeAzul : ui.badgeCinza) }}>
                  {p.sistema ? 'Sistema' : 'Personalizado'}
                </span>
              </div>
              <div>
                {p.sistema ? (
                  <span style={{ color: '#999', fontSize: 12 }}>Fixo</span>
                ) : (
                  <>
                    {perm.editar && (
                      <button style={ui.linkButton} onClick={() => abrirEdicao(p)}>
                        Editar
                      </button>
                    )}
                    {perm.deletar && (
                      <button style={{ ...ui.linkButton, color: '#D32F2F' }} onClick={() => excluir(p)}>
                        Excluir
                      </button>
                    )}
                  </>
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
                <th style={ui.th}>Descrição</th>
                <th style={ui.th}>Tipo</th>
                <th style={ui.th}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {listaCompleta.map((p) => (
                <tr key={p.id}>
                  <td style={ui.td}>{p.nome}</td>
                  <td style={ui.td}>{p.descricao || '-'}</td>
                  <td style={ui.td}>
                    <span style={{ ...ui.badge, ...(p.sistema ? ui.badgeAzul : ui.badgeCinza) }}>
                      {p.sistema ? 'Sistema' : 'Personalizado'}
                    </span>
                  </td>
                  <td style={ui.td}>
                    {p.sistema ? (
                      <span style={{ color: '#999', fontSize: 13 }}>Fixo — não editável</span>
                    ) : (
                      <>
                        {perm.editar && (
                          <button style={ui.linkButton} onClick={() => abrirEdicao(p)}>
                            Editar
                          </button>
                        )}
                        {perm.deletar && (
                          <button style={{ ...ui.linkButton, color: '#D32F2F' }} onClick={() => excluir(p)}>
                            Excluir
                          </button>
                        )}
                      </>
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
  listaCompacta: { display: 'flex', flexDirection: 'column', gap: 10 },
  itemCompacto: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
    padding: '8px 0',
    borderBottom: '1px solid #EEE',
    fontSize: 13
  }
};

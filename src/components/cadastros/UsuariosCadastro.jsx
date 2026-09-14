import React, { useEffect, useState } from 'react';
import { db, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy } from '../../lib/db';
import { ui } from '../../lib/styles';
import { PERFIL_ADMIN_PADRAO, SENHA_ADMIN_PADRAO } from '../../lib/permissoes';
import PermissoesMatrix from '../PermissoesMatrix';

const USUARIO_VAZIO = { nome: '', senha: '', perfilId: '', ativo: true };

// Usuário = quem entra no sistema (diferente de Colaborador, que é quem
// registra presença por CPF e pode nunca abrir o app). O login é só por
// SENHA, sem campo de usuário — a senha sozinha identifica a conta, então
// ela precisa ser única entre usuários ativos.
export default function UsuariosCadastro({ permissoes }) {
  const temAcesso = Boolean(permissoes.acessos?.usuarios);
  const perm = { criar: temAcesso, editar: temAcesso, deletar: temAcesso };

  const [usuarios, setUsuarios] = useState([]);
  const [perfis, setPerfis] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [formAberto, setFormAberto] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState(USUARIO_VAZIO);
  const [personalizarPerm, setPersonalizarPerm] = useState(false);
  const [permCustom, setPermCustom] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    const unsubUsuarios = onSnapshot(
      query(collection(db, 'usuarios'), orderBy('nome')),
      (snap) => {
        setUsuarios(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setCarregando(false);
      },
      () => setCarregando(false)
    );
    const unsubPerfis = onSnapshot(query(collection(db, 'perfis'), orderBy('nome')), (snap) => {
      setPerfis(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => {
      unsubUsuarios();
      unsubPerfis();
    };
  }, []);

  const perfisDisponiveis = [PERFIL_ADMIN_PADRAO, ...perfis.filter((p) => p.id !== PERFIL_ADMIN_PADRAO.id)];
  const getPerfil = (id) => perfisDisponiveis.find((p) => p.id === id) || PERFIL_ADMIN_PADRAO;

  const abrirNovo = () => {
    setForm(USUARIO_VAZIO);
    setEditandoId(null);
    setPersonalizarPerm(false);
    setPermCustom(null);
    setFormAberto(true);
    setErro('');
  };

  const abrirEdicao = (usuario) => {
    setForm({
      nome: usuario.nome || '',
      senha: usuario.senha || '',
      perfilId: usuario.perfilId || '',
      ativo: usuario.ativo !== false
    });
    setPersonalizarPerm(Boolean(usuario.permissoesCustom));
    setPermCustom(usuario.permissoesCustom || null);
    setEditandoId(usuario.id);
    setFormAberto(true);
    setErro('');
  };

  const cancelar = () => {
    setFormAberto(false);
    setEditandoId(null);
    setForm(USUARIO_VAZIO);
    setPersonalizarPerm(false);
    setPermCustom(null);
    setErro('');
  };

  const togglePersonalizar = (checked) => {
    setPersonalizarPerm(checked);
    if (checked && !permCustom) {
      // Ponto de partida: cópia das permissões do perfil selecionado.
      setPermCustom(JSON.parse(JSON.stringify(getPerfil(form.perfilId).permissoes)));
    }
  };

  const salvar = async () => {
    if (!form.nome.trim()) {
      setErro('Informe o nome do usuário.');
      return;
    }
    if (!form.senha.trim()) {
      setErro('Informe a senha.');
      return;
    }
    if (form.senha.trim() === SENHA_ADMIN_PADRAO) {
      setErro('Essa senha é a do administrador padrão do sistema — escolha outra.');
      return;
    }
    if (!form.perfilId) {
      setErro('Selecione o perfil.');
      return;
    }
    const colisao = usuarios.some((u) => u.id !== editandoId && u.ativo !== false && u.senha === form.senha);
    if (colisao) {
      setErro('Essa senha já está em uso por outro usuário ativo. O login é só por senha, então cada uma precisa ser única.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      // NOTA: senha em texto simples — mesmo padrão dos apps SBS v1 (uso
      // interno, sem autenticação de verdade). Evoluir pra hash antes de
      // abrir o acesso à Brametal.
      const payload = {
        nome: form.nome.trim(),
        senha: form.senha.trim(),
        perfilId: form.perfilId,
        ativo: form.ativo,
        permissoesCustom: personalizarPerm ? permCustom : null
      };
      if (editandoId) {
        await updateDoc(doc(db, 'usuarios', editandoId), payload);
      } else {
        await addDoc(collection(db, 'usuarios'), payload);
      }
      cancelar();
    } catch (e) {
      setErro('Falha ao salvar o usuário. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (usuario) => {
    if (!window.confirm(`Excluir o usuário "${usuario.nome}"?`)) return;
    try {
      await deleteDoc(doc(db, 'usuarios', usuario.id));
    } catch (e) {
      setErro('Falha ao excluir. Tente novamente.');
    }
  };

  return (
    <div>
      <div style={ui.sectionHeaderRow}>
        <h2 style={ui.sectionTitle}>Usuários</h2>
        {perm.criar && !formAberto && (
          <button style={ui.primaryButton} onClick={abrirNovo}>
            ➕ Novo usuário
          </button>
        )}
      </div>

      {erro && <div style={ui.erro}>❌ {erro}</div>}

      {formAberto && (
        <div style={ui.formCard}>
          <h3 style={{ marginTop: 0 }}>{editandoId ? 'Editar usuário' : 'Novo usuário'}</h3>

          <div style={ui.formGrid}>
            <label style={ui.label}>
              Nome *
              <input style={ui.input} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </label>
            <label style={ui.label}>
              Senha *
              <input style={ui.input} value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} />
              <span style={styles.ajuda}>Única por usuário — é ela que identifica a conta no login.</span>
            </label>
            <label style={ui.label}>
              Perfil *
              <select
                style={ui.input}
                value={form.perfilId}
                onChange={(e) => setForm({ ...form, perfilId: e.target.value })}
              >
                <option value="">Selecione...</option>
                {perfisDisponiveis.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
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

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 10 }}>
            <input
              type="checkbox"
              checked={personalizarPerm}
              disabled={!form.perfilId}
              onChange={(e) => togglePersonalizar(e.target.checked)}
            />
            Personalizar permissões deste usuário (sobrepõe o perfil só para ele)
            {!form.perfilId && <span style={{ fontSize: 12, color: '#999' }}>&nbsp;— selecione um perfil primeiro</span>}
          </label>

          {personalizarPerm && permCustom && (
            <div style={{ marginBottom: 16, padding: 16, background: '#F8F9FB', borderRadius: 6 }}>
              <PermissoesMatrix value={permCustom} onChange={setPermCustom} />
            </div>
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
        <p>Carregando usuários...</p>
      ) : usuarios.length === 0 ? (
        <p style={ui.placeholderNote}>
          Nenhum usuário cadastrado ainda — o acesso de administrador padrão (senha {SENHA_ADMIN_PADRAO})
          continua valendo.
        </p>
      ) : (
        <div style={ui.tableWrapper}>
          <table style={ui.table}>
            <thead>
              <tr>
                <th style={ui.th}>Nome</th>
                <th style={ui.th}>Perfil</th>
                <th style={ui.th}>Permissões</th>
                <th style={ui.th}>Status</th>
                <th style={ui.th}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id}>
                  <td style={ui.td}>{u.nome}</td>
                  <td style={ui.td}>{getPerfil(u.perfilId).nome}</td>
                  <td style={ui.td}>
                    {u.permissoesCustom ? (
                      <span style={{ ...ui.badge, ...ui.badgeLaranja }}>Personalizada</span>
                    ) : (
                      <span style={{ ...ui.badge, ...ui.badgeCinza }}>Padrão do perfil</span>
                    )}
                  </td>
                  <td style={ui.td}>
                    <span style={{ ...ui.badge, ...(u.ativo !== false ? ui.badgeVerde : ui.badgeCinza) }}>
                      {u.ativo !== false ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td style={ui.td}>
                    {perm.editar && (
                      <button style={ui.linkButton} onClick={() => abrirEdicao(u)}>
                        Editar
                      </button>
                    )}
                    {perm.deletar && (
                      <button style={{ ...ui.linkButton, color: '#D32F2F' }} onClick={() => excluir(u)}>
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
  ajuda: { fontSize: 12, color: '#777', fontWeight: 400 }
};

import React, { useEffect, useState } from 'react';
import {
  db,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp
} from '../../lib/db';
import { ui, NAVY } from '../../lib/styles';

// Endereço é o primeiro cadastro da Fase 2 (plano de 11/09/2026): um
// CÓDIGO ÚNICO (texto livre, sem hierarquia Pátio→Bloco — decisão do
// Pablo) que vive DENTRO de uma área de Operação. O fluxo é sempre:
// escolhe a área primeiro, depois cadastra os códigos dentro dela — por
// isso a tela pede a área ANTES de mostrar qualquer formulário ou lista.
//
// ATÉ 14/09/2026 só áreas de Operação/Pátio ganhavam Endereço (Operação/
// GAL não) — o Pablo pediu pra simplificar o Tipo de Área e juntar
// Pátio+GAL num tipo só ('operacao'), então agora QUALQUER área de
// Operação pode ganhar Endereço.
//
// Endereçamento de UD (quem usa este cadastro) ainda não existe — este é
// só o pré-requisito. A permissão 'enderecos' não está travada a nenhum
// perfil específico de propósito (pedido do Pablo): ele atribui depois a
// quem for endereçar.
export default function EnderecosCadastro({ permissoes, compacto = false }) {
  const temAcesso = Boolean(permissoes.acessos?.enderecos);
  const perm = { criar: temAcesso, editar: temAcesso, deletar: temAcesso };

  const [areasOperacao, setAreasOperacao] = useState([]);
  const [carregandoAreas, setCarregandoAreas] = useState(true);
  const [areaOperacaoId, setAreaOperacaoId] = useState('');

  const [enderecos, setEnderecos] = useState([]);
  const [carregandoEnderecos, setCarregandoEnderecos] = useState(false);

  const [codigoNovo, setCodigoNovo] = useState('');
  const [editandoId, setEditandoId] = useState(null);
  const [codigoEdicao, setCodigoEdicao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  // Qualquer área do tipo Operação recebe endereçamento (até 14/09/2026
  // isso era só Pátio, não GAL — ver comentário no topo do arquivo).
  useEffect(() => {
    const q = query(collection(db, 'areas'), where('tipo', '==', 'operacao'), orderBy('nome'));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setAreasOperacao(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setCarregandoAreas(false);
      },
      () => setCarregandoAreas(false)
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!areaOperacaoId) {
      setEnderecos([]);
      return undefined;
    }
    setCarregandoEnderecos(true);
    const q = query(collection(db, 'enderecos'), where('areaId', '==', areaOperacaoId), orderBy('codigo'));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setEnderecos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setCarregandoEnderecos(false);
      },
      () => setCarregandoEnderecos(false)
    );
    return () => unsubscribe();
  }, [areaOperacaoId]);

  const areaOperacaoAtual = areasOperacao.find((p) => p.id === areaOperacaoId) || null;

  const existeCodigo = (codigo, ignorarId) =>
    enderecos.some((e) => e.id !== ignorarId && (e.codigo || '').trim().toLowerCase() === codigo.trim().toLowerCase());

  const adicionar = async () => {
    const codigo = codigoNovo.trim();
    if (!codigo) {
      setErro('Informe o código do endereço.');
      return;
    }
    if (existeCodigo(codigo)) {
      setErro('Já existe esse código nesta área.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      await addDoc(collection(db, 'enderecos'), {
        areaId: areaOperacaoId,
        areaNome: areaOperacaoAtual?.nome || '',
        codigo,
        ativo: true,
        criadoEm: serverTimestamp()
      });
      setCodigoNovo('');
    } catch (e) {
      setErro('Falha ao salvar o endereço. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  const abrirEdicao = (endereco) => {
    setEditandoId(endereco.id);
    setCodigoEdicao(endereco.codigo || '');
    setErro('');
  };

  const cancelarEdicao = () => {
    setEditandoId(null);
    setCodigoEdicao('');
    setErro('');
  };

  const salvarEdicao = async () => {
    const codigo = codigoEdicao.trim();
    if (!codigo) {
      setErro('Informe o código do endereço.');
      return;
    }
    if (existeCodigo(codigo, editandoId)) {
      setErro('Já existe esse código nesta área.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      await updateDoc(doc(db, 'enderecos', editandoId), { codigo });
      cancelarEdicao();
    } catch (e) {
      setErro('Falha ao salvar o endereço. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  const alternarAtivo = async (endereco) => {
    try {
      await updateDoc(doc(db, 'enderecos', endereco.id), { ativo: !(endereco.ativo !== false) });
    } catch (e) {
      setErro('Falha ao atualizar o status. Tente novamente.');
    }
  };

  const excluir = async (endereco) => {
    if (!window.confirm(`Excluir o endereço "${endereco.codigo}"?`)) return;
    try {
      await deleteDoc(doc(db, 'enderecos', endereco.id));
    } catch (e) {
      setErro('Falha ao excluir. Tente novamente.');
    }
  };

  return (
    <div style={compacto ? styles.cardCompacto : undefined}>
      <div style={ui.sectionHeaderRow}>
        {compacto ? <h3 style={styles.tituloCompacto}>Endereço</h3> : <h2 style={ui.sectionTitle}>Endereços</h2>}
      </div>

      {!compacto && (
        <p style={ui.placeholderNote}>
          Código livre (sem hierarquia) dentro de uma área de <strong>Operação</strong>. Escolha a
          área abaixo e cadastre os códigos que ficam dentro dela.
        </p>
      )}

      {erro && <div style={ui.erro}>❌ {erro}</div>}

      {carregandoAreas ? (
        <p>Carregando áreas...</p>
      ) : areasOperacao.length === 0 ? (
        <p style={ui.placeholderNote}>
          Nenhuma área de Operação cadastrada ainda — crie uma em Cadastros → Operação → Área antes
          de cadastrar endereços.
        </p>
      ) : (
        <>
          <label style={{ ...ui.label, marginBottom: 14 }}>
            Área de Operação *
            <select style={ui.input} value={areaOperacaoId} onChange={(e) => setAreaOperacaoId(e.target.value)}>
              <option value="">Selecione...</option>
              {areasOperacao.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </label>

          {areaOperacaoId && (
            <>
              {perm.criar && (
                <div style={styles.linhaAdicionar}>
                  <input
                    style={{ ...ui.input, flex: 1 }}
                    value={codigoNovo}
                    onChange={(e) => setCodigoNovo(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && adicionar()}
                    placeholder="Ex: A-12"
                  />
                  <button style={compacto ? ui.smallButton : ui.primaryButton} onClick={adicionar} disabled={salvando}>
                    ➕ Adicionar
                  </button>
                </div>
              )}

              {carregandoEnderecos ? (
                <p>Carregando endereços...</p>
              ) : enderecos.length === 0 ? (
                <p style={ui.placeholderNote}>Nenhum endereço cadastrado nesta área ainda.</p>
              ) : (
                <div style={styles.listaCompacta}>
                  {enderecos.map((e) => (
                    <div key={e.id} style={styles.itemCompacto}>
                      {editandoId === e.id ? (
                        <>
                          <input
                            style={{ ...ui.input, flex: 1 }}
                            value={codigoEdicao}
                            onChange={(ev) => setCodigoEdicao(ev.target.value)}
                            onKeyDown={(ev) => ev.key === 'Enter' && salvarEdicao()}
                            autoFocus
                          />
                          <div>
                            <button style={ui.linkButton} onClick={salvarEdicao} disabled={salvando}>
                              Salvar
                            </button>
                            <button style={ui.linkButton} onClick={cancelarEdicao} disabled={salvando}>
                              Cancelar
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <strong>{e.codigo}</strong>
                            <span style={{ ...ui.badge, ...(e.ativo !== false ? ui.badgeVerde : ui.badgeCinza) }}>
                              {e.ativo !== false ? 'Ativo' : 'Inativo'}
                            </span>
                          </div>
                          <div>
                            {perm.editar && (
                              <button style={ui.linkButton} onClick={() => abrirEdicao(e)}>
                                Editar
                              </button>
                            )}
                            {perm.editar && (
                              <button style={ui.linkButton} onClick={() => alternarAtivo(e)}>
                                {e.ativo !== false ? 'Desativar' : 'Ativar'}
                              </button>
                            )}
                            {perm.deletar && (
                              <button style={{ ...ui.linkButton, color: '#D32F2F' }} onClick={() => excluir(e)}>
                                Excluir
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
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
  linhaAdicionar: { display: 'flex', gap: 8, marginBottom: 14 },
  listaCompacta: { display: 'flex', flexDirection: 'column', gap: 8 },
  itemCompacto: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    padding: '8px 0',
    borderBottom: '1px solid #EEE',
    fontSize: 13
  }
};

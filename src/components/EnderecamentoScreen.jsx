import React, { useEffect, useState } from 'react';
import { db, collection, updateDoc, doc, onSnapshot, query, where, orderBy, serverTimestamp } from '../lib/db';
import { ui, NAVY } from '../lib/styles';
import { rotuloStatusVti, badgeStatusVti } from '../lib/vti';

// Tela 3 (17/09/2026, FASE_2_TELAS_1-3_BRAMETAL.md): Endereçamento/
// Bipagem no pátio — o Conferente já está NO PÁTIO (depois do tratorista
// confirmar a chegada na Tela 2), bipa cada UD da VTI e associa a um
// Endereço cadastrado (EnderecosCadastro.jsx). É o "passo 5" do plano de
// 11/09/2026 (PLANO_FASE2_VTI_UD_11set2026.md), com a distinção de
// destino por pátio que a importação de planilha (Tela 1) trouxe: uma UD
// só é aceita aqui se `destinoAreaId` bater com o pátio atual, ou se ela
// não tiver destino definido (veio da Bipagem na origem, Fluxo B, que
// não capta essa informação).
//
// Sem separar `uds` numa 2ª coleção: em vez de "sair da VTI" mudando
// `vtiId` pra null (como o texto do plano original sugeria), a UD
// continua referenciando a VTI (`vtiId`/`vtiNumero`) — só o `status`
// muda pra 'enderecada'. Mantém rastreabilidade (dá pra ver depois de
// qual VTI cada UD veio) sem precisar de uma coleção nova só pra isso.
export default function EnderecamentoScreen() {
  const [areas, setAreas] = useState([]);
  const [carregandoAreas, setCarregandoAreas] = useState(true);
  const [areaId, setAreaId] = useState('');

  const [udsAbertas, setUdsAbertas] = useState([]); // todas com status 'na_vti', qualquer VTI/pátio
  const [vtiEscolhidaId, setVtiEscolhidaId] = useState(null);

  const [enderecos, setEnderecos] = useState([]);
  const [enderecoId, setEnderecoId] = useState('');

  const [codigoUd, setCodigoUd] = useState('');
  const [erro, setErro] = useState('');
  const [bipando, setBipando] = useState(false);
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'areas'), where('tipo', '==', 'operacao'), orderBy('nome'));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setAreas(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((a) => a.status !== 'inativo'));
        setCarregandoAreas(false);
      },
      () => setCarregandoAreas(false)
    );
    return () => unsubscribe();
  }, []);

  // Todas as UDs ainda "na VTI" — consulta única (equality simples, sem
  // índice composto) usada tanto pra montar a lista de VTIs quanto pra
  // saber quantas restam por pátio.
  useEffect(() => {
    const q = query(collection(db, 'uds'), where('status', '==', 'na_vti'));
    const unsubscribe = onSnapshot(q, (snap) => setUdsAbertas(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!areaId) setVtiEscolhidaId(null);
  }, [areaId]);

  const [vtisNaArea, setVtisNaArea] = useState([]);
  useEffect(() => {
    if (!areaId) {
      setVtisNaArea([]);
      return undefined;
    }
    const q = query(collection(db, 'vtis'), where('areaAtualId', '==', areaId));
    const unsubscribe = onSnapshot(q, (snap) => {
      const lista = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((v) => v.status === 'cheia' || v.status === 'parcial');
      setVtisNaArea(lista);
    });
    return () => unsubscribe();
  }, [areaId]);

  useEffect(() => {
    if (!areaId) return undefined;
    const q = query(collection(db, 'enderecos'), where('areaId', '==', areaId), orderBy('codigo'));
    const unsubscribe = onSnapshot(q, (snap) =>
      setEnderecos(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((e) => e.ativo !== false))
    );
    return () => unsubscribe();
  }, [areaId]);

  // UDs desta VTI que ainda faltam ser endereçadas NESTE pátio (sem
  // destino definido conta como "pode ser endereçada em qualquer
  // pátio" — é o caso da Bipagem na origem, que não capta destino).
  const udsParaEsteVtiEPatio = (vtiId) =>
    udsAbertas.filter((u) => u.vtiId === vtiId && (!u.destinoAreaId || u.destinoAreaId === areaId));
  const udsRestantesDaVti = (vtiId) => udsAbertas.filter((u) => u.vtiId === vtiId);

  const vtisComPendencia = vtisNaArea
    .map((v) => ({ vti: v, qtdNestePatio: udsParaEsteVtiEPatio(v.id).length }))
    .filter((x) => x.qtdNestePatio > 0);

  const vtiAtual = vtiEscolhidaId ? vtisNaArea.find((v) => v.id === vtiEscolhidaId) : null;
  const areaAtual = areas.find((a) => a.id === areaId) || null;
  const enderecoAtual = enderecos.find((e) => e.id === enderecoId) || null;

  const abrirVti = (vtiId) => {
    setVtiEscolhidaId(vtiId);
    setEnderecoId('');
    setCodigoUd('');
    setErro('');
    setAviso('');
  };

  const trocarVti = () => {
    setVtiEscolhidaId(null);
    setEnderecoId('');
    setCodigoUd('');
    setErro('');
    setAviso('');
  };

  const encerrarEndereco = () => {
    setEnderecoId('');
    setCodigoUd('');
    setErro('');
  };

  const biparUd = async () => {
    const codigo = codigoUd.trim();
    if (!codigo) {
      setErro('Bipe ou digite o código da UD.');
      return;
    }
    if (!enderecoId) {
      setErro('Selecione o endereço antes de bipar.');
      return;
    }
    setBipando(true);
    setErro('');
    try {
      const encontrada = udsAbertas.find((u) => u.codigo === codigo);
      if (!encontrada) {
        setErro(`UD "${codigo}" não encontrada ou já endereçada/removida.`);
        return;
      }
      if (encontrada.vtiId !== vtiAtual.id) {
        setErro(`"${codigo}" não pertence à VTI ${vtiAtual.numero} (está na VTI ${encontrada.vtiNumero}).`);
        return;
      }
      if (encontrada.destinoAreaId && encontrada.destinoAreaId !== areaId) {
        setErro(`"${codigo}" é para "${encontrada.destinoAreaNome}", não para "${areaAtual?.nome}".`);
        return;
      }
      await updateDoc(doc(db, 'uds', encontrada.id), {
        status: 'enderecada',
        enderecoId,
        enderecoCodigo: enderecoAtual?.codigo || '',
        atualizadoEm: serverTimestamp()
      });
      setCodigoUd('');

      // Recalcula com a UD recém-endereçada já removida da lista local
      // (o onSnapshot ainda não voltou) pra decidir se a VTI terminou.
      const restantesNestePatioDepois = udsParaEsteVtiEPatio(vtiAtual.id).filter((u) => u.id !== encontrada.id);
      const restantesTotalDepois = udsRestantesDaVti(vtiAtual.id).filter((u) => u.id !== encontrada.id);
      if (restantesTotalDepois.length === 0) {
        await updateDoc(doc(db, 'vtis', vtiAtual.id), { status: 'vazia', ultimaMovimentacaoEm: serverTimestamp() });
        setAviso(`✓ VTI ${vtiAtual.numero} armazenada com sucesso!`);
        trocarVti();
      } else if (restantesNestePatioDepois.length === 0) {
        setAviso(
          `Todas as UDs deste pátio foram endereçadas. Restam ${restantesTotalDepois.length} UD(s) para outro pátio.`
        );
      }
    } catch (e) {
      setErro('Falha ao bipar a UD. Tente novamente.');
    } finally {
      setBipando(false);
    }
  };

  const finalizarParcial = async () => {
    if (!vtiAtual) return;
    try {
      await updateDoc(doc(db, 'vtis', vtiAtual.id), { status: 'parcial', ultimaMovimentacaoEm: serverTimestamp() });
      trocarVti();
    } catch (e) {
      setErro('Falha ao finalizar. Tente novamente.');
    }
  };

  if (carregandoAreas) return <p>Carregando...</p>;

  return (
    <div>
      <div style={ui.sectionHeaderRow}>
        <h2 style={ui.sectionTitle}>Endereçamento</h2>
      </div>
      <p style={ui.placeholderNote}>Bipe as UDs de uma VTI que chegou e associe cada uma a um endereço do pátio.</p>

      {!areaId ? (
        <div style={ui.formCard}>
          <label style={ui.label}>
            Pátio (onde você está) *
            {areas.length === 0 ? (
              <span style={{ fontSize: 13, color: '#B85700' }}>
                Nenhuma área de operação cadastrada (Cadastros → Operação → Área).
              </span>
            ) : (
              <select style={ui.input} value={areaId} onChange={(e) => setAreaId(e.target.value)}>
                <option value="">Selecione...</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nome}
                  </option>
                ))}
              </select>
            )}
          </label>
        </div>
      ) : !vtiAtual ? (
        <div style={ui.formCard}>
          <div style={ui.sectionHeaderRow}>
            <h3 style={{ margin: 0 }}>Pátio: {areaAtual?.nome}</h3>
            <button style={ui.linkButton} onClick={() => setAreaId('')}>
              Trocar pátio
            </button>
          </div>
          {aviso && <div style={{ ...ui.erro, color: '#1E7A34' }}>{aviso}</div>}
          <h4 style={styles.subtitulo}>VTIs aguardando armazenagem</h4>
          {vtisComPendencia.length === 0 ? (
            <p style={ui.placeholderNote}>Nenhuma VTI com UDs pendentes para este pátio no momento.</p>
          ) : (
            <div style={styles.listaCompacta}>
              {vtisComPendencia.map(({ vti, qtdNestePatio }) => (
                <button key={vti.id} style={styles.itemVti} onClick={() => abrirVti(vti.id)}>
                  <span>
                    <strong>{vti.numero}</strong>{' '}
                    <span style={{ ...ui.badge, ...ui[badgeStatusVti(vti.status)] }}>{rotuloStatusVti(vti.status)}</span>
                  </span>
                  <span>{qtdNestePatio} UD(s) para este pátio</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={ui.formCard}>
          <div style={ui.sectionHeaderRow}>
            <div>
              <h3 style={{ margin: 0 }}>
                VTI {vtiAtual.numero}{' '}
                <span style={{ ...ui.badge, ...ui[badgeStatusVti(vtiAtual.status)], marginLeft: 8 }}>
                  {rotuloStatusVti(vtiAtual.status)}
                </span>
              </h3>
              <span style={{ fontSize: 13, color: '#777' }}>
                {udsParaEsteVtiEPatio(vtiAtual.id).length} UD(s) restantes para {areaAtual?.nome}
              </span>
            </div>
            <button style={ui.secondaryButton} onClick={trocarVti}>
              Trocar de VTI
            </button>
          </div>

          {aviso && <div style={{ ...ui.erro, color: '#1E7A34', marginBottom: 10 }}>{aviso}</div>}

          <label style={{ ...ui.label, marginBottom: 14 }}>
            Endereço *
            {enderecos.length === 0 ? (
              <span style={{ fontSize: 13, color: '#B85700' }}>
                Nenhum endereço cadastrado neste pátio (Cadastros → Operação → Endereço).
              </span>
            ) : (
              <select style={ui.input} value={enderecoId} onChange={(e) => setEnderecoId(e.target.value)}>
                <option value="">Selecione...</option>
                {enderecos.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.codigo}
                  </option>
                ))}
              </select>
            )}
          </label>

          {enderecoId && (
            <>
              {erro && <div style={ui.erro}>❌ {erro}</div>}
              <div style={styles.linhaBipar}>
                <input
                  autoFocus
                  style={{ ...ui.input, flex: 1 }}
                  value={codigoUd}
                  onChange={(e) => setCodigoUd(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && biparUd()}
                  placeholder="Bipe ou digite o código da UD"
                />
                <button style={ui.primaryButton} onClick={biparUd} disabled={bipando}>
                  📦 Bipar
                </button>
              </div>
              <button style={ui.linkButton} onClick={encerrarEndereco}>
                🔚 Encerrar endereço {enderecoAtual?.codigo} (escolher outro)
              </button>
            </>
          )}

          {udsParaEsteVtiEPatio(vtiAtual.id).length === 0 && udsRestantesDaVti(vtiAtual.id).length > 0 && (
            <div style={{ marginTop: 16, padding: 14, background: '#FFF7E6', borderRadius: 8 }}>
              <p style={{ margin: '0 0 10px', fontSize: 14 }}>
                ⚠️ Todas as UDs deste pátio já foram endereçadas. Restam{' '}
                {udsRestantesDaVti(vtiAtual.id).length} UD(s) pendentes para outro pátio.
              </p>
              <button style={ui.primaryButton} onClick={finalizarParcial}>
                Finalizar armazenagem neste pátio
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles = {
  subtitulo: { margin: '18px 0 8px', color: NAVY },
  listaCompacta: { display: 'flex', flexDirection: 'column', gap: 8 },
  itemVti: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    padding: '10px 14px',
    background: '#F8F9FB',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
    textAlign: 'left'
  },
  linhaBipar: { display: 'flex', gap: 8, marginBottom: 10 }
};

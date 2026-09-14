import React, { useEffect, useState } from 'react';
import {
  db,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp
} from '../lib/db';
import { ui, NAVY } from '../lib/styles';
import { formatarHorario } from '../lib/data';

// Fluxo B do plano de Fase 2 (11/09/2026): o Conferente está NA ORIGEM
// (antes da VTI partir pro pátio), abre/cria a VTI aqui e bipa cada UD
// que está sobre ela. A VTI nasce (ou volta a ficar) CHEIA a partir da
// primeira UD bipada — sem depender da planilha da Brametal (Fluxo A,
// ainda bloqueado). Geolocalização não é validada aqui: quem confirma
// por GPS é o tratorista, na movimentação (próximo passo do plano).
export default function BipagemScreen() {
  const [areas, setAreas] = useState([]);
  const [carregandoAreas, setCarregandoAreas] = useState(true);
  const [areaId, setAreaId] = useState('');

  const [vtisAbertasHoje, setVtisAbertasHoje] = useState([]);
  const [vtiAtual, setVtiAtual] = useState(null);
  const [numeroVti, setNumeroVti] = useState('');
  const [erroVti, setErroVti] = useState('');
  const [abrindoVti, setAbrindoVti] = useState(false);

  const [uds, setUds] = useState([]);
  const [codigoUd, setCodigoUd] = useState('');
  const [erroUd, setErroUd] = useState('');
  const [bipando, setBipando] = useState(false);

  // Áreas de Operação — é onde a bipagem acontece; qualquer uma serve de
  // origem.
  useEffect(() => {
    const q = query(collection(db, 'areas'), where('tipo', '==', 'operacao'), orderBy('nome'));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setAreas(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setCarregandoAreas(false);
      },
      () => setCarregandoAreas(false)
    );
    return () => unsubscribe();
  }, []);

  // Lista de apoio: VTIs cheias existentes, pra sugerir reabertura em vez
  // de criar duplicada por engano (número digitado igual, mas o
  // conferente não lembrava que já tinha começado essa VTI).
  useEffect(() => {
    const q = query(collection(db, 'vtis'), where('status', '==', 'cheia'), orderBy('numero'));
    const unsubscribe = onSnapshot(q, (snap) => setVtisAbertasHoje(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!vtiAtual) {
      setUds([]);
      return undefined;
    }
    const q = query(collection(db, 'uds'), where('vtiId', '==', vtiAtual.id), orderBy('criadoEm', 'desc'));
    const unsubscribe = onSnapshot(q, (snap) => setUds(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return () => unsubscribe();
  }, [vtiAtual]);

  const areaAtual = areas.find((a) => a.id === areaId) || null;

  const abrirVti = async () => {
    const numero = numeroVti.trim();
    if (!areaId) {
      setErroVti('Selecione a área onde você está.');
      return;
    }
    if (!numero) {
      setErroVti('Informe o número da VTI.');
      return;
    }
    setAbrindoVti(true);
    setErroVti('');
    try {
      const existente = vtisAbertasHoje.find((v) => (v.numero || '').trim().toLowerCase() === numero.toLowerCase());
      if (existente) {
        setVtiAtual(existente);
      } else {
        // Verifica também entre as VAZIAS — uma VTI pode voltar a ficar
        // cheia numa nova origem (ela circula o dia inteiro).
        const snapTodas = await getDocs(query(collection(db, 'vtis'), where('numero', '==', numero)));
        const doc0 = snapTodas.docs[0];
        if (doc0) {
          const vti = { id: doc0.id, ...doc0.data() };
          await updateDoc(doc(db, 'vtis', vti.id), {
            status: 'cheia',
            areaAtualId: areaId,
            areaAtualNome: areaAtual?.nome || '',
            ultimaMovimentacaoEm: serverTimestamp()
          });
          setVtiAtual({ ...vti, status: 'cheia', areaAtualId: areaId, areaAtualNome: areaAtual?.nome || '' });
        } else {
          const ref = await addDoc(collection(db, 'vtis'), {
            numero,
            status: 'cheia',
            areaAtualId: areaId,
            areaAtualNome: areaAtual?.nome || '',
            ultimaMovimentacaoEm: serverTimestamp(),
            criadoEm: serverTimestamp()
          });
          setVtiAtual({
            id: ref.id,
            numero,
            status: 'cheia',
            areaAtualId: areaId,
            areaAtualNome: areaAtual?.nome || ''
          });
        }
      }
      setNumeroVti('');
    } catch (e) {
      setErroVti('Falha ao abrir a VTI. Tente novamente.');
    } finally {
      setAbrindoVti(false);
    }
  };

  const trocarVti = () => {
    setVtiAtual(null);
    setNumeroVti('');
    setErroVti('');
    setCodigoUd('');
    setErroUd('');
  };

  const biparUd = async () => {
    const codigo = codigoUd.trim();
    if (!codigo) {
      setErroUd('Bipe ou digite o código da UD.');
      return;
    }
    setBipando(true);
    setErroUd('');
    try {
      const existente = await getDocs(query(collection(db, 'uds'), where('codigo', '==', codigo)));
      const jaExiste = existente.docs.find((d) => d.data().status === 'na_vti');
      if (jaExiste) {
        const dados = jaExiste.data();
        setErroUd(
          dados.vtiId === vtiAtual.id
            ? 'Essa UD já foi bipada nesta VTI.'
            : `Essa UD já está bipada em outra VTI (${dados.vtiNumero}).`
        );
        return;
      }
      await addDoc(collection(db, 'uds'), {
        codigo,
        vtiId: vtiAtual.id,
        vtiNumero: vtiAtual.numero,
        status: 'na_vti',
        enderecoId: null,
        enderecoCodigo: null,
        pesoKg: null,
        criadoEm: serverTimestamp(),
        atualizadoEm: serverTimestamp()
      });
      setCodigoUd('');
    } catch (e) {
      setErroUd('Falha ao bipar a UD. Tente novamente.');
    } finally {
      setBipando(false);
    }
  };

  const removerUd = async (ud) => {
    if (!window.confirm(`Remover a UD "${ud.codigo}" desta VTI? (bipagem errada)`)) return;
    try {
      await deleteDoc(doc(db, 'uds', ud.id));
    } catch (e) {
      setErroUd('Falha ao remover. Tente novamente.');
    }
  };

  return (
    <div>
      <div style={ui.sectionHeaderRow}>
        <h2 style={ui.sectionTitle}>Bipagem na origem</h2>
      </div>
      <p style={ui.placeholderNote}>
        Abra a VTI e bipe cada UD que está sobre ela antes dela partir. A VTI fica{' '}
        <strong>CHEIA</strong> a partir da primeira UD bipada.
      </p>

      {!vtiAtual ? (
        <div style={ui.formCard}>
          <h3 style={{ marginTop: 0 }}>Abrir VTI</h3>
          {erroVti && <div style={ui.erro}>❌ {erroVti}</div>}
          <div style={ui.formGrid}>
            <label style={ui.label}>
              Área (onde você está) *
              {carregandoAreas ? (
                <span style={{ fontSize: 13, color: '#777' }}>Carregando...</span>
              ) : areas.length === 0 ? (
                <span style={{ fontSize: 13, color: '#B85700' }}>
                  Nenhuma área de operação cadastrada ainda (Cadastros → Operação → Área).
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
            <label style={ui.label}>
              Número da VTI *
              <input
                style={ui.input}
                value={numeroVti}
                onChange={(e) => setNumeroVti(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && abrirVti()}
                placeholder="Ex: VTI-042"
              />
            </label>
          </div>
          <button style={ui.primaryButton} onClick={abrirVti} disabled={abrindoVti}>
            {abrindoVti ? 'Abrindo...' : 'Abrir VTI'}
          </button>

          {vtisAbertasHoje.length > 0 && (
            <>
              <h4 style={styles.subtitulo}>VTIs já cheias (toque pra continuar bipando)</h4>
              <div style={styles.listaChips}>
                {vtisAbertasHoje.map((v) => (
                  <button
                    key={v.id}
                    style={styles.chip}
                    onClick={() => {
                      setAreaId(v.areaAtualId || areaId);
                      setVtiAtual(v);
                    }}
                  >
                    {v.numero} <span style={{ color: '#777' }}>· {v.areaAtualNome}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <div style={ui.formCard}>
          <div style={ui.sectionHeaderRow}>
            <div>
              <h3 style={{ margin: 0 }}>
                VTI {vtiAtual.numero} <span style={{ ...ui.badge, ...ui.badgeLaranja, marginLeft: 8 }}>CHEIA</span>
              </h3>
              <span style={{ fontSize: 13, color: '#777' }}>{areaAtual?.nome || vtiAtual.areaAtualNome}</span>
            </div>
            <button style={ui.secondaryButton} onClick={trocarVti}>
              Trocar de VTI
            </button>
          </div>

          {erroUd && <div style={ui.erro}>❌ {erroUd}</div>}

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

          <h4 style={styles.subtitulo}>UDs bipadas nesta VTI ({uds.length})</h4>
          {uds.length === 0 ? (
            <p style={ui.placeholderNote}>Nenhuma UD bipada ainda.</p>
          ) : (
            <div style={styles.listaCompacta}>
              {uds.map((u) => (
                <div key={u.id} style={styles.itemCompacto}>
                  <div>
                    <strong>{u.codigo}</strong>
                    <span style={{ fontSize: 12, color: '#999', marginLeft: 8 }}>{formatarHorario(u.criadoEm)}</span>
                  </div>
                  <button style={{ ...ui.linkButton, color: '#D32F2F' }} onClick={() => removerUd(u)}>
                    Remover
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles = {
  subtitulo: { margin: '18px 0 8px', color: NAVY },
  linhaBipar: { display: 'flex', gap: 8, marginBottom: 16 },
  listaChips: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  chip: {
    padding: '8px 14px',
    background: '#F0F3F7',
    border: `1px solid ${NAVY}`,
    borderRadius: 16,
    color: NAVY,
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer'
  },
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

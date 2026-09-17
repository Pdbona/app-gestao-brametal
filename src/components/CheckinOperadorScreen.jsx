import React, { useEffect, useState } from 'react';
import {
  db,
  collection,
  addDoc,
  updateDoc,
  doc,
  onSnapshot,
  query,
  where,
  serverTimestamp
} from '../lib/db';
import { ui, NAVY } from '../lib/styles';
import { formatarHorario } from '../lib/data';
import { capturarGeolocalizacao, distanciaMetros } from '../lib/geo';
import { avaliarArea, resolverAreaPorGeo, raioDaArea, temGeo } from '../lib/areas';
import { STATUS_VTI, badgeStatusVti, rotuloStatusVti } from '../lib/vti';

// Tela 2 (17/09/2026, FASE_2_TELAS_1-3_BRAMETAL.md): Check-in do Operador
// de Trator. Decisão do Pablo (17/09/2026, via AskUserQuestion): NÃO
// reaproveita o check-in/checkout de presença (aquilo é "ponto", sem
// senha, de todo colaborador) — o tratorista tem tela própria de
// movimentação/disponibilidade, identificado pela SENHA de login do app
// (é um `usuario` com perfil próprio, ex. "Tratorista"), não por CPF
// digitado na hora. Substitui o modelo de `movimentacoesVti` vinculado à
// presença do plano de 11/09/2026 — aqui o movimento é autocontido (fase
// INÍCIO + fase FIM no mesmo doc, sem depender de checkin/checkout).
export default function CheckinOperadorScreen({ usuario }) {
  const [areas, setAreas] = useState([]);
  const [carregandoAreas, setCarregandoAreas] = useState(true);
  const [movimentoAberto, setMovimentoAberto] = useState(null);
  const [carregandoMovimento, setCarregandoMovimento] = useState(true);
  const [ultimasConcluidas, setUltimasConcluidas] = useState([]);

  const [localizando, setLocalizando] = useState(false);
  const [areaResolvida, setAreaResolvida] = useState(null); // { area, distancia }
  const [areaManualId, setAreaManualId] = useState('');
  const [erroLocal, setErroLocal] = useState('');
  const [posicaoAtual, setPosicaoAtual] = useState(null);

  const [vtisNaArea, setVtisNaArea] = useState([]);
  const [vtiEscolhidaId, setVtiEscolhidaId] = useState('');
  const [statusInformado, setStatusInformado] = useState('cheia');
  const [erroForm, setErroForm] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'areas'), where('tipo', '==', 'operacao'));
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

  useEffect(() => {
    if (!usuario?.uid) return undefined;
    const q = query(
      collection(db, 'movimentacoesVti'),
      where('operadorUid', '==', usuario.uid),
      where('status', '==', 'em_andamento')
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setMovimentoAberto(snap.docs.length > 0 ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null);
        setCarregandoMovimento(false);
      },
      () => setCarregandoMovimento(false)
    );
    return () => unsubscribe();
  }, [usuario?.uid]);

  useEffect(() => {
    if (!usuario?.uid) return undefined;
    const q = query(
      collection(db, 'movimentacoesVti'),
      where('operadorUid', '==', usuario.uid),
      where('status', '==', 'concluida')
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      lista.sort((a, b) => (b.horaFim?.toMillis?.() || 0) - (a.horaFim?.toMillis?.() || 0));
      setUltimasConcluidas(lista.slice(0, 3));
    });
    return () => unsubscribe();
  }, [usuario?.uid]);

  // Lista de VTIs disponíveis na área de origem resolvida — some quando
  // troca de área ou ainda não localizou.
  useEffect(() => {
    if (!areaResolvida) {
      setVtisNaArea([]);
      return undefined;
    }
    const q = query(collection(db, 'vtis'), where('areaAtualId', '==', areaResolvida.area.id));
    const unsubscribe = onSnapshot(q, (snap) => {
      const lista = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((v) => v.status === 'cheia' || v.status === 'vazia' || v.status === 'parcial');
      lista.sort((a, b) => (a.numero || '').localeCompare(b.numero || ''));
      setVtisNaArea(lista);
    });
    return () => unsubscribe();
  }, [areaResolvida]);

  const localizar = async () => {
    setErroLocal('');
    setLocalizando(true);
    try {
      const { lat, lng } = await capturarGeolocalizacao();
      setPosicaoAtual({ lat, lng });
      const areasComGeo = areas.filter(temGeo);
      const { escolhida, avaliadas: todas } = resolverAreaPorGeo(areasComGeo, lat, lng);
      if (escolhida) {
        setAreaResolvida(escolhida);
      } else {
        const maisProxima = todas[0];
        setErroLocal(
          maisProxima
            ? `Você não está dentro de nenhuma área cadastrada. A mais próxima é "${
                maisProxima.area.nome
              }", a ${Math.round(maisProxima.distancia)}m (limite ${raioDaArea(maisProxima.area)}m). Selecione manualmente
               abaixo se tiver certeza de onde está.`
            : 'Nenhuma área de operação tem geolocalização cadastrada ainda.'
        );
      }
    } catch (e) {
      setErroLocal('Não foi possível obter sua localização. Verifique a permissão de localização do navegador.');
    } finally {
      setLocalizando(false);
    }
  };

  // Funciona mesmo sem GPS capturado (ou sem nenhuma área com geo
  // cadastrada ainda, caso real das áreas de Operação da Brametal
  // enquanto o Pablo não cadastra a geolocalização delas) — nesse caso
  // a distância fica null e a tela confia na escolha manual do operador.
  const confirmarAreaManual = () => {
    if (!areaManualId) return;
    const area = areas.find((a) => a.id === areaManualId);
    if (!area) return;
    const distancia = posicaoAtual && temGeo(area) ? avaliarArea(area, posicaoAtual.lat, posicaoAtual.lng).distancia : null;
    setAreaResolvida({ area, distancia });
    setErroLocal('');
  };

  const iniciarMovimento = async () => {
    if (!vtiEscolhidaId) {
      setErroForm('Selecione a VTI.');
      return;
    }
    if (!statusInformado) {
      setErroForm('Informe se a VTI está cheia ou vazia.');
      return;
    }
    const vti = vtisNaArea.find((v) => v.id === vtiEscolhidaId);
    setSalvando(true);
    setErroForm('');
    try {
      await addDoc(collection(db, 'movimentacoesVti'), {
        vtiId: vti.id,
        vtiNumero: vti.numero,
        operadorUid: usuario.uid,
        operadorNome: usuario.nome,
        statusInformado,
        areaOrigemId: areaResolvida.area.id,
        areaOrigemNome: areaResolvida.area.nome,
        geoInicioLat: posicaoAtual?.lat ?? null,
        geoInicioLng: posicaoAtual?.lng ?? null,
        horaInicio: serverTimestamp(),
        areaDestinoId: null,
        areaDestinoNome: null,
        geoFimLat: null,
        geoFimLng: null,
        distanciaDestinoMetros: null,
        horaFim: null,
        distanciaPercorridaMetros: null,
        status: 'em_andamento',
        criadoEm: serverTimestamp(),
        atualizadoEm: serverTimestamp()
      });
      await updateDoc(doc(db, 'vtis', vti.id), {
        status: 'em_transporte',
        ultimaMovimentacaoEm: serverTimestamp()
      });
      resetarLocalizacao();
    } catch (e) {
      setErroForm('Falha ao iniciar a movimentação. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  const resetarLocalizacao = () => {
    setAreaResolvida(null);
    setAreaManualId('');
    setPosicaoAtual(null);
    setVtiEscolhidaId('');
    setStatusInformado('cheia');
  };

  const confirmarChegada = async () => {
    if (!areaResolvida) return;
    setSalvando(true);
    setErroForm('');
    try {
      // Sem geo em algum dos dois pontos (GPS negado, ou área ainda sem
      // geolocalização cadastrada) a distância do trecho fica null — não
      // impede confirmar a chegada, só deixa de contribuir pro km do
      // Dashboard do Operador (fase seguinte).
      const temAmbosPontos = posicaoAtual && movimentoAberto.geoInicioLat != null && movimentoAberto.geoInicioLng != null;
      const distanciaPercorrida = temAmbosPontos
        ? distanciaMetros(movimentoAberto.geoInicioLat, movimentoAberto.geoInicioLng, posicaoAtual.lat, posicaoAtual.lng)
        : null;
      await updateDoc(doc(db, 'movimentacoesVti', movimentoAberto.id), {
        areaDestinoId: areaResolvida.area.id,
        areaDestinoNome: areaResolvida.area.nome,
        geoFimLat: posicaoAtual?.lat ?? null,
        geoFimLng: posicaoAtual?.lng ?? null,
        distanciaDestinoMetros: areaResolvida.distancia != null ? Math.round(areaResolvida.distancia) : null,
        horaFim: serverTimestamp(),
        distanciaPercorridaMetros: distanciaPercorrida != null ? Math.round(distanciaPercorrida) : null,
        status: 'concluida',
        atualizadoEm: serverTimestamp()
      });
      await updateDoc(doc(db, 'vtis', movimentoAberto.vtiId), {
        status: movimentoAberto.statusInformado,
        areaAtualId: areaResolvida.area.id,
        areaAtualNome: areaResolvida.area.nome,
        ultimaMovimentacaoEm: serverTimestamp()
      });
      resetarLocalizacao();
    } catch (e) {
      setErroForm('Falha ao confirmar a chegada. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  if (carregandoAreas || carregandoMovimento) {
    return <p>Carregando...</p>;
  }

  if (areas.length === 0) {
    return (
      <p style={ui.placeholderNote}>
        Nenhuma área de operação cadastrada ainda (Cadastros → Operação → Área).
      </p>
    );
  }

  return (
    <div>
      <div style={ui.sectionHeaderRow}>
        <h2 style={ui.sectionTitle}>Check-in do Operador</h2>
      </div>

      {movimentoAberto ? (
        <div style={ui.formCard}>
          <h3 style={{ marginTop: 0 }}>
            VTI {movimentoAberto.vtiNumero}{' '}
            <span style={{ ...ui.badge, ...ui[badgeStatusVti('em_transporte')], marginLeft: 8 }}>EM TRANSPORTE</span>
          </h3>
          <p style={{ fontSize: 13, color: '#777' }}>
            Saiu de <strong>{movimentoAberto.areaOrigemNome}</strong> às {formatarHorario(movimentoAberto.horaInicio)} ·
            informada como <strong>{rotuloStatusVti(movimentoAberto.statusInformado)}</strong>
          </p>

          {!areaResolvida ? (
            <BlocoLocalizacao
              erroLocal={erroLocal}
              localizando={localizando}
              onLocalizar={localizar}
              areas={areas}
              areaManualId={areaManualId}
              setAreaManualId={setAreaManualId}
              onConfirmarManual={confirmarAreaManual}
            />
          ) : (
            <>
              <p style={{ fontSize: 14 }}>
                Você está em <strong>{areaResolvida.area.nome}</strong>
                {areaResolvida.distancia != null && <> (a {Math.round(areaResolvida.distancia)}m do centro)</>}.
              </p>
              {erroForm && <div style={ui.erro}>❌ {erroForm}</div>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button style={ui.primaryButton} onClick={confirmarChegada} disabled={salvando}>
                  {salvando ? 'Confirmando...' : `✅ Confirmar chegada em ${areaResolvida.area.nome}`}
                </button>
                <button style={ui.secondaryButton} onClick={resetarLocalizacao} disabled={salvando}>
                  Trocar área
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div style={ui.formCard}>
          <h3 style={{ marginTop: 0 }}>Iniciar movimentação</h3>

          {!areaResolvida ? (
            <BlocoLocalizacao
              erroLocal={erroLocal}
              localizando={localizando}
              onLocalizar={localizar}
              areas={areas}
              areaManualId={areaManualId}
              setAreaManualId={setAreaManualId}
              onConfirmarManual={confirmarAreaManual}
            />
          ) : (
            <>
              <p style={{ fontSize: 14 }}>
                Você está em <strong>{areaResolvida.area.nome}</strong>
                {areaResolvida.distancia != null && <> (a {Math.round(areaResolvida.distancia)}m do centro)</>}.{' '}
                <button style={ui.linkButton} onClick={resetarLocalizacao}>
                  Trocar
                </button>
              </p>

              {vtisNaArea.length === 0 ? (
                <p style={ui.placeholderNote}>Nenhuma VTI nesta área no momento.</p>
              ) : (
                <>
                  <label style={{ ...ui.label, marginBottom: 14 }}>
                    VTI para mover *
                    <select style={ui.input} value={vtiEscolhidaId} onChange={(e) => setVtiEscolhidaId(e.target.value)}>
                      <option value="">Selecione...</option>
                      {vtisNaArea.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.numero} — {rotuloStatusVti(v.status)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div style={{ ...ui.label, marginBottom: 14 }}>
                    Status da VTI ao sair *
                    <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                      {STATUS_VTI.filter((s) => s.id === 'cheia' || s.id === 'vazia').map((s) => (
                        <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400 }}>
                          <input
                            type="radio"
                            checked={statusInformado === s.id}
                            onChange={() => setStatusInformado(s.id)}
                          />
                          {s.label}
                        </label>
                      ))}
                    </div>
                  </div>

                  {erroForm && <div style={ui.erro}>❌ {erroForm}</div>}
                  <button style={ui.primaryButton} onClick={iniciarMovimento} disabled={salvando}>
                    {salvando ? 'Salvando...' : '🚚 Iniciar movimentação'}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}

      {ultimasConcluidas.length > 0 && (
        <>
          <h4 style={styles.subtitulo}>Últimas movimentações concluídas</h4>
          <div style={styles.listaCompacta}>
            {ultimasConcluidas.map((m) => (
              <div key={m.id} style={styles.itemCompacto}>
                <strong>{m.vtiNumero}</strong>
                <span>
                  {m.areaOrigemNome} → {m.areaDestinoNome}
                </span>
                <span style={{ color: '#999' }}>{formatarHorario(m.horaFim)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Botão de GPS + fallback manual sempre visível (não só quando o GPS
// encontrou algo próximo) — as áreas de Operação da Brametal ainda não
// têm geolocalização cadastrada, então depender só do GPS deixaria a
// tela sem saída nenhuma pro operador.
function BlocoLocalizacao({ erroLocal, localizando, onLocalizar, areas, areaManualId, setAreaManualId, onConfirmarManual }) {
  return (
    <>
      {erroLocal && <div style={ui.erro}>❌ {erroLocal}</div>}
      <button style={ui.primaryButton} onClick={onLocalizar} disabled={localizando}>
        {localizando ? 'Localizando...' : '📍 Confirmar minha localização'}
      </button>
      <div style={{ marginTop: 14 }}>
        <label style={ui.label}>
          Ou selecione a área manualmente
          <select style={ui.input} value={areaManualId} onChange={(e) => setAreaManualId(e.target.value)}>
            <option value="">Selecione...</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
        </label>
        <button style={{ ...ui.secondaryButton, marginTop: 8 }} onClick={onConfirmarManual} disabled={!areaManualId}>
          Usar esta área
        </button>
      </div>
    </>
  );
}

const styles = {
  subtitulo: { margin: '18px 0 8px', color: NAVY },
  listaCompacta: { display: 'flex', flexDirection: 'column', gap: 8 },
  itemCompacto: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    padding: '8px 0',
    borderBottom: '1px solid #EEE',
    fontSize: 13
  }
};

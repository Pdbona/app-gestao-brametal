import React, { useEffect, useRef, useState } from 'react';
import {
  db,
  collection,
  addDoc,
  updateDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp
} from '../lib/db';
import { ui, NAVY } from '../lib/styles';
import { formatarDataHoraCurta } from '../lib/data';
import { lerPlanilhaImportacaoVti, agruparPorVti, gerarModeloImportacaoVti } from '../lib/importVti';

// Tela 1 (17/09/2026, FASE_2_TELAS_1-3_BRAMETAL.md): Fluxo A da Fase 2 —
// importação de planilha da Brametal, que estava bloqueada desde
// 11/09/2026 até o layout chegar. Convive com a Bipagem na origem
// (Fluxo B, BipagemScreen.jsx) — decisão do Pablo (17/09/2026): as duas
// formas de dar entrada na VTI continuam existindo.
//
// GAL1/GAL2 do documento são áreas comuns (tipo 'operacao') já
// cadastradas em Cadastros → Operação → Área — nada novo foi criado só
// pra elas (confirmado com o Pablo). O mesmo vale pra cada valor de
// DESTINO_PADRAO da planilha: a tela pede pra mapear cada valor distinto
// encontrado pra uma área já cadastrada, porque o layout da Brametal usa
// texto livre ("Pátio 1", "Pátio 2"...) que pode não bater 100% com o
// nome exato cadastrado aqui.
export default function ImportacaoScreen({ usuario }) {
  const [areas, setAreas] = useState([]);
  const [carregandoAreas, setCarregandoAreas] = useState(true);
  const [galId, setGalId] = useState('');

  const [arquivo, setArquivo] = useState(null);
  const [lendo, setLendo] = useState(false);
  const [resultado, setResultado] = useState(null); // { colunasFaltando, itens, destinosDistintos }
  const [mapaDestinos, setMapaDestinos] = useState({});
  const [importando, setImportando] = useState(false);
  const [resumoImportacao, setResumoImportacao] = useState(null);
  const [erro, setErro] = useState('');

  const [historico, setHistorico] = useState([]);
  const inputArquivoRef = useRef(null);

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

  useEffect(() => {
    const q = query(collection(db, 'importacoesVti'), orderBy('criadoEm', 'desc'), limit(5));
    const unsubscribe = onSnapshot(q, (snap) => setHistorico(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {});
    return () => unsubscribe();
  }, []);

  const areasPorId = Object.fromEntries(areas.map((a) => [a.id, a]));

  const escolherArquivo = async (e) => {
    const file = e.target.files[0] || null;
    setArquivo(file);
    setResultado(null);
    setMapaDestinos({});
    setResumoImportacao(null);
    setErro('');
    if (!file) return;
    setLendo(true);
    try {
      const r = await lerPlanilhaImportacaoVti(file);
      setResultado(r);
      // Ponto de partida do mapeamento: se o texto da planilha já bate
      // (sem acento/caixa) com o nome de uma área, pré-seleciona — o
      // Administrativo só precisa conferir, não escolher tudo do zero.
      const normalizar = (t) =>
        String(t || '')
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .toLowerCase()
          .trim();
      const mapaInicial = {};
      (r.destinosDistintos || []).forEach((destino) => {
        const achada = areas.find((a) => normalizar(a.nome) === normalizar(destino));
        if (achada) mapaInicial[destino] = achada.id;
      });
      setMapaDestinos(mapaInicial);
    } catch (e2) {
      setErro('Falha ao ler o arquivo. Confira se é um Excel (.xlsx) ou CSV válido.');
    } finally {
      setLendo(false);
    }
  };

  const itensValidos = (resultado?.itens || []).filter((it) => !it.erro);
  const itensComErro = (resultado?.itens || []).filter((it) => it.erro);
  const destinosSemMapa = (resultado?.destinosDistintos || []).filter((d) => !mapaDestinos[d]);
  const prontoParaImportar =
    Boolean(galId) &&
    Boolean(resultado) &&
    resultado.colunasFaltando.length === 0 &&
    itensValidos.length > 0 &&
    destinosSemMapa.length === 0;

  const limitePorArquivo = 1000;
  const excedeuLimite = itensValidos.length > limitePorArquivo;

  const importar = async () => {
    if (!prontoParaImportar || excedeuLimite) return;
    setImportando(true);
    setErro('');
    try {
      const grupos = agruparPorVti(itensValidos, mapaDestinos, areasPorId);
      const galAtual = areasPorId[galId];

      // Pré-checagem de duplicidade: UD já ativa (status 'na_vti') em
      // outra VTI — mesma regra da Bipagem na origem (BipagemScreen.jsx),
      // pra não deixar a mesma UD em duas VTIs ao mesmo tempo.
      const todosCodigos = itensValidos.map((it) => it.udId);
      const codigosJaAtivos = new Set();
      // Firestore 'in' aceita no máximo 30 valores por consulta — quebra
      // em lotes pra planilhas maiores.
      for (let i = 0; i < todosCodigos.length; i += 30) {
        const lote = todosCodigos.slice(i, i + 30);
        if (lote.length === 0) continue;
        const snap = await getDocs(query(collection(db, 'uds'), where('codigo', 'in', lote)));
        snap.docs.forEach((d) => {
          const dados = d.data();
          if (dados.status === 'na_vti') codigosJaAtivos.add(dados.codigo);
        });
      }

      let qtdVtis = 0;
      let qtdUds = 0;
      const rejeitadas = [];

      for (const grupo of grupos) {
        const udsParaCriar = grupo.uds.filter((u) => !codigosJaAtivos.has(u.udId));
        const udsRejeitadas = grupo.uds.filter((u) => codigosJaAtivos.has(u.udId));
        udsRejeitadas.forEach((u) => rejeitadas.push(`${u.udId} (já ativa em outra VTI)`));
        if (udsParaCriar.length === 0) continue;

        // Mesma lógica de reabertura da BipagemScreen: se já existe uma
        // VTI com esse número, reabre (fica CHEIA de novo); senão cria.
        const snapExistente = await getDocs(query(collection(db, 'vtis'), where('numero', '==', grupo.vtiId)));
        const docExistente = snapExistente.docs[0];
        let vtiId;
        if (docExistente) {
          vtiId = docExistente.id;
          await updateDoc(doc(db, 'vtis', vtiId), {
            status: 'cheia',
            areaAtualId: galId,
            areaAtualNome: galAtual?.nome || '',
            destinoResumo: grupo.destinoResumo,
            ultimaMovimentacaoEm: serverTimestamp()
          });
        } else {
          const ref = await addDoc(collection(db, 'vtis'), {
            numero: grupo.vtiId,
            status: 'cheia',
            areaAtualId: galId,
            areaAtualNome: galAtual?.nome || '',
            destinoResumo: grupo.destinoResumo,
            ultimaMovimentacaoEm: serverTimestamp(),
            criadoEm: serverTimestamp()
          });
          vtiId = ref.id;
        }

        for (const ud of udsParaCriar) {
          await addDoc(collection(db, 'uds'), {
            codigo: ud.udId,
            vtiId,
            vtiNumero: grupo.vtiId,
            produto: ud.produto || '',
            pesoKg: ud.pesoKg,
            destinoAreaId: ud.destinoAreaId,
            destinoAreaNome: ud.destinoAreaNome,
            status: 'na_vti',
            enderecoId: null,
            enderecoCodigo: null,
            criadoEm: serverTimestamp(),
            atualizadoEm: serverTimestamp()
          });
          qtdUds += 1;
        }
        qtdVtis += 1;
      }

      // Log do histórico é "nice to have": se a regra de segurança ainda
      // não liberou esta coleção nova, não pode derrubar uma importação
      // que já gravou VTIs/UDs de verdade — só o histórico fica sem essa
      // linha.
      try {
        await addDoc(collection(db, 'importacoesVti'), {
          galId,
          galNome: galAtual?.nome || '',
          qtdVtis,
          qtdUds,
          qtdRejeitadas: rejeitadas.length,
          usuarioNome: usuario?.nome || '',
          criadoEm: serverTimestamp()
        });
      } catch (eHistorico) {
        // segue sem quebrar a importação
      }

      setResumoImportacao({ qtdVtis, qtdUds, rejeitadas });
      setArquivo(null);
      setResultado(null);
      setMapaDestinos({});
      if (inputArquivoRef.current) inputArquivoRef.current.value = '';
    } catch (e) {
      setErro('Falha ao importar os dados. Tente novamente.');
    } finally {
      setImportando(false);
    }
  };

  const cancelar = () => {
    setArquivo(null);
    setResultado(null);
    setMapaDestinos({});
    setErro('');
    if (inputArquivoRef.current) inputArquivoRef.current.value = '';
  };

  return (
    <div>
      <div style={ui.sectionHeaderRow}>
        <h2 style={ui.sectionTitle}>Importação de UDs</h2>
        <button style={ui.linkButton} onClick={gerarModeloImportacaoVti}>
          ⬇️ Baixar planilha-modelo
        </button>
      </div>
      <p style={ui.placeholderNote}>
        Importa a planilha da Brametal com as UDs carregadas em cada VTI. Colunas esperadas:{' '}
        <strong>VTI_ID, UD_ID, PRODUTO, PESO, DESTINO_PADRAO</strong>.
      </p>

      {erro && <div style={ui.erro}>❌ {erro}</div>}

      <div style={ui.formCard}>
        <div style={ui.formGrid}>
          <label style={ui.label}>
            Arquivo (Excel ou CSV) *
            <input
              ref={inputArquivoRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              style={ui.input}
              onChange={escolherArquivo}
            />
          </label>
          <label style={ui.label}>
            GAL de destino *
            {carregandoAreas ? (
              <span style={{ fontSize: 13, color: '#777' }}>Carregando...</span>
            ) : areas.length === 0 ? (
              <span style={{ fontSize: 13, color: '#B85700' }}>
                Nenhuma área de operação cadastrada (Cadastros → Operação → Área).
              </span>
            ) : (
              <select style={ui.input} value={galId} onChange={(e) => setGalId(e.target.value)}>
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

        {lendo && <p>Lendo planilha...</p>}

        {resultado && resultado.colunasFaltando.length > 0 && (
          <div style={ui.erro}>❌ Faltam colunas: {resultado.colunasFaltando.join(', ')}</div>
        )}

        {resultado && resultado.colunasFaltando.length === 0 && (
          <>
            {resultado.destinosDistintos.length > 0 && (
              <>
                <h4 style={styles.subtitulo}>Mapeamento de destino (DESTINO_PADRAO → área cadastrada)</h4>
                <div style={styles.mapaGrid}>
                  {resultado.destinosDistintos.map((destino) => (
                    <label key={destino} style={ui.label}>
                      "{destino}"
                      <select
                        style={ui.input}
                        value={mapaDestinos[destino] || ''}
                        onChange={(e) => setMapaDestinos({ ...mapaDestinos, [destino]: e.target.value })}
                      >
                        <option value="">Selecione a área...</option>
                        {areas.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.nome}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </>
            )}

            <p style={styles.resumoLinha}>
              <strong>{itensValidos.length}</strong> UDs válidas
              {itensComErro.length > 0 && (
                <span style={{ color: '#D32F2F' }}> · {itensComErro.length} com erro (não serão importadas)</span>
              )}
            </p>
            {excedeuLimite && (
              <div style={ui.erro}>
                ❌ A planilha tem {itensValidos.length} UDs — o limite por importação é {limitePorArquivo}. Divida em
                arquivos menores.
              </div>
            )}
            {itensComErro.length > 0 && (
              <div style={styles.listaErros}>
                {itensComErro.slice(0, 10).map((it) => (
                  <div key={it.linhaPlanilha} style={styles.itemErro}>
                    Linha {it.linhaPlanilha}: {it.erro}
                  </div>
                ))}
                {itensComErro.length > 10 && <div style={styles.itemErro}>... e mais {itensComErro.length - 10}</div>}
              </div>
            )}
          </>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button style={ui.primaryButton} onClick={importar} disabled={!prontoParaImportar || excedeuLimite || importando}>
            {importando ? 'Importando...' : '📤 Importar'}
          </button>
          {(arquivo || resultado) && (
            <button style={ui.secondaryButton} onClick={cancelar} disabled={importando}>
              Cancelar
            </button>
          )}
        </div>
      </div>

      {resumoImportacao && (
        <div style={{ ...ui.formCard, borderLeft: '4px solid #1E7A34' }}>
          ✓ {resumoImportacao.qtdVtis} VTIs importadas com {resumoImportacao.qtdUds} UDs.
          {resumoImportacao.rejeitadas.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 13, color: '#B85700' }}>
              {resumoImportacao.rejeitadas.length} UDs não importadas: {resumoImportacao.rejeitadas.slice(0, 5).join(', ')}
              {resumoImportacao.rejeitadas.length > 5 && '...'}
            </div>
          )}
        </div>
      )}

      <h4 style={styles.subtitulo}>Histórico de importações</h4>
      {historico.length === 0 ? (
        <p style={ui.placeholderNote}>Nenhuma importação registrada ainda.</p>
      ) : (
        <div style={styles.listaCompacta}>
          {historico.map((h) => (
            <div key={h.id} style={styles.itemCompacto}>
              <span>{formatarDataHoraCurta(h.criadoEm)}</span>
              <span>
                {h.qtdVtis} VTIs, {h.qtdUds} UDs · {h.galNome}
              </span>
              <span style={{ color: '#999' }}>{h.usuarioNome}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  subtitulo: { margin: '18px 0 8px', color: NAVY },
  mapaGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 10 },
  resumoLinha: { fontSize: 14, marginTop: 14 },
  listaErros: { marginTop: 8, background: '#FBE7E7', borderRadius: 6, padding: 10 },
  itemErro: { fontSize: 12, color: '#B3261E' },
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

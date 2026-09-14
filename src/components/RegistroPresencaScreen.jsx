import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  addDoc,
  updateDoc,
  serverTimestamp
} from '../lib/db';
import { NAVY, ORANGE } from '../lib/styles';
import LogoBrametal from './LogoBrametal';
import { normalizarCpf, validarCpf, formatarCpf } from '../lib/cpf';
import { capturarGeolocalizacao } from '../lib/geo';
import { avaliarArea, resolverAreaPorGeo, areasDoColaborador, raioDaArea, temGeo, ehTipoDePresenca } from '../lib/areas';
import { PERFIL_ADMIN_PADRAO } from '../lib/permissoes';
import {
  hojeISO,
  statusJanelaEntrada,
  statusJanelaSaida,
  minutosDesdeInicioTurno,
  minutosAteFimTurno,
  formatarHorario,
  TOLERANCIA_ENTRADA_MINUTOS,
  TOLERANCIA_SAIDA_MINUTOS
} from '../lib/data';

const LOGO_ML = `${process.env.PUBLIC_URL}/logos/logo-ml.png`;

// ============================================================
// TELA PÚBLICA DE REGISTRO DE PRESENÇA (sem login)
// ============================================================
//
// Dois jeitos de chegar aqui (ver App.jsx):
//   ?presenca=<areaId>  → QR Code fixado naquela área
//   ?presenca           → link geral, pra quem está numa área SEM placa
//
// Em ambos a validação que vale é a mesma: a geolocalização precisa cair
// dentro do raio de abrangência cadastrado na área. A diferença é só que
// o QR já diz qual área esperar; sem ele, o GPS descobre entre as áreas
// vinculadas àquele colaborador.
//
// Ordem do fluxo (uma única captura de GPS, reaproveitada no registro):
//   CPF → Local (GPS resolve/confirma a área) → Turno → [Justificativa,
//   se fora da janela] → Selfie → Confirmar.
//
// Entrada x Saída é decidido pelo sistema, não escolhido pela pessoa: se
// o CPF já tem um registro de hoje sem saída numa área de trabalho, o
// próximo é a saída dele. Área do tipo "Ponto de DDS" só registra
// chegada — é o que o GEMBA mapeou ("Presença em DDS, SEM checkout").
//
// A selfie é exigida (confirma visualmente quem está registrando) mas NÃO
// é guardada: sem Firebase Storage (que exige plano pago), o arquivo não
// sobe pra lugar nenhum — só a confirmação de que foi tirada fica
// registrada. Mesmo contorno já adotado no app-gestao-ml.
export default function RegistroPresencaScreen({ areaId }) {
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState('');
  const [areaFixa, setAreaFixa] = useState(null);
  const [areas, setAreas] = useState([]);
  const [colaboradores, setColaboradores] = useState([]);
  const [turnos, setTurnos] = useState([]);
  const [perfis, setPerfis] = useState([]);

  const [etapa, setEtapa] = useState('cpf'); // cpf | local | turno | justificativa | selfie | confirmar | sucesso | bloqueado
  const [modo, setModo] = useState('entrada'); // entrada | saida
  const [cpfDigitado, setCpfDigitado] = useState('');
  const [colaborador, setColaborador] = useState(null);
  const [areaEscolhida, setAreaEscolhida] = useState(null);
  const [posicao, setPosicao] = useState(null); // { lat, lng, distancia }
  const [turnoEscolhido, setTurnoEscolhido] = useState(null);
  const [turnoId, setTurnoId] = useState('');
  const [registroAberto, setRegistroAberto] = useState(null);
  const [statusJanela, setStatusJanela] = useState('normal');
  const [minutosDesvio, setMinutosDesvio] = useState(null);
  const [justificativa, setJustificativa] = useState('');
  const [selfie, setSelfie] = useState(null);

  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState('');
  const [mensagemBloqueio, setMensagemBloqueio] = useState('');

  const inputSelfieRef = useRef(null);
  const selfieUrl = useMemo(() => (selfie ? URL.createObjectURL(selfie) : null), [selfie]);
  useEffect(() => () => selfieUrl && URL.revokeObjectURL(selfieUrl), [selfieUrl]);

  // ======== Carga inicial ========
  useEffect(() => {
    let cancelado = false;
    async function carregar() {
      try {
        const [areasSnap, colabsSnap, turnosSnap, perfisSnap] = await Promise.all([
          getDocs(collection(db, 'areas')),
          getDocs(collection(db, 'colaboradores')),
          getDocs(collection(db, 'turnos')),
          getDocs(collection(db, 'perfis'))
        ]);
        if (cancelado) return;

        // Só áreas de presença (DDS/Serviço) entram aqui — esta tela é
        // sobre presença de colaboradores. Operação (pátio/produção de
        // VTI) não tem relação com isso.
        const todasAreas = areasSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((a) => a.status !== 'inativo' && ehTipoDePresenca(a.tipo));
        setAreas(todasAreas);
        setColaboradores(colabsSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => c.ativo !== false));
        setTurnos(turnosSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((t) => t.ativo !== false));
        setPerfis([PERFIL_ADMIN_PADRAO, ...perfisSnap.docs.map((d) => ({ id: d.id, ...d.data() }))]);

        if (areaId) {
          const snap = await getDoc(doc(db, 'areas', areaId));
          if (cancelado) return;
          if (!snap.exists() || snap.data().status === 'inativo') {
            setErroCarga('QR Code inválido ou área inativa. Fale com o Administrativo.');
            return;
          }
          const area = { id: snap.id, ...snap.data() };
          if (!ehTipoDePresenca(area.tipo)) {
            setErroCarga('Este QR Code não é de uma área de presença. Fale com o Administrativo.');
            return;
          }
          if (!temGeo(area)) {
            setErroCarga(`A área "${area.nome}" ainda não tem geolocalização cadastrada. Fale com o Administrativo.`);
            return;
          }
          setAreaFixa(area);
        } else if (todasAreas.length === 0) {
          setErroCarga('Nenhuma área de serviço cadastrada ainda. Fale com o Administrativo.');
        }
      } catch (e) {
        if (!cancelado) setErroCarga('Falha ao carregar os dados. Tente novamente.');
      } finally {
        if (!cancelado) setCarregando(false);
      }
    }
    carregar();
    return () => {
      cancelado = true;
    };
  }, [areaId]);

  const bloquear = (mensagem) => {
    setMensagemBloqueio(mensagem);
    setEtapa('bloqueado');
  };

  // ======== Etapa 1: CPF ========
  const confirmarCpf = async () => {
    setErro('');
    const cpfLimpo = normalizarCpf(cpfDigitado);
    if (!validarCpf(cpfLimpo)) {
      setErro('CPF inválido — confira os números digitados.');
      return;
    }
    const encontrado = colaboradores.find((c) => normalizarCpf(c.cpf) === cpfLimpo);
    if (!encontrado) {
      setErro('CPF não encontrado na base da ML. Fale com o Administrativo pra ser cadastrado.');
      return;
    }

    const minhasAreas = areasDoColaborador(encontrado, areas);
    if (minhasAreas.length === 0) {
      bloquear(`${encontrado.nome}, você ainda não está alocado em nenhuma área. Fale com o Administrativo.`);
      return;
    }
    if (areaFixa && !minhasAreas.some((a) => a.id === areaFixa.id)) {
      bloquear(`Você não está alocado na área "${areaFixa.nome}". Fale com o Administrativo.`);
      return;
    }

    setColaborador(encontrado);
    setProcessando(true);
    try {
      // Registro de hoje ainda aberto (chegada sem saída) define que o
      // próximo registro deste CPF é a SAÍDA — sem escolha manual.
      const snap = await getDocs(
        query(
          collection(db, 'registrosPresenca'),
          where('colaboradorId', '==', encontrado.id),
          where('data', '==', hojeISO())
        )
      );
      const registrosHoje = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const aberto = registrosHoje.find((r) => r.tipoRegistro === 'trabalho' && !r.dataHoraSaida);

      if (aberto) {
        const areaDoRegistro = areas.find((a) => a.id === aberto.areaId);
        if (areaFixa && areaFixa.id !== aberto.areaId) {
          bloquear(
            `Você tem uma chegada em aberto em "${areaDoRegistro?.nome || 'outra área'}". Registre a saída de lá antes.`
          );
          setProcessando(false);
          return;
        }
        setModo('saida');
        setRegistroAberto(aberto);
        setAreaEscolhida(areaDoRegistro || areaFixa);
        setTurnoId(aberto.turnoId || '');
        setTurnoEscolhido(turnos.find((t) => t.id === aberto.turnoId) || null);
        setProcessando(false);
        setEtapa('local');
        return;
      }

      setModo('entrada');
      setRegistroAberto(null);
      setProcessando(false);
      setEtapa('local');
    } catch (e) {
      setErro('Falha ao verificar seus registros. Tente novamente.');
      setProcessando(false);
    }
  };

  // ======== Etapa 2: Local (GPS resolve ou confirma a área) ========
  const confirmarLocal = async () => {
    setErro('');
    setProcessando(true);
    try {
      const { lat, lng } = await capturarGeolocalizacao();

      // Saída: a área já é a do registro aberto — só confere se a pessoa
      // está mesmo nela.
      // Entrada com QR: a área é a do QR — mesma conferência.
      const areaAlvo = modo === 'saida' ? areaEscolhida : areaFixa;

      if (areaAlvo) {
        const { distancia, dentro } = avaliarArea(areaAlvo, lat, lng);
        if (!dentro) {
          setErro(
            `Você está a ${Math.round(distancia)}m do centro de "${areaAlvo.nome}" — o limite é ${raioDaArea(
              areaAlvo
            )}m. Aproxime-se e tente de novo.`
          );
          setProcessando(false);
          return;
        }
        setAreaEscolhida(areaAlvo);
        setPosicao({ lat, lng, distancia });
        setProcessando(false);
        seguirAposLocal(areaAlvo);
        return;
      }

      // Link geral (sem QR): descobre a área pelo GPS, entre as que este
      // colaborador tem vinculadas.
      const minhasAreas = areasDoColaborador(colaborador, areas).filter(temGeo);
      const { escolhida, avaliadas } = resolverAreaPorGeo(minhasAreas, lat, lng);
      if (!escolhida) {
        const maisProxima = avaliadas[0];
        setErro(
          maisProxima
            ? `Você não está dentro de nenhuma das suas áreas. A mais próxima é "${
                maisProxima.area.nome
              }", a ${Math.round(maisProxima.distancia)}m (limite ${raioDaArea(maisProxima.area)}m).`
            : 'Nenhuma das suas áreas tem geolocalização cadastrada. Fale com o Administrativo.'
        );
        setProcessando(false);
        return;
      }
      setAreaEscolhida(escolhida.area);
      setPosicao({ lat, lng, distancia: escolhida.distancia });
      setProcessando(false);
      seguirAposLocal(escolhida.area);
    } catch (e) {
      setErro('Não foi possível capturar sua localização. Verifique a permissão de localização do navegador.');
      setProcessando(false);
    }
  };

  // Depois de saber a área, decide se ainda precisa perguntar o turno.
  const seguirAposLocal = async (area) => {
    if (modo === 'saida') {
      avaliarJanelaSaida(area);
      return;
    }

    const registrosHoje = await buscarRegistrosDeHoje();

    // Ponto de DDS: só chegada, uma por dia.
    if (area.tipo === 'dds') {
      const jaFez = registrosHoje.find((r) => r.tipoRegistro === 'dds' && r.areaId === area.id);
      if (jaFez) {
        bloquear(`Seu DDS de hoje já foi registrado às ${formatarHorario(jaFez.dataHoraEntrada)}.`);
        return;
      }
    } else {
      // Área de trabalho já fechada hoje (chegada + saída): uma nova
      // chegada no mesmo dia precisa passar pela liderança.
      //
      // NOTA DE FASE: no app-gestao-ml isso abre uma solicitação de
      // autorização (tela de Autorizações). Aqui, enquanto essa tela não
      // existe, o registro é bloqueado e a liderança resolve por fora —
      // trocar por solicitação quando a tela de liderança entrar.
      const jaFechado = registrosHoje.find(
        (r) => r.tipoRegistro === 'trabalho' && r.areaId === area.id && r.dataHoraSaida
      );
      if (jaFechado) {
        bloquear(
          `Você já registrou chegada e saída em "${area.nome}" hoje (${formatarHorario(
            jaFechado.dataHoraEntrada
          )} → ${formatarHorario(jaFechado.dataHoraSaida)}). Fale com a liderança pra registrar um novo período.`
        );
        return;
      }
    }

    const turnoPadrao = turnos.find((t) => t.id === colaborador.turnoPadraoId);
    if (turnoPadrao) {
      aplicarTurnoEntrada(area, turnoPadrao);
      return;
    }
    if (turnos.length === 1) {
      aplicarTurnoEntrada(area, turnos[0]);
      return;
    }
    if (turnos.length === 0) {
      // Sem turno cadastrado não há janela de horário pra validar — segue
      // sem turno em vez de travar a operação por causa de cadastro.
      aplicarTurnoEntrada(area, null);
      return;
    }
    setEtapa('turno');
  };

  const buscarRegistrosDeHoje = async () => {
    const snap = await getDocs(
      query(
        collection(db, 'registrosPresenca'),
        where('colaboradorId', '==', colaborador.id),
        where('data', '==', hojeISO())
      )
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  };

  // ======== Etapa 3: Turno ========
  const confirmarTurno = () => {
    if (!turnoId) {
      setErro('Selecione o turno.');
      return;
    }
    setErro('');
    aplicarTurnoEntrada(areaEscolhida, turnos.find((t) => t.id === turnoId) || null);
  };

  // ======== Janelas de horário ========
  // Chegada: ±10min do início do turno. Antes disso, bloqueia (o turno
  // ainda não começou). Depois, exige justificativa do atraso.
  //
  // NOTA DE FASE: no app-gestao-ml o atraso abre uma solicitação pra
  // liderança aprovar (tela de Autorizações). Aqui, na Fase 1, o atraso é
  // registrado com justificativa e fica visível no Dashboard — o fluxo de
  // aprovação entra junto com a tela de liderança, numa fase seguinte.
  const aplicarTurnoEntrada = (area, turno) => {
    setTurnoEscolhido(turno);
    setTurnoId(turno ? turno.id : '');

    // DDS acontece antes do turno começar — validar janela ali só geraria
    // falso bloqueio. O horário fica registrado (é o que alimenta o
    // indicador de dispersão DDS → área).
    if (area.tipo === 'dds' || !turno || !turno.horaInicio) {
      setStatusJanela('sem_horario');
      setMinutosDesvio(null);
      setEtapa('selfie');
      return;
    }

    // Tolerância cadastrada NA ÁREA (pedido do Pablo, 10/09/2026) — cai no
    // padrão de fábrica só se a área não tiver o campo gravado (área
    // antiga, criada antes dessa mudança).
    const tolerancia = area.toleranciaEntradaMin ?? TOLERANCIA_ENTRADA_MINUTOS;
    const status = statusJanelaEntrada(turno.horaInicio, new Date(), tolerancia);
    setStatusJanela(status);
    setMinutosDesvio(minutosDesdeInicioTurno(turno.horaInicio));

    if (status === 'antes') {
      bloquear(
        `O turno ${turno.nome} começa às ${turno.horaInicio}. Você pode registrar a chegada a partir de ${tolerancia} minutos antes.`
      );
      return;
    }
    if (status === 'atraso') {
      setJustificativa('');
      setEtapa('justificativa');
      return;
    }
    setEtapa('selfie');
  };

  // Saída: ±10min do fim do turno. Nunca bloqueia — fora da janela só
  // passa a exigir justificativa (antecipada pode gerar desconto; tempo
  // extra precisa ser justificado pra cobrança do cliente).
  const avaliarJanelaSaida = (area) => {
    const turno = turnos.find((t) => t.id === registroAberto.turnoId) || null;
    setTurnoEscolhido(turno);

    if (!turno || !turno.horaFim) {
      setStatusJanela('sem_horario');
      setMinutosDesvio(null);
      setEtapa('selfie');
      return;
    }
    const tolerancia = area.toleranciaSaidaMin ?? TOLERANCIA_SAIDA_MINUTOS;
    const status = statusJanelaSaida(registroAberto.data, turno.horaInicio, turno.horaFim, new Date(), tolerancia);
    setStatusJanela(status);
    setMinutosDesvio(minutosAteFimTurno(registroAberto.data, turno.horaInicio, turno.horaFim));

    if (status === 'normal' || status === 'sem_horario') {
      setEtapa('selfie');
      return;
    }
    setJustificativa('');
    setEtapa('justificativa');
  };

  const confirmarJustificativa = () => {
    if (!justificativa.trim()) {
      setErro('Explique o motivo pra continuar.');
      return;
    }
    setErro('');
    setEtapa('selfie');
  };

  const confirmarSelfie = () => {
    if (!selfie) {
      setErro('Tire a selfie pra continuar.');
      return;
    }
    setErro('');
    setEtapa('confirmar');
  };

  // ======== Gravação ========
  const gravar = async () => {
    setProcessando(true);
    setErro('');
    try {
      if (modo === 'saida') {
        await updateDoc(doc(db, 'registrosPresenca', registroAberto.id), {
          dataHoraSaida: serverTimestamp(),
          geoLatSaida: posicao.lat,
          geoLngSaida: posicao.lng,
          distanciaSaidaMetros: Math.round(posicao.distancia),
          saidaStatusJanela: statusJanela,
          saidaMinutosDesvio: minutosDesvio,
          saidaJustificativa: justificativa.trim() || null
        });
      } else {
        // Perfil denormalizado no registro (mesmo padrão de areaNome/
        // turnoNome abaixo) — assim o Dashboard mostra o nome sem
        // precisar buscar `perfis` de novo.
        const perfilDoColaborador = perfis.find((p) => p.id === colaborador.perfilId);
        await addDoc(collection(db, 'registrosPresenca'), {
          colaboradorId: colaborador.id,
          colaboradorNome: colaborador.nome,
          cpf: normalizarCpf(colaborador.cpf),
          perfilId: colaborador.perfilId || null,
          perfilNome: perfilDoColaborador ? perfilDoColaborador.nome : null,
          areaId: areaEscolhida.id,
          areaNome: areaEscolhida.nome,
          tipoRegistro: areaEscolhida.tipo === 'dds' ? 'dds' : 'trabalho',
          turnoId: turnoEscolhido ? turnoEscolhido.id : null,
          turnoNome: turnoEscolhido ? turnoEscolhido.nome : null,
          data: hojeISO(),
          dataHoraEntrada: serverTimestamp(),
          geoLatEntrada: posicao.lat,
          geoLngEntrada: posicao.lng,
          distanciaEntradaMetros: Math.round(posicao.distancia),
          entradaStatusJanela: statusJanela,
          entradaMinutosDesvio: minutosDesvio,
          entradaJustificativa: justificativa.trim() || null,
          // Preenchidos só quando a saída for registrada (nunca, no caso
          // de área do tipo DDS).
          dataHoraSaida: null,
          geoLatSaida: null,
          geoLngSaida: null,
          distanciaSaidaMetros: null,
          saidaStatusJanela: null,
          saidaMinutosDesvio: null,
          saidaJustificativa: null
        });
      }
      setEtapa('sucesso');
    } catch (e) {
      setErro('Falha ao gravar o registro. Tente novamente.');
    } finally {
      setProcessando(false);
    }
  };

  // Uma página web não consegue voltar pra tela inicial do celular. O
  // máximo possível: tentar fechar a aba e, se o navegador ignorar, ir
  // pra uma página em branco — o importante é nunca voltar sozinho pro
  // campo de CPF com o registro de outra pessoa na tela.
  const sair = () => {
    window.close();
    window.location.href = 'about:blank';
  };

  // ======== Render ========
  if (carregando) {
    return (
      <div style={styles.pagina}>
        <p>Carregando...</p>
      </div>
    );
  }

  if (erroCarga) {
    return (
      <div style={styles.pagina}>
        <div style={styles.card}>
          <Cabecalho />
          <p style={styles.erroBloqueio}>❌ {erroCarga}</p>
        </div>
      </div>
    );
  }

  const ehSaida = modo === 'saida';
  const tituloTela = ehSaida ? 'Registrar saída' : 'Registrar chegada';

  return (
    <div style={styles.pagina}>
      <div style={styles.card}>
        <Cabecalho />
        <h2 style={styles.titulo}>{etapa === 'cpf' ? 'Registro de presença' : tituloTela}</h2>
        <p style={styles.subtitulo}>
          {areaEscolhida ? areaEscolhida.nome : areaFixa ? areaFixa.nome : 'Brametal — operação ML'}
        </p>

        {etapa === 'cpf' && (
          <>
            <label style={styles.rotulo}>
              CPF *
              <input
                type="text"
                inputMode="numeric"
                style={styles.input}
                value={cpfDigitado}
                onChange={(e) => setCpfDigitado(formatarCpf(e.target.value))}
                placeholder="000.000.000-00"
                maxLength={14}
                autoFocus
              />
            </label>
            <p style={styles.textoAjuda}>
              Já registrou a chegada hoje? Digite o CPF de novo pra registrar a saída.
            </p>
            {erro && <div style={styles.erroTexto}>❌ {erro}</div>}
            <button style={styles.botaoGrande} onClick={confirmarCpf} disabled={processando}>
              {processando ? 'Verificando...' : 'Continuar'}
            </button>
          </>
        )}

        {etapa === 'local' && (
          <>
            <p style={styles.textoInfo}>
              Olá, <strong>{colaborador.nome}</strong>!
              <br />
              {areaFixa || ehSaida ? (
                <>
                  Confirme que você está em <strong>{(areaEscolhida || areaFixa).nome}</strong>.
                </>
              ) : (
                <>Vamos identificar em qual área você está.</>
              )}
            </p>
            {erro && <div style={styles.erroTexto}>❌ {erro}</div>}
            <button style={styles.botaoGrande} onClick={confirmarLocal} disabled={processando}>
              {processando ? 'Localizando...' : '📍 Confirmar minha localização'}
            </button>
          </>
        )}

        {etapa === 'turno' && (
          <>
            <p style={styles.textoInfo}>Qual turno você está iniciando?</p>
            <label style={styles.rotulo}>
              Turno *
              <select style={styles.input} value={turnoId} onChange={(e) => setTurnoId(e.target.value)}>
                <option value="">Selecione...</option>
                {turnos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome} ({t.horaInicio}–{t.horaFim})
                  </option>
                ))}
              </select>
            </label>
            {erro && <div style={styles.erroTexto}>❌ {erro}</div>}
            <button style={styles.botaoGrande} onClick={confirmarTurno}>
              Continuar
            </button>
          </>
        )}

        {etapa === 'justificativa' && (
          <>
            <p style={styles.textoInfo}>
              {statusJanela === 'atraso' && (
                <>
                  Você está registrando a chegada <strong>{minutosDesvio}min depois</strong> do início do turno{' '}
                  {turnoEscolhido?.nome} ({turnoEscolhido?.horaInicio}). Explique o motivo do atraso:
                </>
              )}
              {statusJanela === 'antecipada' && (
                <>
                  Você está saindo <strong>{Math.abs(minutosDesvio)}min antes</strong> do fim do turno{' '}
                  {turnoEscolhido?.nome} ({turnoEscolhido?.horaFim}). Saídas antecipadas de mais de{' '}
                  {areaEscolhida?.toleranciaSaidaMin ?? TOLERANCIA_SAIDA_MINUTOS}min podem gerar{' '}
                  <strong>desconto no pagamento</strong>. Explique o motivo:
                </>
              )}
              {statusJanela === 'atrasada' && (
                <>
                  Você está saindo <strong>{minutosDesvio}min depois</strong> do fim do turno {turnoEscolhido?.nome}{' '}
                  ({turnoEscolhido?.horaFim}). Esse tempo extra precisa ser justificado pra ser{' '}
                  <strong>cobrado do cliente</strong>. Explique o motivo:
                </>
              )}
            </p>
            <label style={styles.rotulo}>
              Motivo *
              <textarea
                style={styles.textarea}
                rows={4}
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
                placeholder="Explique o motivo..."
                autoFocus
              />
            </label>
            {erro && <div style={styles.erroTexto}>❌ {erro}</div>}
            <button style={styles.botaoGrande} onClick={confirmarJustificativa}>
              Continuar
            </button>
          </>
        )}

        {etapa === 'selfie' && (
          <>
            <p style={styles.textoInfo}>
              {ehSaida ? 'Tire uma selfie pra confirmar sua saída.' : 'Tire uma selfie pra confirmar quem é você.'}
            </p>
            <button type="button" onClick={() => inputSelfieRef.current?.click()} style={styles.fotoSlot}>
              {selfieUrl ? (
                <img src={selfieUrl} alt="Selfie" style={styles.fotoThumb} />
              ) : (
                <span style={styles.fotoIcone}>🤳</span>
              )}
            </button>
            <input
              ref={inputSelfieRef}
              type="file"
              accept="image/*"
              capture="user"
              style={{ display: 'none' }}
              onChange={(e) => setSelfie(e.target.files[0] || null)}
            />
            {erro && <div style={styles.erroTexto}>❌ {erro}</div>}
            <button style={styles.botaoGrande} onClick={confirmarSelfie}>
              Continuar
            </button>
          </>
        )}

        {etapa === 'confirmar' && (
          <>
            <div style={styles.resumo}>
              <LinhaResumo rotulo="Colaborador" valor={colaborador.nome} />
              <LinhaResumo rotulo="Área" valor={areaEscolhida.nome} />
              <LinhaResumo
                rotulo="Registro"
                valor={ehSaida ? 'Saída' : areaEscolhida.tipo === 'dds' ? 'Chegada no DDS' : 'Chegada'}
              />
              {turnoEscolhido && <LinhaResumo rotulo="Turno" valor={turnoEscolhido.nome} />}
              <LinhaResumo rotulo="Distância do ponto" valor={`${Math.round(posicao.distancia)}m`} />
              {justificativa.trim() && <LinhaResumo rotulo="Justificativa" valor={justificativa.trim()} />}
            </div>
            {erro && <div style={styles.erroTexto}>❌ {erro}</div>}
            <button style={styles.botaoGrande} onClick={gravar} disabled={processando}>
              {processando ? 'Gravando...' : ehSaida ? '✅ Confirmar saída' : '✅ Confirmar chegada'}
            </button>
          </>
        )}

        {etapa === 'sucesso' && (
          <div style={styles.final}>
            <p style={styles.finalIcone}>✅</p>
            <p style={styles.finalTexto}>
              {ehSaida ? `Saída registrada, ${colaborador.nome}!` : `Chegada registrada, ${colaborador.nome}!`}
              <br />
              {areaEscolhida.nome}
              {turnoEscolhido ? ` — ${turnoEscolhido.nome}` : ''}
            </p>
            {areaEscolhida.tipo === 'dds' && !ehSaida && (
              <p style={styles.finalNota}>Bom trabalho! Ao chegar na sua área, registre a chegada lá também.</p>
            )}
            <button style={styles.botaoSecundario} onClick={sair}>
              Fechar
            </button>
          </div>
        )}

        {etapa === 'bloqueado' && (
          <div style={styles.final}>
            <p style={styles.finalIcone}>❌</p>
            <p style={{ ...styles.finalTexto, color: '#D32F2F' }}>{mensagemBloqueio}</p>
            <button style={styles.botaoSecundario} onClick={sair}>
              Fechar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Cabecalho() {
  return (
    <div style={styles.cabecalho}>
      <img src={LOGO_ML} alt="ML Serviços" style={styles.logoMl} />
      <span style={styles.cabecalhoSeparador} />
      <LogoBrametal altura={26} />
    </div>
  );
}

function LinhaResumo({ rotulo, valor }) {
  return (
    <div style={styles.resumoLinha}>
      <span style={styles.resumoRotulo}>{rotulo}</span>
      <span style={styles.resumoValor}>{valor}</span>
    </div>
  );
}

const styles = {
  pagina: { display: 'flex', justifyContent: 'center', padding: '24px 16px', minHeight: '100vh', background: '#F5F7FA' },
  card: {
    background: '#FFF',
    borderRadius: 12,
    padding: '24px 20px 28px',
    width: '100%',
    maxWidth: 420,
    height: 'fit-content',
    boxShadow: '0 1px 6px rgba(0,0,0,0.1)'
  },

  cabecalho: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingBottom: 16,
    marginBottom: 16,
    borderBottom: '1px solid #EEE'
  },
  logoMl: { height: 30, width: 'auto', display: 'block' },
  cabecalhoSeparador: { width: 1, height: 22, background: '#DDD' },

  titulo: { margin: '0 0 4px', color: NAVY, fontSize: 20, textAlign: 'center' },
  subtitulo: { margin: '0 0 20px', color: '#666', fontSize: 15, textAlign: 'center', fontWeight: 600 },
  textoInfo: { fontSize: 15, color: '#333', textAlign: 'center', marginBottom: 16, lineHeight: 1.5 },
  textoAjuda: { fontSize: 12, color: '#999', textAlign: 'center', margin: '-10px 0 16px' },

  rotulo: { display: 'flex', flexDirection: 'column', fontSize: 14, fontWeight: 600, color: '#444', gap: 6, marginBottom: 16 },
  // fontSize 16 evita o zoom automático do iOS ao focar o campo.
  input: { padding: '13px 12px', borderRadius: 8, border: '1px solid #CCC', fontSize: 16, fontWeight: 400, background: '#FFF' },
  textarea: {
    padding: '13px 12px',
    borderRadius: 8,
    border: '1px solid #CCC',
    fontSize: 16,
    fontWeight: 400,
    background: '#FFF',
    fontFamily: 'inherit',
    resize: 'vertical'
  },

  fotoSlot: {
    width: '100%',
    aspectRatio: '1',
    maxWidth: 220,
    margin: '0 auto 16px',
    display: 'block',
    borderRadius: 12,
    border: '2px dashed #BBB',
    background: '#FAFAFA',
    cursor: 'pointer',
    padding: 0,
    overflow: 'hidden'
  },
  fotoThumb: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  fotoIcone: { fontSize: 40 },

  resumo: { background: '#F8F9FB', borderRadius: 8, padding: 14, marginBottom: 16 },
  resumoLinha: { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', fontSize: 14 },
  resumoRotulo: { color: '#777' },
  resumoValor: { color: '#222', fontWeight: 600, textAlign: 'right' },

  erroTexto: { color: '#D32F2F', marginBottom: 12, fontSize: 14, textAlign: 'center' },
  erroBloqueio: { color: '#D32F2F', fontSize: 15, textAlign: 'center' },

  botaoGrande: {
    width: '100%',
    padding: 16,
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: 17,
    background: ORANGE,
    color: '#FFF'
  },
  botaoSecundario: {
    width: '100%',
    padding: 14,
    border: '1px solid #CCC',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 15,
    background: '#FFF',
    color: '#444',
    marginTop: 14
  },

  final: { textAlign: 'center', padding: '12px 0' },
  finalIcone: { fontSize: 48, margin: 0 },
  finalTexto: { fontSize: 17, color: NAVY, fontWeight: 600, lineHeight: 1.5 },
  finalNota: { fontSize: 13, color: '#666', marginTop: -4 }
};

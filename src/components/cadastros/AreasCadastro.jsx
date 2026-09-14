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
  orderBy,
  serverTimestamp
} from '../../lib/db';
import QRCode from 'qrcode';
import { ui, NAVY } from '../../lib/styles';
import { capturarGeolocalizacao } from '../../lib/geo';
import { TOLERANCIA_ENTRADA_MINUTOS, TOLERANCIA_SAIDA_MINUTOS } from '../../lib/data';
import {
  OPCOES_TIPO_AREA,
  RAIO_PADRAO_METROS,
  RAIO_MINIMO_METROS,
  RAIO_MAXIMO_METROS,
  rotuloTipoArea,
  rotuloSubtipoArea,
  valorTipoArea,
  opcaoTipoArea,
  montarUrlRegistro
} from '../../lib/areas';

const LOGO_ML = `${process.env.PUBLIC_URL}/logos/logo-ml.png`;
const LOGO_BRAMETAL = `${process.env.PUBLIC_URL}/logos/logo-brametal.png`;

const AREA_VAZIA = {
  nome: '',
  tipo: 'servico',
  subtipo: 'trabalho',
  toleranciaEntradaMin: TOLERANCIA_ENTRADA_MINUTOS,
  toleranciaSaidaMin: TOLERANCIA_SAIDA_MINUTOS,
  geoLat: null,
  geoLng: null,
  geoCapturadoEm: null,
  raioMetros: RAIO_PADRAO_METROS,
  observacao: '',
  status: 'ativo'
};

// Cadastro central deste app: é a Área que amarra presença, alocação de
// colaborador e (nas fases seguintes) a movimentação de VTI. Ver
// lib/areas.js pro significado de tipo (nível 1: Serviço/Operação) e
// subtipo (nível 2, depende do tipo escolhido).
export default function AreasCadastro({ permissoes }) {
  const temAcesso = Boolean(permissoes.acessos?.areas);
  const perm = { criar: temAcesso, editar: temAcesso, deletar: temAcesso };

  const [areas, setAreas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [formAberto, setFormAberto] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState(AREA_VAZIA);
  const [salvando, setSalvando] = useState(false);
  const [capturandoGeo, setCapturandoGeo] = useState(false);
  const [erro, setErro] = useState('');
  const [qrArea, setQrArea] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'areas'), orderBy('nome'));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setAreas(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setCarregando(false);
      },
      () => setCarregando(false)
    );
    return () => unsubscribe();
  }, []);

  const abrirNovo = () => {
    setForm(AREA_VAZIA);
    setEditandoId(null);
    setFormAberto(true);
    setErro('');
  };

  const abrirEdicao = (area) => {
    setForm({
      nome: area.nome || '',
      tipo: area.tipo || 'servico',
      subtipo: area.subtipo || (area.tipo === 'operacao' ? 'patio' : 'trabalho'),
      toleranciaEntradaMin: area.toleranciaEntradaMin ?? TOLERANCIA_ENTRADA_MINUTOS,
      toleranciaSaidaMin: area.toleranciaSaidaMin ?? TOLERANCIA_SAIDA_MINUTOS,
      geoLat: area.geoLat ?? null,
      geoLng: area.geoLng ?? null,
      geoCapturadoEm: area.geoCapturadoEm ?? null,
      raioMetros: area.raioMetros ?? RAIO_PADRAO_METROS,
      observacao: area.observacao || '',
      status: area.status || 'ativo'
    });
    setEditandoId(area.id);
    setFormAberto(true);
    setErro('');
  };

  const cancelar = () => {
    setFormAberto(false);
    setEditandoId(null);
    setForm(AREA_VAZIA);
    setErro('');
  };

  // O select do formulário mostra as 4 combinações (tipo+subtipo) já
  // prontas num campo só — troca os dois de uma vez a partir do valor
  // combinado "tipo:subtipo" (ver OPCOES_TIPO_AREA em lib/areas.js).
  const mudarTipoCombinado = (valor) => {
    const [novoTipo, novoSubtipo] = valor.split(':');
    setForm((f) => ({ ...f, tipo: novoTipo, subtipo: novoSubtipo }));
  };

  const ehServico = form.tipo === 'servico';
  const ehTrabalho = ehServico && form.subtipo === 'trabalho';

  // O ponto precisa ser capturado NO local (o celular de quem está lá) —
  // é esse ponto que vira o centro do raio de abrangência. Por isso o
  // cadastro de área costuma ser feito em campo, não na mesa.
  const handleCapturarGeo = async () => {
    setCapturandoGeo(true);
    setErro('');
    try {
      const { lat, lng } = await capturarGeolocalizacao();
      setForm((f) => ({ ...f, geoLat: lat, geoLng: lng, geoCapturadoEm: new Date().toISOString() }));
    } catch (e) {
      setErro('Não foi possível capturar a localização. Verifique a permissão de localização do navegador.');
    } finally {
      setCapturandoGeo(false);
    }
  };

  const salvar = async () => {
    if (!form.nome.trim()) {
      setErro('Informe o nome da área.');
      return;
    }
    const duplicado = areas.some(
      (a) => a.id !== editandoId && (a.nome || '').trim().toLowerCase() === form.nome.trim().toLowerCase()
    );
    if (duplicado) {
      setErro('Já existe uma área com esse nome.');
      return;
    }
    const raio = Number(form.raioMetros);
    if (!Number.isFinite(raio) || raio < RAIO_MINIMO_METROS || raio > RAIO_MAXIMO_METROS) {
      setErro(`O raio de abrangência precisa ficar entre ${RAIO_MINIMO_METROS}m e ${RAIO_MAXIMO_METROS}m.`);
      return;
    }
    let toleranciaEntrada = null;
    let toleranciaSaida = null;
    if (ehServico) {
      toleranciaEntrada = Number(form.toleranciaEntradaMin);
      if (!Number.isFinite(toleranciaEntrada) || toleranciaEntrada < 0 || toleranciaEntrada > 180) {
        setErro('A tolerância de entrada precisa ficar entre 0 e 180 minutos.');
        return;
      }
      if (ehTrabalho) {
        toleranciaSaida = Number(form.toleranciaSaidaMin);
        if (!Number.isFinite(toleranciaSaida) || toleranciaSaida < 0 || toleranciaSaida > 180) {
          setErro('A tolerância de saída precisa ficar entre 0 e 180 minutos.');
          return;
        }
      }
    }
    setSalvando(true);
    setErro('');
    try {
      const payload = {
        nome: form.nome.trim(),
        tipo: form.tipo,
        subtipo: form.subtipo,
        toleranciaEntradaMin: toleranciaEntrada,
        toleranciaSaidaMin: toleranciaSaida,
        geoLat: form.geoLat,
        geoLng: form.geoLng,
        geoCapturadoEm: form.geoCapturadoEm,
        raioMetros: raio,
        observacao: form.observacao.trim(),
        status: form.status
      };
      if (editandoId) {
        await updateDoc(doc(db, 'areas', editandoId), { ...payload, atualizadoEm: serverTimestamp() });
      } else {
        await addDoc(collection(db, 'areas'), { ...payload, criadoEm: serverTimestamp() });
      }
      cancelar();
    } catch (e) {
      setErro('Falha ao salvar a área. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (area) => {
    if (!window.confirm(`Excluir a área "${area.nome}"? Colaboradores vinculados a ela ficam sem local.`)) return;
    try {
      await deleteDoc(doc(db, 'areas', area.id));
    } catch (e) {
      setErro('Falha ao excluir. Tente novamente.');
    }
  };

  const gerarQr = async (area) => {
    setQrArea(area);
    setQrDataUrl('');
    try {
      const url = await QRCode.toDataURL(montarUrlRegistro(area.id), { width: 320, margin: 1 });
      setQrDataUrl(url);
    } catch (e) {
      setErro('Falha ao gerar o QR Code.');
      setQrArea(null);
    }
  };

  const fecharQr = () => {
    setQrArea(null);
    setQrDataUrl('');
  };

  // Abre uma janela própria só com o QR Code + as duas logos, pronta pra
  // imprimir e fixar na área — pedido do Pablo (10/09/2026): não perguntar
  // mais se a área "vai ter placa", só sempre oferecer gerar e imprimir.
  const imprimirQr = () => {
    if (!qrDataUrl || !qrArea) return;
    const janela = window.open('', '_blank', 'width=480,height=680');
    if (!janela) {
      setErro('Não foi possível abrir a janela de impressão — verifique o bloqueador de pop-ups do navegador.');
      return;
    }
    janela.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>QR Code — ${qrArea.nome}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; text-align: center; padding: 32px 24px; color: #1A1A1A; }
  .logos { display: flex; align-items: center; justify-content: center; gap: 20px; margin-bottom: 24px; }
  .logos img { height: 56px; width: auto; }
  .separador { width: 1px; height: 40px; background: #CCC; }
  h1 { font-size: 22px; color: #1E3A5F; margin: 0 0 20px; }
  p.instrucao { font-size: 14px; color: #555; margin: 20px 0 0; }
  img.qr { width: 300px; height: 300px; margin-top: 8px; }
  @media print {
    body { padding: 0; }
  }
</style>
</head>
<body>
  <div class="logos">
    <img src="${LOGO_ML}" alt="ML Serviços" />
    <div class="separador"></div>
    <img src="${LOGO_BRAMETAL}" alt="Brametal" />
  </div>
  <h1>${qrArea.nome}</h1>
  <img class="qr" src="${qrDataUrl}" alt="QR Code" />
  <p class="instrucao">Escaneie para registrar presença</p>
</body>
</html>`);
    janela.document.close();
    // As logos precisam terminar de carregar antes do print — sem isso,
    // parte das impressões sai sem elas (o print dispara rápido demais).
    setTimeout(() => {
      janela.focus();
      janela.print();
    }, 400);
  };

  return (
    <div>
      <div style={ui.sectionHeaderRow}>
        <h2 style={ui.sectionTitle}>Áreas</h2>
        {perm.criar && !formAberto && (
          <button style={ui.primaryButton} onClick={abrirNovo}>
            ➕ Nova área
          </button>
        )}
      </div>

      <p style={ui.placeholderNote}>
        <strong>Área de Serviço</strong>: onde os colaboradores batem presença (DDS, áreas de
        trabalho). <strong>Área de Operação</strong>: onde as VTIs são movimentadas (pátio,
        produção) — cadastro já disponível, a tela de movimentação vem numa fase seguinte. Em
        todas, a validação é feita por <strong>geolocalização</strong>; o QR Code é sempre
        opcional, só um atalho pra abrir a tela já na área certa.
      </p>

      {erro && <div style={ui.erro}>❌ {erro}</div>}

      {formAberto && (
        <div style={ui.formCard}>
          <h3 style={{ marginTop: 0 }}>{editandoId ? 'Editar área' : 'Nova área'}</h3>

          <div style={ui.formGrid}>
            <label style={ui.label}>
              Nome da área *
              <input
                style={ui.input}
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex: Pátio Novo"
              />
            </label>
            <label style={ui.label}>
              Tipo *
              <select
                style={ui.input}
                value={valorTipoArea(form.tipo, form.subtipo)}
                onChange={(e) => mudarTipoCombinado(e.target.value)}
              >
                {['Área de Serviço', 'Área de Operação'].map((grupo) => (
                  <optgroup key={grupo} label={grupo}>
                    {OPCOES_TIPO_AREA.filter((o) => o.grupo === grupo).map((o) => (
                      <option key={valorTipoArea(o.tipo, o.subtipo)} value={valorTipoArea(o.tipo, o.subtipo)}>
                        {o.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <span style={styles.ajuda}>{opcaoTipoArea(form.tipo, form.subtipo)?.descricao}</span>
            </label>
            <label style={ui.label}>
              Status
              <select style={ui.input} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </label>
          </div>

          {ehServico && (
            <>
              <h4 style={styles.subtitulo}>Tolerância de registro</h4>
              <div style={styles.geoBox}>
                <div style={ui.formGridCompacto}>
                  <label style={ui.label}>
                    Entrada (min) *
                    <input
                      type="number"
                      min={0}
                      max={180}
                      style={ui.input}
                      value={form.toleranciaEntradaMin}
                      onChange={(e) => setForm({ ...form, toleranciaEntradaMin: e.target.value })}
                    />
                  </label>
                  {ehTrabalho && (
                    <label style={ui.label}>
                      Saída (min) *
                      <input
                        type="number"
                        min={0}
                        max={180}
                        style={ui.input}
                        value={form.toleranciaSaidaMin}
                        onChange={(e) => setForm({ ...form, toleranciaSaidaMin: e.target.value })}
                      />
                    </label>
                  )}
                </div>
                <span style={styles.ajuda}>
                  Quantos minutos antes/depois do início (e do fim, se a área tiver saída) o
                  colaborador ainda registra sem precisar de autorização.
                </span>
              </div>
            </>
          )}

          <h4 style={styles.subtitulo}>Geolocalização e abrangência</h4>
          <div style={styles.geoBox}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button type="button" style={ui.secondaryButton} onClick={handleCapturarGeo} disabled={capturandoGeo}>
                {capturandoGeo ? 'Capturando...' : '📍 Capturar localização atual'}
              </button>
              {form.geoLat != null && form.geoLng != null ? (
                <span style={{ fontSize: 13, color: '#1E7A34' }}>
                  ✅ Ponto gravado ({Number(form.geoLat).toFixed(5)}, {Number(form.geoLng).toFixed(5)})
                </span>
              ) : (
                <span style={{ fontSize: 13, color: '#B85700' }}>
                  ⚠️ Sem ponto ainda — a área não aceita registro enquanto isso.
                </span>
              )}
            </div>
            <p style={styles.ajuda}>
              Capture estando <strong>dentro da área</strong>. Cadastrando da mesa, dá pra digitar
              as coordenadas abaixo.
            </p>

            <div style={ui.formGridCompacto}>
              <label style={ui.label}>
                Latitude
                <input
                  style={ui.input}
                  value={form.geoLat ?? ''}
                  onChange={(e) => setForm({ ...form, geoLat: e.target.value === '' ? null : Number(e.target.value) })}
                  placeholder="-23.55052"
                />
              </label>
              <label style={ui.label}>
                Longitude
                <input
                  style={ui.input}
                  value={form.geoLng ?? ''}
                  onChange={(e) => setForm({ ...form, geoLng: e.target.value === '' ? null : Number(e.target.value) })}
                  placeholder="-46.63331"
                />
              </label>
              <label style={ui.label}>
                Raio (m) *
                <input
                  type="number"
                  min={RAIO_MINIMO_METROS}
                  max={RAIO_MAXIMO_METROS}
                  style={ui.input}
                  value={form.raioMetros}
                  onChange={(e) => setForm({ ...form, raioMetros: e.target.value })}
                />
              </label>
            </div>
            <span style={styles.ajuda}>
              Distância máxima do ponto pra o registro ser aceito ({RAIO_MINIMO_METROS}m–
              {RAIO_MAXIMO_METROS}m — abaixo de {RAIO_MINIMO_METROS}m o GPS do celular fica instável).
            </span>
          </div>

          <label style={{ ...ui.label, marginBottom: 16 }}>
            Observação
            <input
              style={ui.input}
              value={form.observacao}
              onChange={(e) => setForm({ ...form, observacao: e.target.value })}
              placeholder="Referência do local, acesso, cuidados..."
            />
          </label>

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
        <p>Carregando áreas...</p>
      ) : areas.length === 0 ? (
        <p style={ui.placeholderNote}>Nenhuma área cadastrada ainda.</p>
      ) : (
        <div style={ui.tableWrapper}>
          <table style={ui.table}>
            <thead>
              <tr>
                <th style={ui.th}>Área</th>
                <th style={ui.th}>Tipo</th>
                <th style={ui.th}>Categoria</th>
                <th style={ui.th}>Tolerância</th>
                <th style={ui.th}>Geolocalização</th>
                <th style={ui.th}>Raio</th>
                <th style={ui.th}>Status</th>
                <th style={ui.th}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {areas.map((a) => (
                <tr key={a.id}>
                  <td style={ui.td}>
                    <strong>{a.nome}</strong>
                    {a.codigo && <span style={styles.codigo}>{a.codigo}</span>}
                    {a.observacao && <div style={styles.observacao}>{a.observacao}</div>}
                  </td>
                  <td style={ui.td}>
                    <span style={{ ...ui.badge, ...(a.tipo === 'operacao' ? ui.badgeAzul : ui.badgeLaranja) }}>
                      {rotuloTipoArea(a.tipo)}
                    </span>
                  </td>
                  <td style={ui.td}>{rotuloSubtipoArea(a)}</td>
                  <td style={ui.td}>
                    {a.tipo === 'servico' ? (
                      a.subtipo === 'trabalho' ? (
                        <span style={{ fontSize: 12, color: '#555' }}>
                          {a.toleranciaEntradaMin ?? TOLERANCIA_ENTRADA_MINUTOS}min / {a.toleranciaSaidaMin ?? TOLERANCIA_SAIDA_MINUTOS}min
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, color: '#555' }}>{a.toleranciaEntradaMin ?? TOLERANCIA_ENTRADA_MINUTOS}min</span>
                      )
                    ) : (
                      <span style={{ color: '#999' }}>—</span>
                    )}
                  </td>
                  <td style={ui.td}>
                    {a.geoLat != null ? (
                      <span style={{ ...ui.badge, ...ui.badgeVerde }}>Capturada</span>
                    ) : (
                      <span style={{ ...ui.badge, ...ui.badgeVermelho }}>Pendente</span>
                    )}
                  </td>
                  <td style={ui.td}>{a.raioMetros ?? RAIO_PADRAO_METROS} m</td>
                  <td style={ui.td}>
                    <span style={{ ...ui.badge, ...(a.status === 'ativo' ? ui.badgeVerde : ui.badgeCinza) }}>
                      {a.status === 'ativo' ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td style={ui.td}>
                    {perm.editar && (
                      <button style={ui.linkButton} onClick={() => abrirEdicao(a)}>
                        Editar
                      </button>
                    )}
                    <button style={ui.linkButton} onClick={() => gerarQr(a)}>
                      🔗 QR Code
                    </button>
                    {perm.deletar && (
                      <button style={{ ...ui.linkButton, color: '#D32F2F' }} onClick={() => excluir(a)}>
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

      <div style={styles.linkGeralBox}>
        <strong style={{ color: NAVY }}>Link geral de presença (áreas de serviço sem QR Code)</strong>
        <code style={styles.linkGeral}>{montarUrlRegistro(null)}</code>
        <span style={styles.ajuda}>
          Quem abrir este link digita o CPF e o app descobre a área pela geolocalização, entre as
          áreas de serviço vinculadas a esse colaborador.
        </span>
      </div>

      {qrArea && (
        <div style={styles.overlay} onClick={fecharQr}>
          <div style={styles.qrModal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, color: NAVY }}>QR Code — {qrArea.nome}</h3>
            <p style={ui.placeholderNote}>
              Imprima e fixe na área. O colaborador escaneia pra abrir o registro já nesta área.
            </p>
            {qrDataUrl ? (
              <img src={qrDataUrl} alt={`QR Code de ${qrArea.nome}`} style={styles.qrImg} />
            ) : (
              <p>Gerando...</p>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
              {qrDataUrl && (
                <>
                  <button style={ui.primaryButton} onClick={imprimirQr}>
                    🖨️ Imprimir (com logos)
                  </button>
                  <a
                    href={qrDataUrl}
                    download={`qrcode-${(qrArea.nome || 'area').replace(/\s+/g, '-').toLowerCase()}.png`}
                    style={{ ...ui.secondaryButton, textDecoration: 'none', display: 'inline-block' }}
                  >
                    ⬇️ Baixar PNG
                  </a>
                </>
              )}
              <button style={ui.secondaryButton} onClick={fecharQr}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  ajuda: { fontSize: 12, color: '#777', fontWeight: 400 },
  subtitulo: { margin: '18px 0 8px', color: NAVY },
  geoBox: { background: '#F8F9FB', borderRadius: 8, padding: 16, marginBottom: 16 },
  codigo: {
    marginLeft: 8,
    fontSize: 11,
    fontWeight: 700,
    color: '#666',
    background: '#F0F0F0',
    borderRadius: 4,
    padding: '2px 6px'
  },
  observacao: { fontSize: 12, color: '#888', marginTop: 3 },
  linkGeralBox: {
    marginTop: 24,
    padding: 16,
    background: '#FFF',
    borderRadius: 8,
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    display: 'flex',
    flexDirection: 'column',
    gap: 6
  },
  linkGeral: { fontSize: 13, color: '#333', background: '#F3F5F8', borderRadius: 4, padding: '8px 10px', wordBreak: 'break-all' },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: 16,
    overflowY: 'auto'
  },
  // `maxHeight` + `overflowY` evitam que os botões fiquem inacessíveis
  // quando a janela é baixa (o conteúdo cresceu depois que "Imprimir"
  // entrou ao lado de "Baixar PNG").
  qrModal: {
    background: '#FFF',
    borderRadius: 10,
    padding: 28,
    maxWidth: 380,
    width: '90%',
    maxHeight: '90vh',
    overflowY: 'auto',
    textAlign: 'center',
    boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
    margin: 'auto'
  },
  qrImg: { width: '100%', maxWidth: 280, height: 'auto' }
};

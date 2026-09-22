import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { NAVY, ORANGE, ui } from '../lib/styles';
import { ehTipoDePresenca } from '../lib/areas';
import { STATUS_VTI, rotuloStatusVti } from '../lib/vti';

// Mapa da operação (22/09/2026, pedido do Pablo): um pino por Área nas
// coordenadas reais (geoLat/geoLng, capturadas ou digitadas no Cadastro
// de Áreas), mostrando ao vivo quantos colaboradores estão presentes e
// quantas VTIs estão ali agora. Sem chave de API paga: usa tiles de
// satélite gratuitos da Esri (World Imagery) + Leaflet puro (sem
// react-leaflet, pra não trazer outra camada de abstração só pra isto).
//
// Contagem de colaboradores só faz sentido pras áreas de presença (DDS/
// Serviço, ver ehTipoDePresenca em lib/areas.js) — Operação (pátio/GAL)
// não tem colaborador vinculado, só VTI.
//
// VTI por status (23/09/2026, pedido do Pablo — "o gestor precisa saber
// quantas VTIs estão em cada área de produção e se estão cheias ou
// vazias"): mesma cor já usada em badgeStatusVti (lib/vti.js) — cheia
// vermelho, parcial laranja, em_transporte azul, vazia cinza — só que
// aqui em pílula sólida (não claro+texto escuro) pra ler contra a
// imagem de satélite. Clicar no pino abre popup com a lista de VTIs; a
// cheia mostra também pra qual(is) Pátio suas UDs estão destinadas
// (`ud.destinoAreaId`/`destinoAreaNome` — só existe pra VTI que veio da
// importação de planilha, Fluxo A; bipagem na origem, Fluxo B, não tem
// essa informação, ver PLANO_FASE2_VTI_UD_11set2026.md).
const TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const TILE_ATRIBUICAO = 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics';

const COR_STATUS_VTI = {
  cheia: '#B3261E',
  parcial: '#B85700',
  em_transporte: NAVY,
  vazia: '#8A8A8A'
};

function destinosDaVti(vti, uds) {
  const nomes = new Set();
  (uds || [])
    .filter((u) => u.vtiId === vti.id && u.status === 'na_vti' && u.destinoAreaNome)
    .forEach((u) => nomes.add(u.destinoAreaNome));
  return Array.from(nomes);
}

function montarIcone({ nome, tipo, qtdColaboradores, vtisDaArea }) {
  const corBorda = tipo === 'operacao' ? ORANGE : NAVY;
  const mostraColaboradores = ehTipoDePresenca(tipo);

  const contagemPorStatus = STATUS_VTI.reduce((acc, s) => {
    acc[s.id] = vtisDaArea.filter((v) => v.status === s.id).length;
    return acc;
  }, {});

  const pilulasVti = STATUS_VTI.filter((s) => contagemPorStatus[s.id] > 0)
    .map(
      (s) =>
        `<span style="background:${COR_STATUS_VTI[s.id]};color:#FFF;font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px;white-space:nowrap;">🚛 ${contagemPorStatus[s.id]}</span>`
    )
    .join('');

  const html = `
    <div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-6px);cursor:pointer;">
      <div style="
        background:#FFF;color:${NAVY};font-weight:700;font-size:11px;
        padding:2px 7px;border-radius:4px;white-space:nowrap;
        box-shadow:0 1px 4px rgba(0,0,0,0.35);margin-bottom:2px;
      ">${nome}</div>
      <div style="
        width:16px;height:16px;border-radius:50%;background:${corBorda};
        border:2px solid #FFF;box-shadow:0 1px 4px rgba(0,0,0,0.45);
      "></div>
      <div style="display:flex;gap:4px;margin-top:3px;flex-wrap:wrap;justify-content:center;max-width:120px;">
        ${
          mostraColaboradores
            ? `<span style="background:${NAVY};color:#FFF;font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px;white-space:nowrap;">👤 ${qtdColaboradores}</span>`
            : ''
        }
        ${pilulasVti}
      </div>
    </div>
  `;
  return L.divIcon({ html, className: '', iconSize: [0, 0], iconAnchor: [0, 0] });
}

function montarPopup({ area, vtisDaArea, uds }) {
  if (vtisDaArea.length === 0) {
    return `<div style="font-size:12px;min-width:160px;"><strong>${area.nome}</strong><br/>Nenhuma VTI aqui agora.</div>`;
  }
  const linhas = vtisDaArea
    .map((v) => {
      const cor = COR_STATUS_VTI[v.status] || '#8A8A8A';
      const destinos = v.status === 'cheia' ? destinosDaVti(v, uds) : [];
      const tagsDestino = destinos
        .map(
          (d) =>
            `<span style="background:#EEE;color:#333;font-size:10px;padding:1px 5px;border-radius:8px;margin-left:4px;">→ ${d}</span>`
        )
        .join('');
      return `
        <div style="display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid #EEE;">
          <span style="width:9px;height:9px;border-radius:50%;background:${cor};flex-shrink:0;"></span>
          <strong style="font-size:12px;">${v.numero || '(sem número)'}</strong>
          <span style="font-size:11px;color:#666;">${rotuloStatusVti(v.status)}</span>
          ${tagsDestino}
        </div>
      `;
    })
    .join('');
  return `<div style="font-size:12px;min-width:200px;"><strong>${area.nome}</strong> — ${vtisDaArea.length} VTI(s)${linhas}</div>`;
}

export default function MapaOperacional({ areas, vtis, uds, registrosDds, presentesAgora }) {
  const mapaRef = useRef(null);
  const marcadoresRef = useRef([]);

  const areasComGeo = (areas || []).filter(
    (a) => a.status !== 'inativo' && a.geoLat != null && a.geoLng != null
  );

  // Callback ref (não useRef + useEffect([])): a `div` do mapa só existe
  // no DOM depois que `areas` chegar do Firestore (antes disso é o
  // placeholder "Nenhuma área..."). Um efeito com `[]` rodaria só no
  // mount, ANTES da div existir, e nunca mais — o mapa ficava sempre em
  // branco. Callback ref dispara exatamente quando a div aparece/some.
  const containerCallbackRef = (node) => {
    if (node && !mapaRef.current) {
      const mapa = L.map(node, { scrollWheelZoom: false });
      L.tileLayer(TILE_URL, { attribution: TILE_ATRIBUICAO, maxZoom: 20 }).addTo(mapa);
      mapaRef.current = mapa;
    } else if (!node && mapaRef.current) {
      mapaRef.current.remove();
      mapaRef.current = null;
    }
  };

  // Redesenha os marcadores sempre que a lista de áreas ou as contagens
  // mudam — os dados vêm ao vivo do Firestore (onSnapshot no Dashboard).
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;

    marcadoresRef.current.forEach((m) => mapa.removeLayer(m));
    marcadoresRef.current = [];

    if (areasComGeo.length === 0) return;

    areasComGeo.forEach((area) => {
      const qtdColaboradores = ehTipoDePresenca(area.tipo)
        ? area.tipo === 'dds'
          ? (registrosDds || []).filter((r) => r.areaId === area.id).length
          : (presentesAgora || []).filter((r) => r.areaId === area.id).length
        : 0;
      const vtisDaArea = (vtis || []).filter((v) => v.areaAtualId === area.id);

      const marcador = L.marker([area.geoLat, area.geoLng], {
        icon: montarIcone({ nome: area.nome, tipo: area.tipo, qtdColaboradores, vtisDaArea })
      })
        .bindPopup(montarPopup({ area, vtisDaArea, uds }))
        .addTo(mapa);
      marcadoresRef.current.push(marcador);
    });

    const bounds = L.latLngBounds(areasComGeo.map((a) => [a.geoLat, a.geoLng]));
    mapa.fitBounds(bounds, { padding: [40, 40], maxZoom: 19 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areas, vtis, uds, registrosDds, presentesAgora]);

  return (
    <div>
      <h3 style={styles.tituloSecao}>Mapa Operacional</h3>
      {areasComGeo.length === 0 ? (
        <p style={ui.placeholderNote}>
          Nenhuma área com geolocalização cadastrada ainda — capture ou digite as coordenadas em
          Cadastros → Operação → Área.
        </p>
      ) : (
        <>
          <div ref={containerCallbackRef} style={styles.mapaContainer} />
          <p style={styles.legenda}>
            👤 colaboradores presentes agora (DDS: registros de hoje · Serviço: em área agora) · 🚛
            VTIs por status —{' '}
            <span style={{ color: COR_STATUS_VTI.cheia, fontWeight: 700 }}>cheia</span>,{' '}
            <span style={{ color: COR_STATUS_VTI.parcial, fontWeight: 700 }}>parcial</span>,{' '}
            <span style={{ color: COR_STATUS_VTI.em_transporte, fontWeight: 700 }}>em transporte</span>,{' '}
            <span style={{ color: COR_STATUS_VTI.vazia, fontWeight: 700 }}>vazia</span> — clique no
            pino pra ver as VTIs e, se cheia, pra qual Pátio suas UDs estão indo.
          </p>
        </>
      )}
    </div>
  );
}

const styles = {
  tituloSecao: { color: NAVY, margin: '28px 0 12px' },
  mapaContainer: {
    height: 460,
    width: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    boxShadow: '0 1px 4px rgba(0,0,0,0.15)'
  },
  legenda: { fontSize: 12, color: '#777', marginTop: 8 }
};

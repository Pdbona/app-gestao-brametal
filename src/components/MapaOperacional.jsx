import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { NAVY, ORANGE, ui } from '../lib/styles';
import { ehTipoDePresenca } from '../lib/areas';

// Mapa da operação (22/09/2026, pedido do Pablo): um pino por Área nas
// coordenadas reais (geoLat/geoLng, capturadas ou digitadas no Cadastro
// de Áreas), mostrando ao vivo quantos colaboradores estão presentes e
// quantas VTIs estão ali agora. Sem chave de API paga: usa tiles de
// satélite gratuitos da Esri (World Imagery) + Leaflet puro (sem
// react-leaflet, pra não trazer outra camada de abstração só pra isto).
//
// Contagem de colaboradores só faz sentido pras áreas de presença (DDS/
// Serviço, ver ehTipoDePresenca em lib/areas.js) — Operação (pátio/GAL)
// não tem colaborador vinculado, só VTI. DDS conta os registros de DDS
// de hoje (não tem "saída" pra contar só quem está presente agora);
// Serviço conta quem está com o registro de trabalho aberto agora.
const TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const TILE_ATRIBUICAO = 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics';

function montarIcone({ nome, tipo, qtdColaboradores, qtdVtis }) {
  const corBorda = tipo === 'operacao' ? ORANGE : NAVY;
  const mostraColaboradores = ehTipoDePresenca(tipo);
  const html = `
    <div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-6px);">
      <div style="
        background:#FFF;color:${NAVY};font-weight:700;font-size:11px;
        padding:2px 7px;border-radius:4px;white-space:nowrap;
        box-shadow:0 1px 4px rgba(0,0,0,0.35);margin-bottom:2px;
      ">${nome}</div>
      <div style="
        width:16px;height:16px;border-radius:50%;background:${corBorda};
        border:2px solid #FFF;box-shadow:0 1px 4px rgba(0,0,0,0.45);
      "></div>
      <div style="display:flex;gap:4px;margin-top:3px;">
        ${
          mostraColaboradores
            ? `<span style="background:${NAVY};color:#FFF;font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px;white-space:nowrap;">👤 ${qtdColaboradores}</span>`
            : ''
        }
        <span style="background:${ORANGE};color:#FFF;font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px;white-space:nowrap;">🚛 ${qtdVtis}</span>
      </div>
    </div>
  `;
  return L.divIcon({ html, className: '', iconSize: [0, 0], iconAnchor: [0, 0] });
}

export default function MapaOperacional({ areas, vtis, registrosDds, presentesAgora }) {
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
      const qtdVtis = (vtis || []).filter((v) => v.areaAtualId === area.id).length;

      const marcador = L.marker([area.geoLat, area.geoLng], {
        icon: montarIcone({ nome: area.nome, tipo: area.tipo, qtdColaboradores, qtdVtis })
      }).addTo(mapa);
      marcadoresRef.current.push(marcador);
    });

    const bounds = L.latLngBounds(areasComGeo.map((a) => [a.geoLat, a.geoLng]));
    mapa.fitBounds(bounds, { padding: [40, 40], maxZoom: 19 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areas, vtis, registrosDds, presentesAgora]);

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
            VTIs atualmente no ponto
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

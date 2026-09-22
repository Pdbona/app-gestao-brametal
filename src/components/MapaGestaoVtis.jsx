import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { NAVY, ui } from '../lib/styles';
import { useLeafletMapa, estilosMapa } from '../lib/mapaLeaflet';

// Mapa 2 de 2 (23/09/2026, pedido do Pablo): Gestão de VTIs — só áreas
// de Produção. Cada VTI presente na área vira um quadradinho colorido
// (não um total agregado): passar o mouse mostra o número da VTI
// (`title` nativo do HTML — sem precisar de tooltip próprio do
// Leaflet), a cor conta o status, e o rótulo "1"/"2"/"1/2" conta de
// qual Pátio são as UDs que ela carrega (só existe pra VTI vinda da
// importação de planilha — Fluxo A — que grava `destinoAreaNome` nas
// UDs; bipagem na origem, Fluxo B, não tem essa informação).
const COR_STATUS = {
  cheia: '#B3261E', // vermelho
  parcial: '#E08600', // laranja
  vazia: '#1E7A34', // verde
  em_transporte: NAVY // estado existente no modelo, sem cor definida pelo Pablo nesta rodada — mantém a mesma do resto do app
};

function normalizarTexto(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

// "Pátio 1", "Pátio1", "PATIO 1" etc. — tudo bate.
function rotuloPatios(nomes) {
  let tem1 = false;
  let tem2 = false;
  nomes.forEach((n) => {
    const norm = normalizarTexto(n);
    if (/patio\s*1\b/.test(norm)) tem1 = true;
    if (/patio\s*2\b/.test(norm)) tem2 = true;
  });
  if (tem1 && tem2) return '1/2';
  if (tem1) return '1';
  if (tem2) return '2';
  return '';
}

// UDs ainda dentro da VTI (não endereçadas) com destino conhecido —
// vale tanto pra 'cheia' quanto pra 'parcial' (que por definição ainda
// tem UDs sobrando pra outro pátio).
function destinosDaVti(vti, uds) {
  const nomes = new Set();
  (uds || [])
    .filter((u) => u.vtiId === vti.id && u.status === 'na_vti' && u.destinoAreaNome)
    .forEach((u) => nomes.add(u.destinoAreaNome));
  return Array.from(nomes);
}

function montarIcone(area, vtisDaArea, uds) {
  const boxes = vtisDaArea
    .map((v) => {
      const cor = COR_STATUS[v.status] || '#888';
      const destinos = v.status === 'cheia' || v.status === 'parcial' ? destinosDaVti(v, uds) : [];
      const rotulo = rotuloPatios(destinos);
      const numero = (v.numero || 'sem número').replace(/"/g, '&quot;');
      return `<div title="VTI ${numero}" style="
        background:${cor};color:#FFF;font-size:10px;font-weight:800;
        min-width:20px;height:20px;padding:0 3px;border-radius:4px;
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 1px 3px rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.6);
      ">${rotulo}</div>`;
    })
    .join('');

  const html = `
    <div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-6px);">
      <div style="
        background:#FFF;color:${NAVY};font-weight:700;font-size:11px;
        padding:2px 7px;border-radius:4px;white-space:nowrap;
        box-shadow:0 1px 4px rgba(0,0,0,0.35);margin-bottom:2px;
      ">${area.nome}</div>
      <div style="
        width:14px;height:14px;border-radius:50%;background:${NAVY};
        border:2px solid #FFF;box-shadow:0 1px 4px rgba(0,0,0,0.45);margin-bottom:3px;
      "></div>
      <div style="display:flex;gap:3px;flex-wrap:wrap;justify-content:center;max-width:150px;">
        ${boxes || '<span style="font-size:10px;color:#FFF;background:#8A8A8AAA;padding:1px 6px;border-radius:8px;">sem VTI</span>'}
      </div>
    </div>
  `;
  return L.divIcon({ html, className: '', iconSize: [0, 0], iconAnchor: [0, 0] });
}

export default function MapaGestaoVtis({ areas, vtis, uds }) {
  const { mapaRef, containerCallbackRef } = useLeafletMapa();
  const marcadoresRef = useRef([]);

  const areasComGeo = (areas || []).filter(
    (a) => a.status !== 'inativo' && a.tipo === 'operacao' && a.geoLat != null && a.geoLng != null
  );

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;

    marcadoresRef.current.forEach((m) => mapa.removeLayer(m));
    marcadoresRef.current = [];
    if (areasComGeo.length === 0) return;

    areasComGeo.forEach((area) => {
      const vtisDaArea = (vtis || []).filter((v) => v.areaAtualId === area.id);
      const marcador = L.marker([area.geoLat, area.geoLng], {
        icon: montarIcone(area, vtisDaArea, uds)
      }).addTo(mapa);
      marcadoresRef.current.push(marcador);
    });

    const bounds = L.latLngBounds(areasComGeo.map((a) => [a.geoLat, a.geoLng]));
    mapa.fitBounds(bounds, { padding: [40, 40], maxZoom: 19 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areas, vtis, uds]);

  return (
    <div>
      <h3 style={estilosMapa.tituloSecao}>Mapa — Gestão de VTIs</h3>
      {areasComGeo.length === 0 ? (
        <p style={ui.placeholderNote}>
          Nenhuma área de Produção com geolocalização cadastrada ainda — capture ou digite as
          coordenadas em Cadastros → Operação → Área.
        </p>
      ) : (
        <>
          <div ref={containerCallbackRef} style={estilosMapa.mapaContainer} />
          <p style={estilosMapa.legenda}>
            Cada quadrado é uma VTI (passe o mouse pra ver o número) —{' '}
            <span style={{ color: COR_STATUS.cheia, fontWeight: 700 }}>vermelho = cheia</span> (1 = só
            carga do Pátio 1, 2 = só do Pátio 2, 1/2 = dos dois),{' '}
            <span style={{ color: COR_STATUS.parcial, fontWeight: 700 }}>laranja = parcialmente
            descarregada</span> (ainda tem carga pra outro pátio),{' '}
            <span style={{ color: COR_STATUS.vazia, fontWeight: 700 }}>verde = vazia</span>.
          </p>
        </>
      )}
    </div>
  );
}

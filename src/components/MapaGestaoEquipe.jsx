import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { NAVY, ui } from '../lib/styles';
import { useLeafletMapa, estilosMapa } from '../lib/mapaLeaflet';

// Mapa 1 de 2 (23/09/2026, pedido do Pablo): Gestão de Equipe — só
// áreas DDS/Serviço, um número grande por pino = colaboradores
// presentes agora.
//
// Regra da DDS (combinada com o Pablo): ela não tem registro de saída
// própria, então "quantos ainda estão na DDS" não dá pra ler direto do
// registro — é inferido: todo mundo que entra na Brametal passa pela
// DDS primeiro; assim que a pessoa registra entrada numa área de
// Serviço (não importa se já saiu de lá depois), ela "sai" da contagem
// da DDS. Quem sobra são os que fizeram DDS hoje mas ainda não
// chegaram em nenhuma área de trabalho.
function montarIcone(area, qtd) {
  const html = `
    <div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-6px);">
      <div style="
        background:#FFF;color:${NAVY};font-weight:700;font-size:11px;
        padding:2px 7px;border-radius:4px;white-space:nowrap;
        box-shadow:0 1px 4px rgba(0,0,0,0.35);margin-bottom:2px;
      ">${area.nome}</div>
      <div style="
        width:16px;height:16px;border-radius:50%;background:${NAVY};
        border:2px solid #FFF;box-shadow:0 1px 4px rgba(0,0,0,0.45);
      "></div>
      <div style="
        background:${qtd > 0 ? '#1E7A34' : '#8A8A8A'};color:#FFF;font-size:14px;font-weight:800;
        padding:2px 10px;border-radius:12px;margin-top:3px;box-shadow:0 1px 3px rgba(0,0,0,0.4);
      ">${qtd}</div>
    </div>
  `;
  return L.divIcon({ html, className: '', iconSize: [0, 0], iconAnchor: [0, 0] });
}

export default function MapaGestaoEquipe({ areas, presentesAgora, registrosDds, registrosTrabalho }) {
  const { mapaRef, containerCallbackRef } = useLeafletMapa();
  const marcadoresRef = useRef([]);

  const areasComGeo = (areas || []).filter(
    (a) => a.status !== 'inativo' && (a.tipo === 'servico' || a.tipo === 'dds') && a.geoLat != null && a.geoLng != null
  );

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;

    marcadoresRef.current.forEach((m) => mapa.removeLayer(m));
    marcadoresRef.current = [];
    if (areasComGeo.length === 0) return;

    // Quem já tem QUALQUER registro de entrada em área de Serviço hoje —
    // mesmo que já tenha saído — não conta mais como "ainda na DDS".
    const comEntradaEmServicoHoje = new Set((registrosTrabalho || []).map((r) => r.colaboradorId));

    areasComGeo.forEach((area) => {
      let qtd;
      if (area.tipo === 'dds') {
        const doDdsHoje = (registrosDds || []).filter((r) => r.areaId === area.id);
        qtd = doDdsHoje.filter((r) => !comEntradaEmServicoHoje.has(r.colaboradorId)).length;
      } else {
        qtd = (presentesAgora || []).filter((r) => r.areaId === area.id).length;
      }
      const marcador = L.marker([area.geoLat, area.geoLng], { icon: montarIcone(area, qtd) }).addTo(mapa);
      marcadoresRef.current.push(marcador);
    });

    const bounds = L.latLngBounds(areasComGeo.map((a) => [a.geoLat, a.geoLng]));
    mapa.fitBounds(bounds, { padding: [40, 40], maxZoom: 19 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areas, presentesAgora, registrosDds, registrosTrabalho]);

  return (
    <div>
      <h3 style={estilosMapa.tituloSecao}>Mapa — Gestão de Equipe</h3>
      {areasComGeo.length === 0 ? (
        <p style={ui.placeholderNote}>
          Nenhuma área de DDS/Serviço com geolocalização cadastrada ainda — capture ou digite as
          coordenadas em Cadastros → Operação → Área.
        </p>
      ) : (
        <>
          <div ref={containerCallbackRef} style={estilosMapa.mapaContainer} />
          <p style={estilosMapa.legenda}>
            Número = colaboradores presentes agora naquela área. Na DDS, é quem já fez o DDS hoje mas
            ainda não registrou entrada em nenhuma área de Serviço.
          </p>
        </>
      )}
    </div>
  );
}

import { useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Setup compartilhado dos dois mapas do Dashboard (Gestão de Equipe e
// Gestão de VTIs, 23/09/2026) — tiles de satélite gratuitos da Esri
// (sem chave de API), Leaflet puro (sem react-leaflet).
//
// Callback ref (não useRef + useEffect([])): a `div` do mapa só existe
// no DOM depois que `areas` chegar do Firestore (antes disso é sempre
// um placeholder). Um efeito com `[]` rodaria só no mount, ANTES da div
// existir, e nunca mais — o mapa ficava em branco. Callback ref dispara
// exatamente quando a div aparece/some.
export const TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
export const TILE_ATRIBUICAO = 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics';

export function useLeafletMapa() {
  const mapaRef = useRef(null);

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

  return { mapaRef, containerCallbackRef };
}

export const estilosMapa = {
  tituloSecao: { color: '#1E3A5F', margin: '28px 0 12px' },
  mapaContainer: {
    height: 440,
    width: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    boxShadow: '0 1px 4px rgba(0,0,0,0.15)'
  },
  legenda: { fontSize: 12, color: '#777', marginTop: 8 }
};

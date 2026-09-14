// Distância entre duas coordenadas (fórmula de Haversine) — usada no
// registro público de presença pra confirmar que o colaborador está
// mesmo dentro da Área (compara com a geo capturada no cadastro dela).

const RAIO_TERRA_METROS = 6371000;

export function distanciaMetros(lat1, lng1, lat2, lng2) {
  const toRad = (graus) => (graus * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return RAIO_TERRA_METROS * c;
}

// ATENÇÃO: neste app a tolerância NÃO é global — cada Área tem o próprio
// raio de abrangência, cadastrado junto com a geolocalização (ver
// `raioDaArea` em lib/areas.js). Esta constante fica só como valor de
// referência/fallback pra quem precisar de um número quando não há área
// envolvida.
export const TOLERANCIA_GEO_METROS = 150;

export function capturarGeolocalizacao() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocalização não é suportada neste navegador.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });
}

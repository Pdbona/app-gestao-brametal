import React from 'react';
import GestaoBrametal from './components/GestaoBrametal';
import RegistroPresencaScreen from './components/RegistroPresencaScreen';
import './App.css';

// Não há router (o resto da navegação é state em GestaoBrametal.jsx). A
// tela pública de registro de presença é resolvida por query string —
// funciona em qualquer host estático, sem shim de 404:
//
//   ?presenca=<areaId>  → veio do QR Code fixado naquela área
//   ?presenca           → link geral, sem QR: a própria geolocalização
//                         descobre em qual área a pessoa está
//
// As duas formas existem de propósito: parte das áreas da Brametal terá
// a placa com QR Code impressa, parte não — e a validação que vale em
// todas é a geolocalização (ver lib/areas.js).
function App() {
  const params = new URLSearchParams(window.location.search);
  const temParametroPresenca = params.has('presenca');
  const areaId = params.get('presenca') || null;

  return (
    <div className="App">
      <main className="app-main">
        {temParametroPresenca ? <RegistroPresencaScreen areaId={areaId} /> : <GestaoBrametal />}
      </main>
    </div>
  );
}

export default App;

import React, { useState } from 'react';
import { BRAMETAL_RED } from '../lib/styles';

// A logo oficial da Brametal (PNG) deve ser colocada em
// `public/logos/logo-brametal.png`. Enquanto o arquivo não estiver lá, o
// componente cai sozinho num wordmark desenhado em texto, com a cor da
// marca — assim nenhuma tela fica com um ícone quebrado e, no dia em que
// o PNG for adicionado, ele passa a aparecer sem precisar mexer em código.
export default function LogoBrametal({ altura = 40, className }) {
  const [falhou, setFalhou] = useState(false);

  if (falhou) {
    return (
      <span
        className={className}
        style={{
          display: 'inline-block',
          fontSize: Math.round(altura * 0.5),
          fontWeight: 800,
          letterSpacing: 1.5,
          color: BRAMETAL_RED,
          lineHeight: `${altura}px`,
          whiteSpace: 'nowrap'
        }}
      >
        BRAMETAL
      </span>
    );
  }

  return (
    <img
      src={`${process.env.PUBLIC_URL}/logos/logo-brametal.png`}
      alt="Brametal"
      className={className}
      style={{ height: altura, width: 'auto', display: 'block' }}
      onError={() => setFalhou(true)}
    />
  );
}

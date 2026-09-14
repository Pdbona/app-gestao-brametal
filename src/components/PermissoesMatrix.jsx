import React from 'react';
import { CATALOGO_ACESSOS } from '../lib/permissoes';
import { NAVY, ORANGE } from '../lib/styles';

// Lista de "Acessos" em cards com ícone — mesmo padrão visual já usado
// nos apps da ML e da Superior: cada item é um flag só (tem ou não tem
// acesso). `value` é sempre { acessos: { [id]: bool } }.
export default function PermissoesMatrix({ value, onChange }) {
  const toggle = (id) => {
    onChange({ ...value, acessos: { ...value.acessos, [id]: !value.acessos?.[id] } });
  };

  return (
    <div>
      <div style={{ fontWeight: 700, color: NAVY, marginBottom: 8, fontSize: 13 }}>Acessos</div>
      <div style={styles.lista}>
        {CATALOGO_ACESSOS.map((item) => {
          const marcado = Boolean(value.acessos?.[item.id]);
          return (
            <label key={item.id} style={{ ...styles.card, ...(marcado ? styles.cardMarcado : {}) }}>
              <input type="checkbox" checked={marcado} onChange={() => toggle(item.id)} style={styles.checkbox} />
              <span style={styles.icone}>{item.icone}</span>
              <span style={styles.label}>{item.label}</span>
              {item.area === 'cadastro' && <span style={styles.tag}>Cadastro</span>}
            </label>
          );
        })}
      </div>
      <p style={{ fontSize: 12, color: '#777', marginTop: 8 }}>
        O item "Cadastros" aparece na barra lateral assim que pelo menos um cadastro estiver marcado.
      </p>
    </div>
  );
}

const styles = {
  lista: { display: 'flex', flexDirection: 'column', gap: 8 },
  card: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    background: '#FFF',
    border: '1px solid #E5E5E5',
    borderRadius: 8,
    cursor: 'pointer',
    userSelect: 'none'
  },
  cardMarcado: { borderColor: ORANGE, background: '#FFF7EF' },
  checkbox: { width: 16, height: 16, flexShrink: 0 },
  icone: { fontSize: 16, flexShrink: 0 },
  label: { fontSize: 14, fontWeight: 600, color: '#333' },
  tag: { marginLeft: 'auto', fontSize: 11, color: '#999', fontWeight: 600 }
};

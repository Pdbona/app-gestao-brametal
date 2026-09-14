// Paleta e estilos compartilhados entre as telas (evita duplicar o mesmo
// objeto de estilos em cada arquivo de cadastro).
export const NAVY = '#1E3A5F';
export const NAVY_LIGHT = '#2B4C7E';
export const ORANGE = '#FF6B00';

// Vermelho da marca Brametal — usado só onde a informação é do cliente
// (chip da logo no cabeçalho, destaques de área). A identidade principal
// do app continua sendo a da ML Serviços (navy + laranja), porque quem
// opera o sistema é a ML; a Brametal aparece como o cliente atendido.
export const BRAMETAL_RED = '#C4161C';

export const ui = {
  sectionTitle: { color: NAVY, margin: '0 0 16px' },
  sectionHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10
  },

  cardsRow: { display: 'flex', gap: 16, flexWrap: 'wrap' },
  statCard: {
    background: '#FFF',
    borderRadius: 8,
    padding: 20,
    minWidth: 140,
    textAlign: 'center',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)'
  },
  statValue: { fontSize: 30, fontWeight: 700, color: NAVY },
  statLabel: { fontSize: 13, color: '#666', marginTop: 4 },
  placeholderNote: { color: '#777', fontSize: 14, marginTop: 16 },

  primaryButton: {
    padding: '10px 18px',
    background: ORANGE,
    color: '#FFF',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontWeight: 700
  },
  secondaryButton: {
    padding: '10px 18px',
    background: '#E8E8E8',
    color: '#333',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontWeight: 600
  },
  smallButton: {
    padding: '6px 12px',
    fontSize: 13,
    background: '#E8E8E8',
    color: '#333',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontWeight: 600
  },
  linkButton: {
    background: 'none',
    border: 'none',
    color: NAVY,
    cursor: 'pointer',
    fontWeight: 600,
    marginRight: 14,
    padding: 0,
    textDecoration: 'underline'
  },

  formCard: {
    background: '#FFF',
    borderRadius: 8,
    padding: 24,
    marginTop: 16,
    marginBottom: 20,
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)'
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 14,
    marginBottom: 14
  },
  label: { display: 'flex', flexDirection: 'column', fontSize: 13, color: '#444', fontWeight: 600, gap: 4 },
  input: {
    padding: 10,
    borderRadius: 4,
    border: '1px solid #CCC',
    fontSize: 14,
    fontWeight: 400
  },

  tableWrapper: { overflowX: 'auto', background: '#FFF', borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: {
    textAlign: 'left',
    padding: '12px 16px',
    borderBottom: `2px solid ${NAVY}`,
    color: NAVY,
    whiteSpace: 'nowrap'
  },
  td: { padding: '12px 16px', borderBottom: '1px solid #EEE', verticalAlign: 'middle' },
  badge: { padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700 },
  badgeVerde: { background: '#E3F5E8', color: '#1E7A34' },
  badgeCinza: { background: '#F3F3F3', color: '#777' },
  badgeLaranja: { background: '#FFF1E3', color: '#B85700' },
  badgeAzul: { background: '#E5EDF7', color: NAVY },
  badgeVermelho: { background: '#FBE7E7', color: '#B3261E' },

  erro: { color: '#D32F2F', marginTop: 12, fontSize: 14 },

  permGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(160px, 1fr) repeat(4, 90px)',
    gap: '6px 10px',
    alignItems: 'center',
    fontSize: 13
  },
  permHeaderCell: { fontWeight: 700, color: NAVY, textAlign: 'center' },
  permRowLabel: { fontWeight: 600, color: '#333' }
};

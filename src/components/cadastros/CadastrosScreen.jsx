import React, { useState } from 'react';
import { montarNavegacaoCadastros } from '../../lib/permissoes';
import { NAVY } from '../../lib/styles';
import AreasCadastro from './AreasCadastro';
import TurnosCadastro from './TurnosCadastro';
import EnderecosCadastro from './EnderecosCadastro';
import ColaboradoresCadastro from './ColaboradoresCadastro';
import PerfisCadastro from './PerfisCadastro';
import UsuariosCadastro from './UsuariosCadastro';

const TELAS = {
  areas: AreasCadastro,
  turnos: TurnosCadastro,
  enderecos: EnderecosCadastro,
  colaboradores: ColaboradoresCadastro,
  perfis: PerfisCadastro,
  usuarios: UsuariosCadastro
};

// O item de 1º nível já vem escolhido pela barra lateral (`secaoAtualId`,
// controlado em GestaoBrametal.jsx). Esta tela cuida do 2º nível quando o
// item é um GRUPO — e os dois grupos existentes são mostrados lado a
// lado, com a tela de uso diário maior e a de manutenção rara num card
// compacto ao lado (mesmo arranjo já validado no app-gestao-ml).
export default function CadastrosScreen({ permissoes, secaoAtualId }) {
  const navegacao = montarNavegacaoCadastros(permissoes);
  const [subSecaoPorGrupo, setSubSecaoPorGrupo] = useState({});

  const itemAtual = navegacao.find((n) => n.id === secaoAtualId) || navegacao[0];

  if (!itemAtual) {
    return <p style={{ color: '#777' }}>Nenhuma seção de cadastro liberada para o seu usuário.</p>;
  }

  if (itemAtual.tipo === 'secao') {
    const TelaAtiva = TELAS[itemAtual.secao.id];
    return <TelaAtiva permissoes={permissoes} />;
  }

  // Operação: Área é o cadastro central deste app (fica grande); Turno e
  // Endereço são curtos e mudam pouco (cards empilhados ao lado —
  // Endereço entrou em 11/09/2026, pré-requisito da Fase 2/VTI).
  if (itemAtual.id === 'operacao') {
    const ids = itemAtual.secoes.map((s) => s.id);
    return (
      <div style={styles.duasColunasProporcao} className="cadastros-duas-colunas">
        {ids.indexOf('areas') >= 0 && <AreasCadastro permissoes={permissoes} />}
        <div style={styles.colunaEmpilhada}>
          {ids.indexOf('turnos') >= 0 && <TurnosCadastro permissoes={permissoes} compacto />}
          {ids.indexOf('enderecos') >= 0 && <EnderecosCadastro permissoes={permissoes} compacto />}
        </div>
      </div>
    );
  }

  // Usuários: a tela de uso diário é Usuários; Perfil fica no card menor.
  if (itemAtual.id === 'usuarios') {
    const ids = itemAtual.secoes.map((s) => s.id);
    return (
      <div style={styles.duasColunasProporcao} className="cadastros-duas-colunas">
        {ids.indexOf('usuarios') >= 0 && <UsuariosCadastro permissoes={permissoes} />}
        {ids.indexOf('perfis') >= 0 && <PerfisCadastro permissoes={permissoes} compacto />}
      </div>
    );
  }

  // Fallback genérico (grupo novo sem arranjo próprio): sub-abas simples.
  const subId = subSecaoPorGrupo[itemAtual.id] || itemAtual.secoes[0].id;
  const secaoParaRenderizar = itemAtual.secoes.find((s) => s.id === subId) || itemAtual.secoes[0];
  const TelaAtiva = TELAS[secaoParaRenderizar.id];

  return (
    <div>
      {itemAtual.secoes.length > 1 && (
        <div style={styles.subNav}>
          {itemAtual.secoes.map((s) => (
            <button
              key={s.id}
              onClick={() => setSubSecaoPorGrupo({ ...subSecaoPorGrupo, [itemAtual.id]: s.id })}
              style={{ ...styles.subNavButton, ...(secaoParaRenderizar.id === s.id ? styles.subNavButtonAtivo : {}) }}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
      <TelaAtiva permissoes={permissoes} />
    </div>
  );
}

const styles = {
  duasColunasProporcao: {
    display: 'grid',
    gridTemplateColumns: 'minmax(420px, 2.1fr) minmax(280px, 1fr)',
    gap: 20,
    alignItems: 'start'
  },
  colunaEmpilhada: { display: 'flex', flexDirection: 'column', gap: 20 },
  subNav: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 },
  subNavButton: {
    padding: '6px 14px',
    background: '#FFF',
    color: NAVY,
    border: `1px solid ${NAVY}`,
    borderRadius: 14,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600
  },
  subNavButtonAtivo: { background: NAVY, color: '#FFF' }
};

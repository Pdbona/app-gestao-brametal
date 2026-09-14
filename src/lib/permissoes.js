// ============================================================
// RBAC — catálogo de acessos, perfil de bootstrap e helpers
// ============================================================
//
// Mesmo modelo já validado no app-gestao-ml (e antes dele no app da
// Superior Transportes): catálogo FLAT — cada acesso é um único flag
// (tem ou não tem), sem granularidade de ação por seção.
//
//   area: 'aba'      → item de 1º nível na sidebar (Dashboard...).
//   area: 'cadastro' → seção dentro de "Cadastros". A aba "Cadastros" não
//                      é um flag próprio: aparece sozinha assim que pelo
//                      menos 1 seção estiver marcada.
//   area: 'capacidade' → modificador de comportamento, não aparece em
//                      lugar nenhum da navegação.
//
// `grupo` (só entre as de cadastro) junta seções num único item de 1º
// nível, mostradas lado a lado (ver CadastrosScreen.jsx).
//
// FASE 1 (10/09/2026) cobre estrutura + cadastros + presença. Os acessos
// das fases seguintes (Conferente/endereçamento de UD, Tratorista/VTI,
// importação da planilha da Brametal, Relatórios) entram aqui quando
// aquelas telas existirem — nada de item de menu que não leva a lugar
// nenhum.
export const CATALOGO_ACESSOS = [
  { id: 'dashboard', label: 'Dashboard', icone: '📊', area: 'aba' },
  // Bipagem na origem (11/09/2026, plano de Fase 2, Fluxo B): tela de
  // uso diário do Conferente, fora de Cadastros — cria/reabre a VTI e
  // bipa cada UD sobre ela. Item de 1º nível na sidebar, igual ao
  // Dashboard.
  { id: 'bipagem', label: 'Bipagem', icone: '📦', area: 'aba' },
  { id: 'areas', label: 'Área', icone: '📍', area: 'cadastro', grupo: 'operacao' },
  { id: 'turnos', label: 'Turno', icone: '🕐', area: 'cadastro', grupo: 'operacao' },
  // Endereço (11/09/2026, plano de Fase 2): código livre DENTRO de uma
  // área tipo 'operacao' — pré-requisito do endereçamento de UD. Sem
  // perfil travado de propósito (pedido do Pablo): é só esta permissão
  // que existe; ele decide depois a quem atribuir.
  { id: 'enderecos', label: 'Endereço', icone: '🏷️', area: 'cadastro', grupo: 'operacao' },
  { id: 'colaboradores', label: 'Colaborador', icone: '🧑‍🔧', area: 'cadastro' },
  { id: 'perfis', label: 'Perfil', icone: '🛡️', area: 'cadastro', grupo: 'usuarios' },
  { id: 'usuarios', label: 'Usuários', icone: '👤', area: 'cadastro', grupo: 'usuarios' }
];

export const GRUPOS_CADASTRO = {
  operacao: { label: 'Operação' },
  usuarios: { label: 'Usuários' }
};

// View filtrada do catálogo, pra quem só precisa das seções de cadastro.
export const SECOES_CADASTRO = CATALOGO_ACESSOS.filter((a) => a.area === 'cadastro');

export function permissoesVazias() {
  const acessos = {};
  CATALOGO_ACESSOS.forEach((a) => {
    acessos[a.id] = false;
  });
  return { acessos };
}

export function permissoesTotais() {
  const acessos = {};
  CATALOGO_ACESSOS.forEach((a) => {
    acessos[a.id] = true;
  });
  return { acessos };
}

// Perfil "de fábrica": sempre existe, mesmo sem nenhum dado gravado.
// Não pode ser excluído (mas serve de base — copie e ajuste pra criar
// outros perfis). É o que garante o primeiro login num app zerado.
export const PERFIL_ADMIN_PADRAO = {
  id: 'admin',
  nome: 'Administrador',
  descricao: 'Acesso total ao sistema (perfil de sistema, não pode ser excluído).',
  sistema: true,
  permissoes: permissoesTotais()
};

// Senha de administrador padrão, definida pelo Pablo em 10/09/2026.
// Sempre funciona, mesmo com a base vazia — é por ela que se entra pra
// cadastrar os perfis/usuários reais. Igual ao app-gestao-ml: senha em
// texto simples, sem Firebase Auth. Trocar antes de expor à Brametal.
export const SENHA_ADMIN_PADRAO = '130399';

// Combina o perfil base do usuário com as permissões customizadas dele.
// Overrides são PARCIAIS: só o que estiver definido substitui o perfil.
export function mergePermissoes(base, overrides) {
  const permBase = base || permissoesVazias();
  if (!overrides) return permBase;
  return { acessos: { ...permBase.acessos, ...(overrides.acessos || {}) } };
}

// Aba em que o usuário cai logo depois do login.
export function abaInicial(permissoes) {
  const acessos = (permissoes && permissoes.acessos) || {};
  if (acessos.dashboard) return 'dashboard';
  // Conferente costuma ter só Bipagem liberada, sem Dashboard — cai
  // direto na tela de uso diário dele em vez de "Cadastros" (11/09/2026).
  if (acessos.bipagem) return 'bipagem';
  return 'cadastros';
}

// Monta a navegação de 1º nível de Cadastros a partir das seções visíveis
// pro usuário: seção solta vira um item; seções do mesmo `grupo` viram um
// item único de grupo. Compartilhado entre a sidebar e a tela de Cadastros.
export function montarNavegacaoCadastros(permissoes) {
  const acessos = (permissoes && permissoes.acessos) || {};
  const secoesVisiveis = SECOES_CADASTRO.filter((s) => acessos[s.id]);
  const nivel1 = [];
  const gruposVistos = new Set();

  secoesVisiveis.forEach((s) => {
    if (!s.grupo) {
      nivel1.push({ tipo: 'secao', id: s.id, label: s.label, secao: s });
      return;
    }
    if (gruposVistos.has(s.grupo)) return;
    gruposVistos.add(s.grupo);
    nivel1.push({
      tipo: 'grupo',
      id: s.grupo,
      label: (GRUPOS_CADASTRO[s.grupo] && GRUPOS_CADASTRO[s.grupo].label) || s.grupo,
      secoes: secoesVisiveis.filter((x) => x.grupo === s.grupo)
    });
  });

  return nivel1;
}

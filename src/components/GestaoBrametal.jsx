import React, { useState } from 'react';
import { db, collection, doc, getDoc, getDocs, MODO_LOCAL } from '../lib/db';
import {
  PERFIL_ADMIN_PADRAO,
  SENHA_ADMIN_PADRAO,
  mergePermissoes,
  montarNavegacaoCadastros,
  abaInicial,
  SECOES_CADASTRO
} from '../lib/permissoes';
import { NAVY, NAVY_LIGHT, ORANGE, ui } from '../lib/styles';
import LogoBrametal from './LogoBrametal';
import DashboardTab from './DashboardTab';
import BipagemScreen from './BipagemScreen';
import CadastrosScreen from './cadastros/CadastrosScreen';

// Cabeçalho carrega as DUAS marcas: ML Serviços (quem opera o sistema) e
// Brametal (o cliente onde a operação acontece). A SBS Solution aparece
// só no rodapé, como desenvolvedora — mesmo padrão do app-gestao-ml.
const LOGO_ML = `${process.env.PUBLIC_URL}/logos/logo-ml.png`;
const LOGO_SBS = `${process.env.PUBLIC_URL}/logos/logo-sbs.png`;

async function buscarPerfil(perfilId) {
  if (!perfilId || perfilId === PERFIL_ADMIN_PADRAO.id) return PERFIL_ADMIN_PADRAO;
  try {
    const snap = await getDoc(doc(db, 'perfis', perfilId));
    if (snap.exists()) return { id: snap.id, ...snap.data() };
  } catch (e) {
    // Base indisponível — cai no perfil de sistema como fallback.
  }
  return PERFIL_ADMIN_PADRAO;
}

// Login só por senha (sem campo de usuário): a senha sozinha identifica a
// conta e já carrega o perfil/permissões dela — por isso ela precisa ser
// única entre usuários ativos (validado em UsuariosCadastro.jsx).
async function autenticar(senhaDigitada) {
  // A senha de administrador padrão é checada ANTES da base: precisa
  // funcionar mesmo com o app zerado, que é justamente como ele nasce.
  if (senhaDigitada === SENHA_ADMIN_PADRAO) {
    return {
      uid: 'admin-padrao',
      nome: PERFIL_ADMIN_PADRAO.nome,
      perfilId: PERFIL_ADMIN_PADRAO.id,
      permissoes: PERFIL_ADMIN_PADRAO.permissoes
    };
  }

  try {
    const snap = await getDocs(collection(db, 'usuarios'));
    const usuarios = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const encontrado = usuarios.find((u) => u.ativo !== false && u.senha === senhaDigitada);
    if (encontrado) {
      const perfilBase = await buscarPerfil(encontrado.perfilId);
      return {
        uid: encontrado.id,
        nome: encontrado.nome,
        perfilId: encontrado.perfilId,
        permissoes: mergePermissoes(perfilBase.permissoes, encontrado.permissoesCustom)
      };
    }
  } catch (e) {
    // Sem base disponível — só a senha de administrador padrão entra.
  }

  return null;
}

// ============================================================
// TELA DE LOGIN
// ============================================================
function LoginScreen({ onLoginSuccess }) {
  const [senha, setSenha] = useState('');
  const [entrando, setEntrando] = useState(false);
  const [erro, setErro] = useState('');

  const handleLogin = async () => {
    if (!senha.trim()) {
      setErro('Informe a senha.');
      return;
    }
    setEntrando(true);
    setErro('');
    const usuario = await autenticar(senha);
    setEntrando(false);
    if (usuario) {
      onLoginSuccess(usuario);
    } else {
      setErro('Senha inválida.');
    }
  };

  return (
    <div style={styles.loginWrapper}>
      <div style={styles.loginHeader}>
        <div style={styles.loginHeaderInner}>
          <div style={styles.logosLinha}>
            <div style={styles.logoChip}>
              <img src={LOGO_ML} alt="ML Serviços" style={styles.logoMlLogin} />
            </div>
            <span style={styles.separadorLogos}>×</span>
            <div style={styles.logoChip}>
              <LogoBrametal altura={44} />
            </div>
          </div>
          <p style={styles.loginSubtitle}>Sistema de Gestão Operacional</p>
        </div>
      </div>
      <div style={styles.orangeBar} />

      <div style={styles.loginBody}>
        <div style={styles.loginCard}>
          <h2 style={styles.loginCardTitle}>Acesso ao sistema</h2>

          <label style={{ ...ui.label, marginBottom: 18 }}>
            Senha
            <input
              type="password"
              autoFocus
              style={ui.input}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
          </label>

          <button onClick={handleLogin} style={styles.loginButton} disabled={entrando}>
            {entrando ? 'Entrando...' : 'Entrar'}
          </button>

          {erro && <div style={ui.erro}>❌ {erro}</div>}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
export default function GestaoBrametal() {
  const [usuarioAtivo, setUsuarioAtivo] = useState(null);
  const [abaAtual, setAbaAtual] = useState('dashboard');
  const [cadastrosExpandido, setCadastrosExpandido] = useState(false);
  const [secaoCadastroAtual, setSecaoCadastroAtual] = useState(null);

  const handleLoginSuccess = (usuario) => {
    setUsuarioAtivo(usuario);
    setAbaAtual(abaInicial(usuario.permissoes));
  };

  if (!usuarioAtivo) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  const permissoes = usuarioAtivo.permissoes;
  const temDashboard = Boolean(permissoes.acessos?.dashboard);
  const temBipagem = Boolean(permissoes.acessos?.bipagem);
  // "Cadastros" não é um flag próprio — aparece assim que pelo menos 1
  // seção de cadastro estiver liberada (modelo flat, ver lib/permissoes).
  const temCadastros = SECOES_CADASTRO.some((s) => permissoes.acessos?.[s.id]);
  const navCadastros = temCadastros ? montarNavegacaoCadastros(permissoes) : [];
  const secaoAtual = navCadastros.find((n) => n.id === secaoCadastroAtual) || navCadastros[0];

  const abrirCadastros = () => {
    setAbaAtual('cadastros');
    setCadastrosExpandido((expandido) => !expandido);
  };

  const abrirSecaoCadastro = (id) => {
    setAbaAtual('cadastros');
    setCadastrosExpandido(true);
    setSecaoCadastroAtual(id);
  };

  return (
    <div style={styles.appShell}>
      {/* Responsividade não dá pra fazer só com style inline — boa parte
          da operação (conferente, tratorista, liderança em campo) vai
          abrir este app no celular. */}
      <style>{`
        @media (max-width: 640px) {
          .app-header {
            padding: 8px 12px !important;
            grid-template-columns: auto 1fr auto !important;
            gap: 8px !important;
          }
          .app-title { font-size: 14px !important; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .app-logo { height: 22px !important; }
          .app-logo-chip { padding: 4px 8px !important; }
          .app-logos-linha { gap: 6px !important; }
          .app-username { display: none; }
          .app-logout-button { padding: 5px 10px !important; font-size: 12px !important; }
          .app-body-row { flex-direction: column; }
          .app-sidebar {
            width: 100% !important;
            flex-direction: row !important;
            overflow-x: auto;
            border-right: none !important;
            border-bottom: 1px solid #E5E5E5;
            padding: 8px !important;
          }
          .app-sidebar-sub { flex-direction: row !important; flex-wrap: wrap; }
          .app-content { padding: 16px !important; }
        }
      `}</style>

      <div style={styles.appHeader} className="app-header">
        <div style={styles.appHeaderLeft}>
          <div style={styles.logosLinha} className="app-logos-linha">
            <div style={styles.logoChipSmall} className="app-logo-chip">
              <img src={LOGO_ML} alt="ML Serviços" style={styles.logoMlApp} className="app-logo" />
            </div>
            <div style={styles.logoChipSmall} className="app-logo-chip">
              <LogoBrametal altura={40} className="app-logo" />
            </div>
          </div>
        </div>
        <div style={styles.appHeaderCenter}>
          <p style={styles.appSubtitle} className="app-title">
            Sistema de Gestão Operacional
          </p>
        </div>
        <div style={{ ...styles.appHeaderRight, ...styles.userBox }}>
          <span className="app-username">{usuarioAtivo.nome}</span>
          <button style={styles.logoutButton} className="app-logout-button" onClick={() => setUsuarioAtivo(null)}>
            Sair
          </button>
        </div>
      </div>
      <div style={styles.orangeBar} />

      {MODO_LOCAL && (
        <div style={styles.avisoLocal}>
          ⚠️ Modo local — os dados ficam guardados só neste navegador. A nuvem (Firebase) entra numa
          etapa seguinte do projeto.
        </div>
      )}

      <div style={styles.bodyRow} className="app-body-row">
        <nav style={styles.sidebar} className="app-sidebar">
          {temDashboard && (
            <button
              onClick={() => setAbaAtual('dashboard')}
              style={{ ...styles.sidebarButton, ...(abaAtual === 'dashboard' ? styles.sidebarButtonAtivo : {}) }}
            >
              📊 Dashboard
            </button>
          )}

          {temBipagem && (
            <button
              onClick={() => setAbaAtual('bipagem')}
              style={{ ...styles.sidebarButton, ...(abaAtual === 'bipagem' ? styles.sidebarButtonAtivo : {}) }}
            >
              📦 Bipagem
            </button>
          )}

          {temCadastros && (
            <>
              <button
                onClick={abrirCadastros}
                style={{ ...styles.sidebarButton, ...(abaAtual === 'cadastros' ? styles.sidebarButtonAtivo : {}) }}
              >
                🗂️ Cadastros
              </button>
              {cadastrosExpandido && (
                <div style={styles.sidebarSubGroup} className="app-sidebar-sub">
                  {navCadastros.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => abrirSecaoCadastro(item.id)}
                      style={{
                        ...styles.sidebarSubButton,
                        ...(abaAtual === 'cadastros' && secaoAtual?.id === item.id ? styles.sidebarSubButtonAtivo : {})
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </nav>

        <div style={styles.content} className="app-content">
          {abaAtual === 'dashboard' && temDashboard && <DashboardTab />}
          {abaAtual === 'bipagem' && temBipagem && <BipagemScreen />}
          {abaAtual === 'cadastros' && temCadastros && (
            <CadastrosScreen permissoes={permissoes} secaoAtualId={secaoAtual?.id} />
          )}
        </div>
      </div>

      <div style={styles.footer}>
        <div style={styles.footerOrangeBar} />
        <div style={styles.footerRow}>
          <div style={styles.footerSbsChip}>
            <img src={LOGO_SBS} alt="SBS Solution" style={styles.logoSbsFooter} />
          </div>
          <span style={styles.footerText}>Desenvolvido pela SBS Solution.</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ESTILOS (específicos do shell — o resto vem de lib/styles.js)
// ============================================================
const styles = {
  loginWrapper: { minHeight: '100vh', background: '#F5F7FA' },
  loginHeader: {
    background: `linear-gradient(135deg, ${NAVY}, ${NAVY_LIGHT})`,
    color: '#FFF',
    padding: '28px 20px'
  },
  loginHeaderInner: { maxWidth: 480, margin: '0 auto', textAlign: 'center' },
  loginSubtitle: { margin: '14px 0 0', fontSize: 24, fontWeight: 600, opacity: 0.9, letterSpacing: 0.5 },
  logosLinha: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 },
  separadorLogos: { fontSize: 18, opacity: 0.6, fontWeight: 300 },
  logoChip: {
    display: 'inline-flex',
    alignItems: 'center',
    background: '#FFF',
    borderRadius: 12,
    padding: '10px 18px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
  },
  logoMlLogin: { height: 44, width: 'auto', display: 'block' },
  orangeBar: { height: 4, background: ORANGE },
  loginBody: { display: 'flex', justifyContent: 'center', padding: '48px 20px' },
  loginCard: {
    background: '#FFF',
    borderRadius: 8,
    padding: 44,
    maxWidth: 420,
    width: '100%',
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)'
  },
  loginCardTitle: { marginTop: 0, textAlign: 'center', color: NAVY },
  loginButton: {
    width: '100%',
    padding: 12,
    background: ORANGE,
    color: '#FFF',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: 15
  },

  appShell: { display: 'flex', flexDirection: 'column', minHeight: '100vh' },

  appHeader: {
    background: `linear-gradient(135deg, ${NAVY}, ${NAVY_LIGHT})`,
    color: '#FFF',
    padding: '20px 28px',
    display: 'grid',
    gridTemplateColumns: 'auto 1fr auto',
    alignItems: 'center',
    gap: 16
  },
  appHeaderLeft: { justifySelf: 'start' },
  appHeaderCenter: { justifySelf: 'center', textAlign: 'center' },
  appHeaderRight: { justifySelf: 'end' },
  logoChipSmall: {
    display: 'inline-flex',
    alignItems: 'center',
    background: '#FFF',
    borderRadius: 10,
    padding: '8px 14px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
  },
  logoMlApp: { height: 40, width: 'auto', display: 'block' },
  appSubtitle: { margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: 0.5 },
  userBox: { display: 'flex', alignItems: 'center', gap: 12, fontSize: 14 },
  logoutButton: {
    padding: '6px 14px',
    background: 'rgba(255,255,255,0.15)',
    color: '#FFF',
    border: '1px solid rgba(255,255,255,0.4)',
    borderRadius: 4,
    cursor: 'pointer'
  },

  avisoLocal: {
    background: '#FFF7E6',
    borderBottom: '1px solid #F0DCB4',
    color: '#8A6100',
    fontSize: 12,
    padding: '7px 20px',
    textAlign: 'center'
  },

  bodyRow: { display: 'flex', flex: 1, alignItems: 'stretch' },
  sidebar: {
    width: 210,
    flexShrink: 0,
    background: '#FFF',
    borderRight: '1px solid #E5E5E5',
    padding: '20px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4
  },
  sidebarButton: {
    textAlign: 'left',
    padding: '12px 16px',
    background: 'transparent',
    color: '#333',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 14
  },
  sidebarButtonAtivo: { background: NAVY, color: '#FFF' },
  sidebarSubGroup: { display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 6 },
  sidebarSubButton: {
    textAlign: 'left',
    padding: '9px 16px 9px 30px',
    background: 'transparent',
    color: '#555',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontWeight: 500,
    fontSize: 13
  },
  sidebarSubButtonAtivo: { background: '#E5EDF7', color: NAVY, fontWeight: 700 },

  content: { flex: 1, padding: '24px 28px 60px', minWidth: 0 },

  footer: { background: NAVY, color: '#FFF', padding: '18px 20px' },
  footerOrangeBar: { height: 4, background: ORANGE, margin: '-18px -20px 16px' },
  footerRow: { display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 12, paddingLeft: 12 },
  footerSbsChip: { display: 'inline-flex', background: '#FFF', borderRadius: 8, padding: '4px 12px' },
  logoSbsFooter: { height: 22, width: 'auto', display: 'block' },
  footerText: { fontSize: 13, color: '#DDD' }
};

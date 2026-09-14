# APP_Gestao_Brametal

Sistema de gestão operacional da **ML Serviços** dentro da **Brametal**, desenvolvido pela
**SBS Solution**. Origem: GEMBA de 10/09/2026 (`../APP_ML_Brametal/relatorio_brametal_gemba_20260910.html`).

Cabeçalho leva as duas marcas (ML Serviços + Brametal); a SBS aparece só no rodapé, como
desenvolvedora — mesmo padrão do `APP_Gestao_ML`.

## Como rodar

```bash
npm install
npm start
```

Acesso de administrador: **senha `130399`** (login é só por senha, sem campo de usuário).

## Estado atual — Fase 1 entregue

| Entregue | O quê |
|---|---|
| ✅ | Estrutura do app, login por senha, RBAC (perfil + usuário + permissões por acesso) |
| ✅ | Cadastro de **Área** em dois níveis: **Área de Serviço** (DDS/trabalho, com tolerância de entrada/saída própria) e **Área de Operação** (Pátio/GAL, base pra fase de VTI) — geo + raio de abrangência em ambas, QR Code sempre disponível para gerar e **imprimir com as logos** |
| ✅ | Cadastro de **Colaborador** com alocação (ponto de DDS + áreas de trabalho) e **Perfil** (mesma lista de Cadastros → Usuários → Perfil, não mais uma função fixa) |
| ✅ | Cadastro de **Turno** (início + duração, fim calculado) |
| ✅ | Registro público de **chegada e saída** por geolocalização, com a tolerância de cada área |
| ✅ | Dashboard do dia, incluindo a **dispersão DDS → área** |

## Fase 2 — em andamento (plano em `PLANO_FASE2_VTI_UD_11set2026.md`)

| Feito | O quê |
|---|---|
| ✅ | Cadastro de **Endereço**: código livre dentro de um Pátio (escolhe o Pátio, cadastra os códigos dentro dele) |
| ✅ | **Bipagem na origem** (Fluxo B): Conferente abre/cria a VTI e bipa cada UD sobre ela — a VTI nasce/volta a ficar CHEIA sem depender da planilha da Brametal |
| ⏳ | Seleção de VTI + destino do tratorista (reaproveita a presença da Fase 1 — ver o plano) |
| ⏳ | Endereçamento no pátio, Dashboard VTI, Dashboard Operador de Trator, Dashboard Armazenamento/Conferência, refinamento do Dashboard de Presença |

## Fases seguintes (mapeadas, ainda não construídas)

2. **Importação da planilha da Brametal** (VTI + UDs) com seleção de colunas, criando as VTIs
   com status *CHEIA em GU*.
3. **Conferente**: bipar VTI, bipar cada UD, endereçar, fechar a VTI como *VAZIA*.
   Cadastro de **Endereço** como lista de códigos livres (decisão do Pablo, 10/09/2026).
4. **Exportação** do arquivo UD + Endereço pra atualizar o sistema da Brametal.
5. **Tratorista**: movimentação de VTI entre áreas, sempre confirmando a área por
   geolocalização, alternando CHEIA/VAZIA.
6. **Relatórios e KPIs**: ciclo da VTI, tempo por UD, tempo por bloco, gargalos.

### 🔒 Bloqueio das fases 2 e 4 — aguardando o Pablo (10/09/2026)

As duas pontas de integração com a Brametal dependem de arquivos que **ainda não existem**:

- **Planilha de entrada** (fase 2): o Excel que a Brametal fornece com VTI + UDs. Falta saber as
  colunas. O import será construído com uma etapa de *mapeamento de colunas* (o Administrativo
  escolhe qual coluna é o quê), então uma mudança de layout depois não quebra o app — mas o
  conjunto mínimo de campos precisa ser conhecido antes.
- **Layout do arquivo de saída** (fase 4): o arquivo UD + Endereço que atualiza o sistema da
  Brametal. Falta o formato exato (CSV/XLSX, nomes e ordem das colunas, separador, encoding).

Enquanto não chegarem, essas duas fases não começam. As fases 3 e 5 (conferente e tratorista)
dependem em parte delas, já que operam sobre as VTIs criadas pelo import.

**Terminologia (fechada pelo Pablo em 10/09/2026): VTI** é a carreta puxada pelo trator; **UD** é
o fardo de aço com código de barras. Uma VTI carrega N UDs. É esse o nome que vai virar coleção e
campo no banco na fase 2 — "UR" aparece em mensagens antigas, mas não é o termo do projeto.

## Decisões de arquitetura

**Dados em modo local, com a mesma API do Firestore.** O projeto Firebase ainda não existe.
Todas as telas importam de `src/lib/db.js`, que expõe exatamente a API do Firestore
(`collection`, `doc`, `addDoc`, `onSnapshot`, `query`, `where`...) guardando no `localStorage`.
Pra migrar, troca-se só o corpo daquele arquivo por reexportações do SDK — nenhuma tela muda.
Passo a passo em `src/firebase.js`.

Enquanto está local: os dados vivem só no navegador de quem usa, não são compartilhados entre
celulares e somem se o usuário limpar os dados do site. Serve pra construir e validar as telas,
não pra operar.

**Área tem dois níveis** (redesenhado em 10/09/2026 a pedido do Pablo, vendo a tela real):
`tipo` separa **Área de Serviço** (onde o colaborador bate presença) de **Área de Operação**
(onde as VTIs serão movimentadas — pátio/produção, base pras fases seguintes, ainda sem tela
própria); `subtipo` é o comportamento dentro de cada família (`dds`/`trabalho` para Serviço,
`patio`/`gal` para Operação). Só Área de Serviço entra na alocação do Colaborador e no Dashboard
de presença.

**Geolocalização por área, não global.** Cada área tem o próprio raio (padrão 100m, mínimo 20m).
No `APP_Gestao_ML` a tolerância de distância era uma constante única de 150m; aqui os pontos têm
tamanhos físicos muito diferentes. Vale pros dois tipos de área.

**Tolerância de horário também é por área** (não mais uma constante global do sistema): cada Área
de Serviço grava `toleranciaEntradaMin` e, se for do subtipo `trabalho`, `toleranciaSaidaMin`
(padrão 10min, editável de 0 a 180). `statusJanelaEntrada`/`statusJanelaSaida` (`lib/data.js`)
recebem esse valor como parâmetro, caindo nas constantes de fábrica só se a área não tiver o
campo gravado (área antiga).

**QR Code é sempre gerado; nunca se pergunta se a área "vai ter placa".** O checkbox que existia
foi removido — todo cadastro de área já ganha o botão "Gerar QR", e o modal oferece
**🖨️ Imprimir (com logos)** — abre uma janela própria com ML + Brametal no topo — além do
"Baixar PNG" simples.

**Entrada x saída é decidido pelo sistema.** Se o CPF já tem registro de hoje sem saída, o
próximo é a saída. Área do subtipo *Ponto de DDS* registra só chegada (sem saída), conforme o GEMBA.

**Janelas de horário**: chegada dentro da tolerância de entrada da área (antes disso bloqueia,
depois exige justificativa); saída dentro da tolerância de saída (nunca bloqueia, fora da janela
exige justificativa — antecipada pode gerar desconto, tempo extra é o que se cobra do cliente).

**Selfie é exigida mas não é guardada.** O Firebase Storage exige plano pago; a foto confirma
visualmente quem está registrando, mas não sobe pra lugar nenhum. Mesmo contorno do `APP_Gestao_ML`.

**"Função" do colaborador virou "Perfil"** (pedido do Pablo, 10/09/2026: "a Função na verdade é
perfil, deve seguir a tela de cadastro de perfil"). Não existe mais uma lista fixa
(Conferente/Tratorista/...) no código — o select de Colaborador lê da mesma coleção `perfis` que
Cadastros → Usuários → Perfil usa pro RBAC dos usuários do sistema. Um colaborador não precisa
logar (só aparece pelo CPF na tela pública); o perfil aqui é descritivo, denormalizado em
`perfilNome` no registro de presença (mesmo padrão de `areaNome`/`turnoNome`).

## Pendências conhecidas

- ~~Logo da Brametal~~ — resolvido em 10/09/2026: `public/logos/logo-brametal.png` (cópia de
  `SBS_Logos/Logo_Brametal.png`, 265×148). `src/components/LogoBrametal.jsx` mantém o wordmark em
  texto como fallback caso o arquivo suma.
- **Autorização da liderança**: no `APP_Gestao_ML`, chegada atrasada e retorno no mesmo dia abrem
  solicitação pra liderança aprovar. Aqui, na Fase 1, atraso é registrado com justificativa e
  retorno no mesmo dia é bloqueado. Trocar quando a tela de liderança existir.
- **Senhas em texto simples**, sem autenticação de verdade — igual ao padrão SBS v1. Evoluir
  antes de abrir o acesso à Brametal.
- **Firebase e GitHub**: criar numa etapa seguinte, conforme combinado.
- **Áreas e geolocalizações são cadastradas pelo próprio Pablo** (ele pediu explicitamente, não
  semear dados de exemplo) — o app fica intencionalmente zerado nesse cadastro.

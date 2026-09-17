# Plano — Fase 2+ (VTI/UD, movimentação e as 3 dashboards)

**Data**: 11/09/2026 · Baseado em `OBSERVACOES_POS_DESENVOLVIMENTO_SBS_ML_Brametal_11set2026.md`
**Status**: v2, revisado depois das respostas do Pablo às 3 perguntas da v1. Ainda
nada implementado.

Decidido com o Pablo (11/09/2026):
- Nº da VTI na movimentação do tratorista é **digitado ou selecionado numa lista**
  (não bipado).
- **Endereçamento no pátio**: sem perfil travado agora — vira uma permissão na matriz
  de RBAC (`PermissoesMatrix.jsx`), o Pablo atribui ao perfil que quiser depois.
  Endereço é campo único, mas **escopado a um Pátio** (escolhe o Pátio primeiro,
  cadastra os códigos dentro dele).
- **Movimentação do tratorista reaproveita a presença da Fase 1** em vez de ter
  chegada/saída própria — ver seção 2 abaixo, é a mudança mais importante desta
  versão do plano.
- **"Ociosidade" virou "disponibilidade"**, sem tolerância/limiar por horário — todo
  tempo ativo fora de uma movimentação em aberto conta como disponível.

---

## 0. O que fica de fora por enquanto (dependências externas)

- **Fluxo A (import de planilha da Brametal)**: continua bloqueado — faltam as colunas.
- **Tonelagem** (Dashboard Armazenamento/Conferência): precisa do peso unitário por UD,
  que só vem na planilha da Brametal (Fluxo A) ou seria preciso pedir esse dado à parte.
  O plano abaixo já deixa o campo `pesoKg` na UD, mas ele fica **vazio até chegar essa
  informação** — a dashboard mostra "—" no lugar da tonelagem enquanto isso.
- **Consumo de combustível** (cruzar com km): mencionado como aplicação futura, não
  entra neste plano.
- **Perfil do cliente Brametal acompanhando presença pelo celular**: mencionado como
  futuro, não entra neste plano (a Fase 1 já expõe o dado, só falta a tela/acesso).

## 1. Modelo de dados novo

Segue o padrão já usado no app: denormalizar nome ao lado do id (como `areaNome` em
`registrosPresenca`), e todo doc com `criadoEm`/`atualizadoEm` via `serverTimestamp()`.

### `enderecos` (escopado a um Pátio, não mais lista solta)
```
{ id, areaId, areaNome, codigo, ativo, criadoEm }
```
`areaId` aponta pra uma área `operacao`/`patio`. Cadastro: escolhe o Pátio → adiciona
códigos dentro dele (mesma tela, filtrando por área selecionada).

### `vtis`
```
{
  id,
  numero,              // código da VTI, texto livre (não bipado)
  status,              // 'cheia' | 'vazia'
  areaAtualId, areaAtualNome,   // onde está agora (denormalizado)
  ultimaMovimentacaoEm,
  criadoEm
}
```

### `uds`
```
{
  id,
  codigo,              // bipado (QR/código de barras da UD)
  vtiId, vtiNumero,    // null quando já endereçada/armazenada (saiu da VTI)
  status,              // 'na_vti' | 'endereçada' | 'armazenada'
  enderecoId, enderecoCodigo,   // preenchido ao endereçar
  pesoKg,              // null até ter a fonte do peso definida — ver pendência §3
  criadoEm, atualizadoEm
}
```

### `movimentacoesVti` — **revisado**: um doc por movimento, com DUAS fases (igual ao
padrão de `registrosPresenca`, que grava entrada+saída no mesmo doc)
```
{
  id,
  vtiId, vtiNumero,
  operadorId, operadorNome,        // colaborador tratorista (mesmo colaborador da presença)
  statusInformado,                 // 'cheia' | 'vazia' — informado no INÍCIO, obrigatório

  // fase INÍCIO — ao selecionar a VTI
  areaOrigemId, areaOrigemNome,    // herdado do areaAtualId atual da VTI
  geoInicioLat, geoInicioLng,
  horaInicio,

  // fase FIM — ao selecionar/confirmar o destino
  areaDestinoId, areaDestinoNome,  // selecionado pelo operador, validado por geo
  geoFimLat, geoFimLng, distanciaDestinoMetros,   // distância até o centro da área destino (validação)
  horaFim,

  distanciaPercorridaMetros,       // entre geoInicio e geoFim — é o "km" desse trecho
  status,                          // 'em_andamento' | 'concluida'
  criadoEm, atualizadoEm
}
```
`vtis.areaAtualId`/`status`/`ultimaMovimentacaoEm` são sempre os da última
`movimentacoesVti` **concluída** daquela VTI — atualizados junto no mesmo `updateDoc`
que fecha o movimento (fase FIM).

**Por que um operador só pode ter UM movimento `em_andamento` por vez**: ele precisa
concluir (chegar no destino) antes de selecionar outra VTI — é a mesma trava de
"operação em aberto" que o app-gestao-ml já usa em outro contexto (Coletor). A tela de
seleção de VTI busca `movimentacoesVti` do operador com `status === 'em_andamento'`
antes de deixar escolher uma nova.

Km percorrido e tempo trabalhando/disponível **não são campos gravados** — são
calculados por operador a partir de `movimentacoesVti` (concluídas) + `registrosPresenca`
(pra saber a janela ativo) daquele dia. Fica tudo em `lib/vti.js` (funções puras,
testáveis, sem tocar em UI) — espelhando como `lib/areas.js` e `lib/data.js` já
funcionam.

## 2. Como o tempo do tratorista é calculado (reaproveitando a Fase 1)

Não existe chegada/saída própria pro tratorista — ele é um **Colaborador comum**, com
vínculo de presença numa Área de Serviço, usando a MESMA tela pública
(`RegistroPresencaScreen.jsx`) que já existe:

1. **Checkin** (já existe) → a partir daí ele está **ativo e disponível**.
2. **Seleciona uma VTI** (tela nova) → informa status CHEIA/VAZIA → grava
   `movimentacoesVti` fase INÍCIO → ele passa a **"em operação"**.
3. **Seleciona o destino** (mesma tela ou tela seguinte) → app valida por geo que ele
   chegou → grava fase FIM → volta a **disponível**, livre pra pegar outra VTI.
4. **Checkout** (já existe, no mesmo local do checkin) → fecha o dia dele.

Cálculo por operador, por dia:
- `tempoAtivo` = checkout − checkin (ou agora − checkin, se ainda não saiu)
- `tempoTrabalhando` = soma de (`horaFim` − `horaInicio`) de cada `movimentacoesVti`
  concluída
- `tempoDisponivel` = `tempoAtivo` − `tempoTrabalhando` (sem limiar mínimo, sem
  tolerância — é isso que "sem tolerância por hora" decidiu)
- `qtdVtisCheias` / `qtdVtisVazias` = contagem de movimentos concluídos por
  `statusInformado`
- `kmPercorrido` = soma de `distanciaPercorridaMetros`
- `tonsMovimentadas` = soma do `pesoKg` das UDs que estavam em cada VTI movimentada
  (depende de `pesoKg` estar preenchido — ver pendência abaixo)

## 3. Telas novas e ordem de construção

| Ordem | Tela | Coleções | Observação |
|---|---|---|---|
| 1 | Cadastro de Endereço | `enderecos` | Escolhe o Pátio, cadastra códigos dentro dele. Mesmo padrão visual de `TurnosCadastro.jsx` |
| 2 | Nova permissão "Endereçamento" na matriz RBAC | — | Só o flag em `PermissoesMatrix.jsx`/`lib/permissoes.js`; o Pablo atribui ao perfil depois |
| 3 | Bipagem na origem (Fluxo B) | `vtis`, `uds` | Conferente seleciona/cria a VTI, bipa cada UD; a VTI nasce **cheia** |
| 4 | Seleção de VTI + destino (tratorista) | `movimentacoesVti`, `vtis` | Fase INÍCIO (seleciona VTI + status) e fase FIM (seleciona destino, geo valida) — ver §2 |
| 5 | Endereçamento no pátio | `uds`, `enderecos` | Bipa a UD, associa a um `enderecoId` do Pátio corrente; UD sai da VTI (`vtiId = null`, status `endereçada`) |
| 6 | Dashboard VTI (rastreamento) | leitura de `vtis` + `movimentacoesVti` | Localização atual, status, histórico do dia |
| 7 | Dashboard Operador de Trator | leitura de `movimentacoesVti` + `registrosPresenca` | Tempo trabalhando/disponível, qtd. VTIs, km — por operador e total (fórmulas em §2) |
| 8 | Dashboard Armazenamento/Conferência | leitura de `uds` | UDs endereçadas/armazenadas em tempo real; tonelagem fica "—" até `pesoKg` ter uma fonte (ver §4) |
| 9 | Refinamento do Dashboard de Presença | leitura de `registrosPresenca` (já existe) | "Online agora" quebrado por área (DDS/Pátio 1/Pátio 2/Fora) |

A ordem segue a dependência real: não dá pra ter Dashboard VTI sem VTI existindo
(passos 3-4), nem Dashboard Armazenamento sem endereçamento (passo 5), nem Dashboard
do Operador sem a presença JÁ vinculada ao tratorista (ele precisa estar cadastrado
como Colaborador com Área de Serviço — isso já existe na Fase 1, só precisa estar
feito pro tratorista de teste). O passo 9 é independente do resto — pode ser
adiantado ou feito em paralelo se preferir.

## 4. Peso da UD — confirmado (11/09/2026)

`pesoKg` vem **só da planilha importada (Fluxo A)** — a bipagem na origem (Fluxo B,
passo 3) **não** captura peso, não tem campo a mais nessa tela. Ou seja: a tonelagem
(passo 8, Dashboard Armazenamento/Conferência, e o `tonsMovimentadas` do Dashboard do
Operador no passo 7) **continua bloqueada até o Fluxo A existir** — mesmo com o Fluxo B
rodando, `uds.pesoKg` fica `null` pra tudo que entrou por bipagem, e as duas dashboards
mostram "—" nesse campo enquanto isso. O restante de cada dashboard (contagem de UDs,
km, tempo, quantidade de VTIs) funciona normalmente sem depender disso.

## 5. Confirmações do Pablo (11/09/2026, mensagem em paralelo à construção do passo 1)

- **Locais de movimentação (GAL/Produção)**: cadastrados com geolocalização
  demarcada fisicamente — já é exatamente como o cadastro de Área funciona hoje
  (geo capturada no local + raio). Sem mudança de código, só confirma o modelo.
- **Endereços dentro dos pátios**: cadastrados manualmente — confirma o passo 1
  (abaixo), que já foi construído assim (sem importação/geo, só código digitado).
- **DDS não tem saída; mede-se o tempo DDS → chegada no serviço**: **já existe**,
  construído na Fase 1 — é a seção "Dispersão DDS → área de trabalho" do
  `DashboardTab.jsx` (`registrosDds`/`registrosTrabalho`, tempo em minutos por
  colaborador + média do dia, com faixa de cor >15min/>30min). Nenhuma mudança
  necessária; só fica registrado aqui que a exigência do documento de observações
  já está coberta.

## 6. Progresso

- ✅ **Passo 1 — Cadastro de Endereço**: `EnderecosCadastro.jsx` criado, permissão
  `enderecos` no catálogo RBAC, integrado em Cadastros → Operação (ao lado de
  Turno). Testado no Browser pane: cria Pátio → seleciona → adiciona código →
  bloqueia duplicado (case-insensitive) → editar/desativar/excluir. `npm run
  build` limpo. Dados de teste apagados depois.
- ✅ **Passo 3 — Bipagem na origem (Fluxo B)**: `BipagemScreen.jsx`, item de
  1º nível na sidebar ("📦 Bipagem", permissão `bipagem`). Fluxo: escolhe a
  área de operação onde está → digita/abre a VTI (cria nova, reabre uma já
  cheia via lista de chips, ou reabre uma vazia existente pra encher de
  novo) → bipa UD por UD (bloqueia código duplicado, tanto repetido na
  mesma VTI quanto já bipado em outra). Testado ponta a ponta no Browser
  pane: abrir VTI nova → bipar UD → bloquear duplicado → trocar de VTI →
  reabrir pelo chip (UD antiga ainda lá) → tentar remover UD (confirmação
  nativa recusada automaticamente pelo ambiente de teste — o
  `window.confirm` do botão "Remover" não tem como ser aceito de forma
  automatizada aqui, mesma limitação já registrada pro `window.open`; o
  código do `deleteDoc` é idêntico ao padrão já usado e testado em
  `excluir()` de `TurnosCadastro.jsx`/`AreasCadastro.jsx`). `npm run
  build` limpo. Dados de teste apagados.
  Passo 2 do plano (permissão RBAC separada pra Endereçamento) NÃO foi
  feito ainda — só entra no passo 5 (Endereçamento no pátio), que é onde
  essa ação realmente existe.

## 7. Revisão de 17/09/2026 — Telas 1-3 (FASE_2_TELAS_1-3_BRAMETAL.md)

O Pablo trouxe um documento novo especificando Tela 1 (Importação),
Tela 2 (Check-in do Operador) e Tela 3 (Endereçamento), que **divergia**
deste plano em pontos importantes. Antes de implementar, os conflitos
foram levantados e resolvidos com ele via AskUserQuestion:

- **Movimentação do tratorista NÃO reaproveita mais a presença** (mudança
  em relação ao §2 acima, que ficou desatualizado): presença é só "ponto"
  (CPF, sem senha); o Operador de Trator e o Conferente de Pátio logam no
  APP normalmente (usuário/senha do RBAC já existente,
  `UsuariosCadastro.jsx`) e usam telas próprias — decisão do Pablo em
  17/09/2026. `movimentacoesVti` ficou autocontido (fase INÍCIO+FIM no
  mesmo doc, sem depender de checkin/checkout de presença).
- **Fluxo A (import) e Fluxo B (bipagem na origem) convivem** — import
  não substitui a bipagem manual.
- **Nomes de coleção existentes mantidos** (`vtis`, `uds`, `enderecos`)
  — não migrou pra `vti_status`/`udi_cadastro` como o documento novo
  sugeria. `uds` ganhou `destinoAreaId`/`destinoAreaNome` (só preenchido
  pelo Fluxo A) em vez de uma coleção `udi_armazenagem` separada — o
  "sair da VTI" do endereçamento é só uma troca de `status` pra
  `'enderecada'`, mantendo `vtiId` pra rastreabilidade.
- **GAL1/GAL2/Pátio 1/Pátio 2 são áreas comuns** (`tipo: 'operacao'`) já
  cadastradas por nome — não é um conceito novo.

### Implementado (17/09/2026)

- ✅ **Tela 1 — Importação de UDs** (`ImportacaoScreen.jsx`,
  `lib/importVti.js`): Fluxo A finalmente desbloqueado (o documento trouxe
  as colunas que faltavam desde 11/09). Lê Excel/CSV (biblioteca `xlsx`,
  mesmo padrão de `colaboradoresImport.js` do app-gestao-ml), agrupa por
  VTI, pede mapeamento de cada valor de `DESTINO_PADRAO` pra uma área já
  cadastrada (pré-seleciona por nome igual), cria/reabre `vtis` (mesma
  lógica de reabertura da Bipagem) e `uds` com `destinoAreaId`/`pesoKg`.
  Histórico das últimas 5 importações em nova coleção `importacoesVti`
  (best-effort: se a escrita falhar — ex. regra de segurança não
  liberada — não derruba a importação, que já gravou o que importa).
  **Testado ponta a ponta contra o Firestore real**: arquivo injetado via
  `DataTransfer`+`dispatchEvent` no Browser pane (o input file não aceita
  set via automação comum), mapeamento auto-detectado corretamente pros
  nomes exatos das áreas, VTI+3 UDs conferidos direto via REST do
  Firestore (payload, `destinoAreaId`, `pesoKg` todos corretos). Dados de
  teste apagados depois.
- ✅ **Tela 3 — Endereçamento** (`EnderecamentoScreen.jsx`): conferente
  escolhe o pátio, vê as VTIs com UDs pendentes PRA AQUELE pátio
  (`destinoAreaId` bate ou é nulo — UD do Fluxo B aceita em qualquer
  pátio), bipa UD por UD associando ao endereço escolhido; UD errada
  (de outra VTI, destino errado, ou já endereçada) é rejeitada com
  mensagem específica. Ao endereçar a última UD, a VTI vira `vazia`
  automaticamente; se sobrarem UDs pra outro pátio, aparece
  "Finalizar armazenagem neste pátio" → status `parcial`. **Testado
  ponta a ponta contra o Firestore real** (fluxo completo: bipar 2 UDs
  sem destino definido, incluindo bloqueio de duplicado, até a VTI virar
  `vazia` — confirmado via REST). O caminho de destino incompatível/
  `parcial` foi revisado no código mas não testado ao vivo (replicar o
  cenário exigiria inserir documentos sintéticos direto no Firestore por
  fora do app, o que a sessão bloqueou por segurança — é a mesma
  validação simples já testada em outro contexto, o duplicado).
- ✅ **Tela 2 — Check-in do Operador** (`CheckinOperadorScreen.jsx`):
  tratorista loga no app (perfil próprio via RBAC), geolocaliza (com
  fallback manual sempre visível, já que as áreas de Operação da
  Brametal ainda não têm geo cadastrada), seleciona VTI+status CHEIA/
  VAZIA na origem (grava `movimentacoesVti` fase INÍCIO, VTI vira
  `em_transporte`), confirma chegada no destino (fase FIM, VTI assume o
  status informado na área de destino). **Não foi possível testar a
  gravação ponta a ponta**: a coleção `movimentacoesVti` ainda não está
  liberada na regra de segurança do Firestore (só existiam `areas,
  colaboradores, turnos, registrosPresenca, perfis, usuarios, enderecos,
  vtis, uds`) — confirmado o erro exato (`permission-denied`) ao tentar
  iniciar uma movimentação de teste. Texto de regra atualizado entregue
  ao Pablo pra colar no Console (mesma trava de sempre: eu não publico
  regra de segurança sozinho).
- ✅ **Regra de segurança publicada pelo Pablo (17/09/2026)** e
  **Check-in reconfirmado ponta a ponta em produção**
  (pdbona.github.io/app-gestao-brametal): VTI de teste criada via
  Bipagem em GAL1 → movimentação iniciada e concluída pelo Check-in até
  Pátio 1 (Nova) → conferido via REST do Firestore que `vtis.status`
  voltou a `cheia` na área de destino e `movimentacoesVti` gravou as
  duas fases (INÍCIO/FIM) corretamente. `geoInicioLat/Lng` ficaram
  `null` porque as áreas de Operação ainda não têm geolocalização
  cadastrada — é o comportamento esperado do fallback manual. Dados de
  teste apagados depois.
- ⏳ Segue em aberto do plano original: dashboards (passos 6-9).

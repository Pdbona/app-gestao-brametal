# OBSERVAÇÕES PÓS-INÍCIO DO DESENVOLVIMENTO
## Projeto SBS_ML_Brametal
**Data**: 11 de setembro de 2026  
**Consultoria**: SBS Solution  
**Cliente Final**: Brahmetal (Guiares)  
**Operadora**: ML Serviços

---

## RESUMO EXECUTIVO

Após o início do desenvolvimento do aplicativo no Claude Code, foram identificadas novas funcionalidades e refinamentos necessários nas **três dashboards principais** do projeto e em dois fluxos de captura de dados inicial:

1. **Dashboard Operador de Trator** (movimentação, produtividade, quilometragem)
2. **Dashboard Armazenamento/Conferência** (UDs endereçadas, tonelagem)
3. **Dashboard Presença de Colaboradores** (checkin/checkout, controle de equipe)
4. **Captura Inicial de Dados** (Dois fluxos: importação Excel ou bipagem na origem)

---

## 1. DASHBOARD OPERADOR DE TRATOR (ML)

### Objetivo
Acompanhamento em tempo real de cada operador de trator: produtividade, localização, movimento de VTIs e quilometragem.

### Informações Necessárias por Operador
- **Identificação**: Login (cada operador tem sua conta)
- **VTIs Movimentadas**: 
  - Quantidade de VTIs CHEIAS movimentadas
  - Quantidade de VTIs VAZIAS movimentadas
  - Separado para cálculo de produtividade real
- **Tempo Trabalhando**: Tempo total em movimento de VTIs durante o dia
- **Ociosidade**: Períodos sem movimentação (parado)
- **Quilometragem**: 
  - Total de km percorrido por operador (de um ponto a outro)
  - Soma total de km de todos os operadores
  - Vem da geolocalização marcada em cada ponto (saída de GU, chegada em pátio, retorno, etc.)

### Aplicação Futura
- Mapear consumo de combustível (km + consumo do trator)
- Identificar oportunidades de melhoria no fluxo operacional
- Otimizar roteiros e reduzir ociosos
- Base para análises de custo e eficiência

---

## 2. FLUXO DE MOVIMENTAÇÃO DA VTI (Captura do Operador)

### Contexto
O operador de trator faz dois tipos de movimento:
- **Cheio**: leva VTI com mercadoria (UDs) de um local para pátio de descarga
- **Vazio**: pega VTI vazia em pátio e leva para novo local (GU ou outro pátio)

### Informações Obrigatórias a Cada Movimentação
1. **Localização** (geolocalização validada)
2. **Número da VTI** (digitado ou selecionado — ainda não definido se bipar)
3. **Status Obrigatório: CHEIA ou VAZIA**
   - O operador **sempre** informa o status ao pegar uma VTI para movimentar
   - Não é uma dedução automática do sistema

### Por Que é Obrigatório Informar?
- Às vezes a VTI pode ter mercadoria de outro local (não apenas ML)
- Não é possível deduzir automaticamente se está cheia ou vazia só pelo histórico
- Você precisa de uma **foto precisa e em tempo real** do que está em cada pátio
- Cada movimento = confirmação do status naquele exato momento

### Resultado
- Dashboard com visão clara: qual VTI está aonde, se está CHEIA ou VAZIA
- Informação confiável para gestão de pátios e planejamento

---

## 3. DASHBOARD VTI (RASTREAMENTO)

### Objetivo
Acompanhamento online de cada VTI em tempo real.

### Informações por VTI
- **Localização Atual**: Em qual pátio está, em qual GU, ou em trânsito
- **Status**: CHEIA ou VAZIA (informado pelo operador a cada movimentação)
- **Histórico Completo do Dia**: Mostra todas as movimentações
  - Uma VTI pode encher e esvaziar várias vezes no mesmo dia
  - Cada movimento é registrado com timestamp e localização

### Aplicação
- Visão online: foto do pátio em tempo real
- Onde está cada VTI e seu status naquele momento
- Rastreabilidade completa para gestão de estoque e planejamento

---

## 4. DASHBOARD ARMAZENAMENTO/CONFERÊNCIA (ML - Pátio)

### Objetivo
Acompanhamento em tempo real do trabalho de endereçamento e armazenagem realizado pela equipe de conferência da ML nos pátios.

### Informações Necessárias
- **Quantidade de UDs Endereçadas**: Em tempo real, enquanto o conferente está endereçando
- **Quantidade de UDs Armazenadas**: Total armazenado no pátio pela ML
- **Tonelagem Total Armazenada**: 
  - Vem da planilha fornecida por Brahmetal (deve conter peso por UD)
  - Cálculo: quantidade de UDs × peso unitário

### Composição de Serviços Executados (Saída/Relatório)
- Quantas VTIs foram recebidas e armazenadas
- Quantas toneladas foram armazenadas
- Isso é o output que será apresentado ao cliente

### Projeto de Metas
- **Meta Quantidade**: VTIs recebidas por dia (SLA futuro)
- **Meta Tonelagem**: Toneladas operacionalizadas/armazenadas por dia (SLA futuro)
- Apresentação ao cliente: demonstra volume e valor do trabalho executado

### Futuro (Segundo Momento)
- Cruzar dados da VTI (peso) com quantidade movimentada por operador
- Resultado: **tonelagem movimentada por operador**
- Por enquanto: foco em VTI + localização + status

---

## 5. DASHBOARD PRESENÇA DE COLABORADORES

### Contexto do Contrato
- Este é um **contrato à parte** da operação de movimentação
- Modelo: ML fornece mão de obra, Brahmetal faz a gestão operacional
- SBS precisa monitorar presença e pontualidade para controle de qualidade

### Objetivo
Acompanhamento online da equipe de colaboradores da ML na Brahmetal.

### Informações em Tempo Real
- **Quantidade de funcionários que foram pra DDS**: Quantos chegaram?
- **Quantidade em Área de Operação**: Quantos já fizeram checkin na área de trabalho?
- **Checkin e Checkout por Área**: Registro em tempo real
- **Online AGORA**: Quantos colaboradores ML estão em cada área neste momento?
  - DDS
  - Pátio 1
  - Pátio 2
  - Fora do local

### Histórico Capturado (Já em Desenvolvimento)
- Ausências
- Atrasos (checkin fora da janela de tolerância)
- Saídas antecipadas (checkout antes da hora)
- Todo apanhado que o aplicativo já está mapeando

### Aplicação Futura
- **Perfil do Cliente (Brahmetal)**: Possibilidade de acompanhar a presença da sua equipe via celular
- Integração com relatórios de controle de jornada

---

## 6. CAPTURA INICIAL DE DADOS (Dois Fluxos Possíveis)

### Contexto
Antes que a operação comece nos pátios, o sistema precisa ser alimentado com informações sobre VTIs e UDs. Existem **duas opções** para fazer isso.

### Opção A: Importação de Arquivo Excel

**Fluxo**:
1. Brahmetal fornece arquivo Excel com: VTIs + UDs carregadas em cada VTI
2. Administrativo faz upload da planilha no app
3. Sistema **pré-carrega** todas as informações (VTI status = CHEIA em GU)
4. Equipe de conferência no pátio inicia a **validação/conferência** das UDs

**Quando usar**: Quando você tem a lista consolidada de tudo que vai sair de uma vez

**Vantagem**: Rápido, dados já organizados, sistema pronto de uma vez

---

### Opção B: Conferência Física na Origem (Bipagem)

**Fluxo**:
1. Conferente da ML está **na origem** (local de saída antes da VTI partir)
2. Seleciona a VTI no app
3. **Bipa cada UD que está sobre a VTI** (QR de cada UD)
4. Sistema recebe os dados em tempo real (VTI status = CHEIA, com UDs registradas)
5. VTI sai para o pátio pronta para conferência

**Quando usar**: Quando a origem não tem dados consolidados ou você quer validar antes de sair

**Vantagem**: Mais preciso, captura progressiva, valida no físico imediatamente

---

### Resultado de Ambas Opções
- Sistema pré-carregado com VTIs + UDs
- Equipe de conferência no pátio tem visibilidade do que vai chegar
- Preparado para validação e endereçamento

---

## RESUMO DAS DASHBOARDS E FLUXOS

| Componente | Foco | Informações-Chave |
|---|---|---|
| Operador de Trator | Produtividade individual | VTIs (cheias/vazias), tempo, ociosidade, quilometragem |
| VTI | Rastreamento | Localização, status, histórico do dia |
| Armazenamento/Conferência | Serviço executado | UDs endereçadas, tonelagem, metas de SLA |
| Presença de Colaboradores | Controle de equipe | Funcionários por área, checkin/checkout, ausências |
| Captura Inicial | Alimentação do sistema | Importar Excel OU Bipar UDs na origem |

---

## PRÓXIMOS PASSOS

1. ✅ Refinamento do fluxo de captura (operador → VTI + status obrigatório)
2. ✅ Implementação das três dashboards com dados em tempo real
3. ✅ Validação de geolocalização em cada ponto de movimento
4. ✅ Duas opções de captura inicial (Importação Excel vs. Bipagem na origem)
5. ⏳ Testes com dados reais de Brahmetal
6. ⏳ Integração de SLAs e metas
7. ⏳ Futuro: módulo do cliente (Brahmetal) via celular

---

**Documento Preparado para Claude Code**  
SBS Solution | 11 de setembro de 2026

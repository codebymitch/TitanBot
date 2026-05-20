# Sistema de Permissões do Middleman (MM)

## Visão Geral

Este documento descreve o sistema de permissões implementado para o sistema de intermediação (MM) do Cbloxbot. O sistema define regras claras sobre quem pode iniciar uma intermediação, quem pode ser chamado como contraparte e quem pode atuar como middleman.

## Arquitetura

O sistema de permissões foi centralizado no módulo `src/services/mmPermissionService.js`, que fornece funções reutilizáveis para validação de permissões em todo o handler de MM.

### Componentes Principais

1. **mmPermissionService.js** - Serviço central de permissões
2. **mmHumanoHandler.js** - Handler que utiliza o serviço de permissões

## Regras de Permissão

### 1. Cargos de Administração

Estes cargos **PODEM** iniciar uma intermediação, mas **NÃO PODEM** ser chamados como contraparte:

- **Founder** (ID: 1505606856742277171)
- **Mod** (ID: 1505611786039328768)
- **Dev** (ID: 1505611576940433538)
- **Suporte** (ID: 1505631589407658064)
- **Middleman** (ID: 1505618270492033094)

**Motivo:** Como membros da equipe, eles estão acima de disputas comerciais e não devem ser parte em transações.

### 2. Bots Bloqueados

Estes bots **NÃO PODEM** participar de intermediações de forma alguma (nem iniciar, nem ser chamados):

- **MMbot** (ID: 1505774316418109520)
- **Ticket tool** (ID: 1505630788761424056)
- **Vouch** (ID: 1505612480796168355)
- **Jockie Music** (ID: 1505636836092018868)
- **Bots** (ID: 1505636940618404042)
- **Bot Oficial** (ID: 1506726277434970283)

**Motivo:** Bots não são entidades legais e não podem participar de transações comerciais.

### 3. Membros que Podem Ser Chamados

Estes cargos **PODEM** ser chamados como contraparte em intermediações:

- **Membro** (ID: 1505611790942343298)
- **Booster** (ID: 1505623811930853557)

**Condição:** Desde que não sejam administradores ou bots.

## Fluxo de Validação

### Ao Iniciar uma Intermediação

1. Verifica se o usuário está em cooldown (30 segundos)
2. Verifica se o usuário pode iniciar MM (`canStartMM`)
   - Não é bot bloqueado
   - Não tem cargo bloqueado para iniciar
3. Se aprovado, inicia o wizard de intermediação

### Ao Selecionar Contraparte

1. Verifica se não é o próprio usuário
2. Verifica se a contraparte pode ser selecionada (`canBeSelectedAsCounterparty`)
   - Não é bot bloqueado
   - Não é administrador
   - Tem cargo permitido (Membro ou Booster)
3. Se aprovado, prossegue com a criação do ticket

### Ao Assumir como Middleman

1. Verifica se o usuário é staff (`isUserStaff`)
   - É o dono do servidor, OU
   - Tem cargo de Suporte (por nome), OU
   - Tem cargo de staff configurado
2. Se aprovado, assume a intermediação

## API do Serviço de Permissões

### Funções Exportadas

```javascript
// Verificações básicas
isBlockedBot(userId)                    // Verifica se é bot bloqueado
isAdmin(member)                         // Verifica se é administrador
isCallableRole(member)                  // Verifica se tem cargo que pode ser chamado
canStartMM(member)                      // Verifica se pode iniciar MM
canBeCalledToMM(member)                 // Verifica se pode ser chamado para MM
canParticipateInMM(member)              // Verifica se pode participar de MM

// Validações completas
canBeSelectedAsCounterparty(member, initiatorId)  // Verifica se pode ser contraparte
canActAsMM(member, ticketData)                    // Verifica se pode agir como MM
isUserStaff(member, guild)                        // Verifica se é staff

// Validações de criação
validateMMCreation(initiator, counterparty)       // Valida criação de MM
getPermissionInfo(member)                         // Obtém informações de permissão
```

### Constantes Exportadas

```javascript
ADMIN_ROLE_IDS                // IDs dos cargos de administração
BLOCKED_BOT_IDS               // IDs dos bots bloqueados
ALLOWED_CALLABLE_ROLE_IDS     // IDs dos cargos que podem ser chamados
BLOCKED_START_ROLE_IDS        // IDs dos cargos bloqueados para iniciar
```

## Exemplos de Uso

### No Handler de MM

```javascript
import {
  canStartMM,
  canBeSelectedAsCounterparty
} from '../services/mmPermissionService.js';

// Verificar se pode iniciar
if (member && !canStartMM(member)) {
  return interaction.followUp({
    content: '❌ Você não tem permissão para iniciar uma intermediação.',
    ephemeral: true
  });
}

// Verificar contraparte
const counterpartyCheck = canBeSelectedAsCounterparty(selectedMember, userId);
if (!counterpartyCheck.allowed) {
  return interaction.followUp({
    content: `❌ ${counterpartyCheck.reason}`,
    ephemeral: true
  });
}
```

### Em Outros Módulos

```javascript
import mmPermissionService from './services/mmPermissionService.js';

// Obter informações detalhadas
const permInfo = mmPermissionService.getPermissionInfo(member);
console.log(permInfo.canStartMM);      // true/false
console.log(permInfo.canBeCalledToMM); // true/false
console.log(permInfo.roles.admin);     // ['role_id_1', ...]
```

## Manutenção

### Adicionar Novo Cargo de Administração

1. Adicione o ID do cargo em `ADMIN_ROLE_IDS` no `mmPermissionService.js`
2. Atualize este documento

### Adicionar Novo Bot Bloqueado

1. Adicione o ID do bot em `BLOCKED_BOT_IDS` no `mmPermissionService.js`
2. Atualize este documento

### Adicionar Novo Cargo que Pode Ser Chamado

1. Adicione o ID do cargo em `ALLOWED_CALLABLE_ROLE_IDS` no `mmPermissionService.js`
2. Atualize este documento

## Histórico de Mudanças

- **v1.0.0** (20/05/2026) - Implementação inicial do sistema de permissões
  - Centralização das regras de permissão
  - Criação do serviço `mmPermissionService.js`
  - Integração com `mmHumanoHandler.js`
  - Validação de contraparte no momento da seleção
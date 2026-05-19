# 🛡️ Sistema de Intermediação (Middleman) - Sem Banco de Dados

## Visão Geral

Este sistema de intermediação permite que trades seguras sejam realizadas no Discord **sem necessidade de banco de dados**. Todo o estado da intermediação é armazenado diretamente no **tópico do canal** criado para cada trade.

## ✨ Funcionalidades

- ✅ **Sem banco de dados** - Todo estado é armazenado no tópico do canal
- ✅ **Interface limpa** - Tabelas formatadas em estilo HTML-like usando code blocks
- ✅ **Multi-step wizard** - Configuração via menus ephemeral (privados)
- ✅ **Proteção anti-timeout** - `deferUpdate()` em todas as interações
- ✅ **Sistema de cargos** - Middleman e Staff com permissões distintas
- ✅ **Fechamento automático** - Canal deletado após conclusão

## 📋 Formato do Tópico do Canal

O estado da intermediação é armazenado no tópico do canal no seguinte formato:

```
MM_DATA:buyerId=123456|sellerId=789012|method=PIX|status=PENDING|mmId=345678
```

### Campos:
| Campo | Descrição |
|-------|-----------|
| `buyerId` | ID do comprador |
| `sellerId` | ID do vendedor |
| `method` | Método de pagamento (ex: PIX) |
| `status` | Status atual (PENDING, NOTIFIED, IN_PROGRESS, COMPLETED) |
| `mmId` | ID do middleman (apenas após assumir) |

## 🚀 Configuração

### 1. Variáveis de Ambiente (.env)

```env
# IDs dos Cargos (OBRIGATÓRIO)
MM_ROLE_ID=seu_id_do_cargo_middleman
STAFF_ROLE_ID=seu_id_do_cargo_staff

# ID da Categoria (OPCIONAL - será criada automaticamente se não existir)
MM_CATEGORY_ID=seu_id_da_categoria
```

### 2. Comandos Disponíveis

#### `/setup-mm` (Apenas Administradores)
Cria o painel de intermediação no canal atual.

```
/setup-mm
```

#### 🤝 Fluxo do Usuário

1. **Usuário clica em "🤝 Iniciar Intermediação"**
   - Menu ephemeral de seleção de pagamento (PIX)
   
2. **Seleciona método de pagamento**
   - Menu ephemeral de seleção de papel (Comprador/Vendedor)
   
3. **Seleciona seu papel**
   - Menu de seleção de usuário (contraparte)
   - Validação: não pode selecionar a si mesmo
   
4. **Seleciona a contraparte**
   - Canal privado é criado com permissões restritas
   - Tabela formatada é enviada

## 📊 Tabela de Intermediação

Exemplo de como a tabela é exibida:

```
┌──────────────────────────────────────────┐
│        DADOS DA INTERMEDIAÇÃO            │
├──────────────────────────────────────────┤
│ 💵 Método:    PIX                       │
│ 👤 Comprador: usuario_comprador         │
│ 🎒 Vendedor:  usuario_vendedor          │
├──────────────────────────────────────────┤
│ Status: ⏳ AGUARDANDO MIDDLEMAN          │
│                                          │
└──────────────────────────────────────────┘
```

## 🔄 Fluxo de Work

### 1. Criação do Ticket
- Canal privado criado com permissões para:
  - Comprador
  - Vendedor
  - Cargo Middleman
  - Cargo Staff

### 2. Solicitar Middleman
- Botão: **🚨 Solicitar Middleman**
- Notifica o cargo `@Middleman` ou `@Staff`
- Status muda para: **⏳ SUPORTE NOTIFICADO**

### 3. Assumir Intermediação
- Botão: **✋ Assumir Intermediação** (apenas para Staff/Middleman)
- Primeiro a clicar assume o ticket
- Mensagem de carregamento é exibida para comprador e vendedor
- Status muda para: **🟢 EM ANDAMENTO**
- ID do middleman é salvo no tópico
- Tempo de resposta otimizado (dentro do limite de 3 segundos do Discord)

### 4. Confirmar Entrega
- Botão: **📦 Confirmar Entrega** (apenas para o comprador)
- Comprador deve digitar "SIM" em um modal para confirmar
- Status muda para: **✅ ENTREGUE / AGUARDANDO MM**
- Botão "🔒 Fechar Ticket" é exibido para o middleman

### 5. Fechar Intermediação
- Botão: **🔒 Fechar Ticket** (apenas para o middleman que assumiu)
- Contagem regressiva de 5 segundos
- Canal é deletado automaticamente

## 🛡️ Segurança

### Validações Implementadas:
1. **Self-selection block** - Não pode selecionar a si mesmo
2. **Role-based permissions** - Apenas middleman/staff pode assumir
3. **Claim locking** - Apenas um middleman por ticket
4. **Close protection** - Apenas o middleman que assumiu pode fechar
5. **Admin override** - Administradores podem fechar qualquer ticket

### Anti-Timeout Protection:
Todas as interações usam `deferUpdate()` ou `deferReply()` imediatamente:

```javascript
export async function handleStart(interaction) {
  // CRITICAL: Defer immediately to prevent timeout
  await interaction.deferUpdate();
  // ... rest of handler
}
```

## 📁 Estrutura de Arquivos

```
src/
├── commands/
│   ├── mm.js              # Comando descontinuado (mostra mensagem de erro)
│   └── setup-mm.js        # Comando para criar painel
├── handlers/
│   └── mmHumanoHandler.js # Handler principal do sistema
├── config/
│   └── mmConfig.js        # Configurações do sistema
└── events/
    └── interactionCreate.js # Handler de interações
```

## 🔧 Funções de Parse/Serialize

### Parse Topic Data
```javascript
import { parseTopicData } from './handlers/mmHumanoHandler.js';

const data = parseTopicData(channel.topic);
// Retorna: { buyerId: '123', sellerId: '456', method: 'PIX', status: 'PENDING', mmId: '789' }
```

### Serialize Topic Data
```javascript
import { serializeTopicData } from './handlers/mmHumanoHandler.js';

const topic = serializeTopicData({
  buyerId: '123',
  sellerId: '456',
  method: 'PIX',
  status: 'PENDING'
});
// Retorna: "MM_DATA:buyerId=123|sellerId=456|method=PIX|status=PENDING"
```

## ⚠️ Limitações

1. **Sem histórico persistente** - Se o canal for deletado, os dados se perdem
2. **Sem estatísticas globais** - Não há tracking de trades completadas
3. **Sem sistema de reputação** - Não há ranking de usuários
4. **Limite de tópico** - Discord tem limite de 1024 caracteres no tópico

## 🆘 Troubleshooting

### "O aplicativo não respondeu"
- Verifique se `deferUpdate()` está sendo chamado no início de cada handler

### Canal não é criado
- Verifique se `MM_ROLE_ID` e `STAFF_ROLE_ID` estão configurados
- Verifique as permissões do bot

### Dados inválidos no tópico
- Verifique se o formato `MM_DATA:...` está correto
- Use `parseTopicData()` para ler os dados

## 📝 Changelog

### v2.0 (Atual)
- ✅ Removida dependência do MongoDB
- ✅ Estado armazenado no tópico do canal
- ✅ Interface HTML-like com tabelas formatadas
- ✅ Multi-step wizard ephemeral
- ✅ Proteção anti-timeout em todas as interações
- ✅ Sistema de claim locking
- ✅ Contagem regressiva no fechamento
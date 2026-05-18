/**
 * Middleman Humano Handler
 * 
 * Handler para o sistema de intermediação humano sem banco de dados.
 * Todos os dados são salvos no TOPIC do canal do Discord.
 */

import {
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder
} from 'discord.js';

// IDs personalizados dos botões
const ButtonCustomIds = {
  INICIAR_INTERMEDIACAO: 'mm_iniciar_intermediacao',
  PAGAMENTO_PIX: 'mm_pagamento_pix',
  SOU_COMPRADOR: 'mm_sou_comprador',
  SOU_VENDEDOR: 'mm_sou_vendedor',
  SOLICITAR_MIDDLEMAN: 'mm_solicitar_middleman',
  ASSUMIR_INTERMEDIACAO: 'mm_assumir_intermediacao',
  FECHAR_TICKET: 'mm_fechar_ticket'
};

/**
 * Parse os dados do tópico do canal
 * @param {string} topic - O tópico do canal
 * @returns {Object|null} - Dados da troca ou null se inválido
 */
function parseTopicData(topic) {
  if (!topic || !topic.startsWith('MM_HUMANO:')) return null;
  
  try {
    const jsonStr = topic.substring('MM_HUMANO:'.length);
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

/**
 * Serializa os dados da troca para o tópico
 * @param {Object} data - Dados da troca
 * @returns {string} - String formatada para o tópico
 */
function serializeTopicData(data) {
  return `MM_HUMANO:${JSON.stringify(data)}`;
}

/**
 * Formata menção de usuário
 * @param {import('discord.js').User} user - Usuário do Discord
 * @returns {string} - Menção formatada
 */
function userMention(user) {
  return `<@${user.id}>`;
}

/**
 * Handle o botão de iniciar intermediação
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {import('discord.js').Client} client
 */
async function handleIniciarIntermediacao(interaction, client) {
  // Defer the reply to prevent timeout
  await interaction.deferReply({ ephemeral: true });

  // Primeiro menu: forma de pagamento (apenas PIX disponível)
  const pagamentoSelect = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('mm_select_pagamento')
        .setPlaceholder('Selecione a forma de pagamento')
        .addOptions([
          {
            label: 'PIX',
            description: 'Pagamento via PIX (única opção disponível)',
            value: 'pix',
            emoji: '💠'
          }
        ])
    );

  await interaction.editReply({
    content: '🛡️ **Iniciando Intermediação**\n\nPrimeiro, selecione a forma de pagamento:',
    components: [pagamentoSelect]
  });
}

/**
 * Handle a seleção de pagamento
 * @param {import('discord.js').StringSelectMenuInteraction} interaction
 * @param {import('discord.js').Client} client
 */
async function handleSelectPagamento(interaction, client) {
  const selectedValue = interaction.values[0];
  
  if (selectedValue !== 'pix') {
    return interaction.reply({
      content: '❌ Apenas PIX está disponível no momento.',
      ephemeral: true
    });
  }

  // Segundo menu: pergunta se é comprador ou vendedor
  const papelSelect = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('mm_select_papel')
        .setPlaceholder('Qual é o seu papel nesta troca?')
        .addOptions([
          {
            label: 'Comprador',
            description: 'Você vai comprar um item/serviço',
            value: 'comprador',
            emoji: '🛒'
          },
          {
            label: 'Vendedor',
            description: 'Você vai vender um item/serviço',
            value: 'vendedor',
            emoji: '💰'
          }
        ])
    );

  await interaction.reply({
    content: '✅ Forma de pagamento: **PIX** selecionada.\n\nAgora, qual é o seu papel nesta troca?',
    components: [papelSelect],
    ephemeral: true
  });
}

/**
 * Handle a seleção do papel (comprador/vendedor)
 * @param {import('discord.js').StringSelectMenuInteraction} interaction
 * @param {import('discord.js').Client} client
 */
async function handleSelectPapel(interaction, client) {
  const papel = interaction.values[0];
  const ehComprador = papel === 'comprador';
  const papelTexto = ehComprador ? 'comprador' : 'vendedor';
  const outroPapelTexto = ehComprador ? 'vendedor' : 'comprador';

  // Terceiro menu: selecionar o outro usuário
  // Vamos usar um select menu de usuários
  const usuarioSelect = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`mm_select_usuario_${papel}`)
        .setPlaceholder(`Selecione o ${outroPapelTexto}`)
        .addOptions(
          // Vamos adicionar uma opção genérica que pede para mencionar
          {
            label: 'Mencionar usuário',
            description: `Clique e depois mencione o ${outroPapelTexto}`,
            value: 'mencionar',
            emoji: '👤'
          }
        )
    );

  await interaction.reply({
    content: `✅ Você selecionou: **${papelTexto}**\n\nAgora selecione o **${outroPapelTexto}** para esta troca.\n\n**Importante:** Você não pode selecionar a si mesmo.`,
    components: [usuarioSelect],
    ephemeral: true
  });
}

/**
 * Handle a seleção do outro usuário
 * @param {import('discord.js').StringSelectMenuInteraction} interaction
 * @param {import('discord.js').Client} client
 */
async function handleSelectUsuario(interaction, client) {
  const papel = interaction.customId.split('_').pop(); // 'comprador' ou 'vendedor'
  const ehComprador = papel === 'comprador';
  const outroPapelTexto = ehComprador ? 'vendedor' : 'comprador';

  // Pedir para mencionar o usuário
  await interaction.reply({
    content: `📝 Por favor, **mencione o ${outroPapelTexto}** (digite @ e selecione a pessoa).\n\nVocê tem 60 segundos.`,
    ephemeral: true
  });

  // Aguardar mensagem com menção
  const filter = (m) => {
    return m.author.id === interaction.user.id && m.mentions.users.size > 0;
  };

  try {
    const collected = await interaction.channel.awaitMessages({
      filter,
      max: 1,
      time: 60000,
      errors: ['time']
    });

    const mentionMsg = collected.first();
    const mencionado = mentionMsg.mentions.users.first();

    // Verificar se não está mencionando a si mesmo
    if (mencionado.id === interaction.user.id) {
      await mentionMsg.delete().catch(() => {});
      return interaction.followUp({
        content: '❌ Você não pode selecionar a si mesmo como o outro participante!',
        ephemeral: true
      });
    }

    // Verificar se o usuário mencionado é um bot
    if (mencionado.bot) {
      await mentionMsg.delete().catch(() => {});
      return interaction.followUp({
        content: '❌ Bots não podem participar de intermediações!',
        ephemeral: true
      });
    }

    await mentionMsg.delete().catch(() => {});

    // Agora criar o canal e configurar tudo
    const compradorId = ehComprador ? interaction.user.id : mencionado.id;
    const vendedorId = ehComprador ? mencionado.id : interaction.user.id;
    const criadorId = interaction.user.id;

    await criarCanalIntermediacao({
      client,
      guild: interaction.guild,
      criador: interaction.user,
      compradorId,
      vendedorId,
      pagamento: 'pix'
    });

    await interaction.followUp({
      content: '✅ Canal de intermediação criado com sucesso!',
      ephemeral: true
    });

  } catch (error) {
    if (error.message === 'Errors[TIMEOUT]') {
      return interaction.followUp({
        content: '❌ Tempo esgotado! Inicie uma nova intermediação.',
        ephemeral: true
      });
    }
    console.error('Erro ao selecionar usuário:', error);
    return interaction.followUp({
      content: '❌ Ocorreu um erro ao processar sua seleção.',
      ephemeral: true
    });
  }
}

/**
 * Cria o canal de intermediação
 * @param {Object} options
 */
async function criarCanalIntermediacao({ client, guild, criador, compradorId, vendedorId, pagamento }) {
  // Buscar os usuários
  const comprador = await client.users.fetch(compradorId);
  const vendedor = await client.users.fetch(vendedorId);

  // Criar nome do canal
  const nomeCanal = `mm-${vendedor.username}-e-${comprador.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '');

  // Garantir que o nome não seja muito longo (max 100 chars)
  const canalNome = nomeCanal.substring(0, 100);

  // Dados da troca para salvar no tópico
  const dadosTroca = {
    compradorId: comprador.id,
    compradorUsername: comprador.username,
    compradorTag: comprador.tag,
    vendedorId: vendedor.id,
    vendedorUsername: vendedor.username,
    vendedorTag: vendedor.tag,
    criadorId: criador.id,
    criadorUsername: criador.username,
    pagamento: pagamento,
    status: 'aguardando_middleman',
    middlemanId: null,
    middlemanUsername: null,
    createdAt: Date.now()
  };

  // Serializar dados para o tópico
  const topico = serializeTopicData(dadosTroca);

  // Obter ou criar categoria para tickets MM
  let categoria = guild.channels.cache.find(c => 
    c.type === ChannelType.GuildCategory && c.name.includes('Intermediação')
  );

  if (!categoria) {
    categoria = await guild.channels.create({
      name: '🛡️ Intermediação',
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel]
        }
      ]
    });
  }

  // Criar o canal com permissões
  const canal = await guild.channels.create({
    name: canalNome,
    type: ChannelType.GuildText,
    parent: categoria.id,
    topic: topico,
    permissionOverwrites: [
      {
        id: guild.id,
        deny: [PermissionFlagsBits.ViewChannel]
      },
      {
        id: comprador.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AddReactions,
          PermissionFlagsBits.AttachFiles
        ]
      },
      {
        id: vendedor.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AddReactions,
          PermissionFlagsBits.AttachFiles
        ]
      }
    ]
  });

  // Adicionar permissão para cargo de Staff/Middleman se existir
  const cargoStaff = guild.roles.cache.find(r => 
    r.name.toLowerCase().includes('staff') || r.name.toLowerCase().includes('middleman') || r.name.toLowerCase().includes('moderação')
  );

  if (cargoStaff) {
    await canal.permissionOverwrites.edit(cargoStaff, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      ManageMessages: true,
      AddReactions: true,
      AttachFiles: true,
      ManageChannels: true
    });
  }

  // Enviar mensagem de resumo com Embed
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🛡️ Resumo da Intermediação')
    .setDescription('Canal criado para intermediação segura da troca.')
    .addFields(
      {
        name: '💠 Forma de Pagamento',
        value: 'PIX',
        inline: true
      },
      {
        name: '🛒 Comprador',
        value: userMention(comprador),
        inline: true
      },
      {
        name: '💰 Vendedor',
        value: userMention(vendedor),
        inline: true
      },
      {
        name: '📋 Status',
        value: '⏳ Aguardando Middleman',
        inline: false
      }
    )
    .setFooter({ text: `Criado por ${criador.username}` })
    .setTimestamp();

  const botaoSolicitar = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(ButtonCustomIds.SOLICITAR_MIDDLEMAN)
        .setLabel('Solicitar Middleman')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🛡️')
    );

  await canal.send({
    content: `🛡️ **Intermediação Iniciada**\n${userMention(comprador)} e ${userMention(vendedor)}, este é o canal seguro para sua troca.`,
    embeds: [embed],
    components: [botaoSolicitar]
  });

  // Instruções
  const instrucoesEmbed = new EmbedBuilder()
    .setColor(0xFEE75C)
    .setTitle('📖 Instruções')
    .setDescription(
      '**Comprador:** Aguarde o middleman assumir e siga as instruções para envio do pagamento.\n\n' +
      '**Vendedor:** Aguarde a confirmação do pagamento pelo middleman antes de entregar o item.\n\n' +
      'Clique em "Solicitar Middleman" para chamar um membro da equipe.'
    )
    .setFooter({ text: 'Sistema de Intermediação • Cbloxbot' });

  await canal.send({
    content: `${userMention(comprador)} ${userMention(vendedor)}`,
    embeds: [instrucoesEmbed]
  });

  return { canal, dadosTroca };
}

/**
 * Handle o botão de solicitar middleman
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {import('discord.js').Client} client
 */
async function handleSolicitarMiddleman(interaction, client) {
  const dados = parseTopicData(interaction.channel.topic);
  
  if (!dados) {
    return interaction.reply({
      content: '❌ Dados da intermediação inválidos.',
      ephemeral: true
    });
  }

  // Verificar se já tem middleman
  if (dados.middlemanId) {
    return interaction.reply({
      content: `ℹ️ Esta intermediação já está sendo acompanhada por **${dados.middlemanUsername}**.`,
      ephemeral: true
    });
  }

  // Encontrar cargo de staff/middleman
  const cargoStaff = interaction.guild.roles.cache.find(r => 
    r.name.toLowerCase().includes('staff') || r.name.toLowerCase().includes('middleman') || r.name.toLowerCase().includes('moderação')
  );

  if (!cargoStaff) {
    return interaction.reply({
      content: '❌ Nenhum cargo de Staff/Middleman encontrado no servidor.',
      ephemeral: true
    });
  }

  // Atualizar botões
  const botoes = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(ButtonCustomIds.ASSUMIR_INTERMEDIACAO)
        .setLabel('Assumir Intermediação')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🛡️')
    );

  await interaction.message.edit({
    components: [botoes]
  });

  // Notificar staff
  await interaction.reply({
    content: `${cargoStaff.toString()} - Uma nova intermediação foi solicitada! Clique em "Assumir Intermediação" para acompanhar.`,
    allowedMentions: { roles: [cargoStaff.id] }
  });
}

/**
 * Handle o botão de assumir intermediação
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {import('discord.js').Client} client
 */
async function handleAssumirIntermediacao(interaction, client) {
  const dados = parseTopicData(interaction.channel.topic);
  
  if (!dados) {
    return interaction.reply({
      content: '❌ Dados da intermediação inválidos.',
      ephemeral: true
    });
  }

  // Verificar se já tem middleman
  if (dados.middlemanId) {
    return interaction.reply({
      content: `ℹ️ Esta intermediação já está sendo acompanhada por **${dados.middlemanUsername}**.`,
      ephemeral: true
    });
  }

  // Atualizar dados
  dados.middlemanId = interaction.user.id;
  dados.middlemanUsername = interaction.user.username;
  dados.status = 'em_andamento';

  // Atualizar tópico do canal
  await interaction.channel.setTopic(serializeTopicData(dados));

  // Atualizar embed original
  const messages = await interaction.channel.messages.fetch({ limit: 10 });
  const embedMessage = messages.find(m => m.embeds.length > 0 && m.embeds[0].title === '🛡️ Resumo da Intermediação');
  
  if (embedMessage) {
    const updatedEmbed = EmbedBuilder.from(embedMessage.embeds[0])
      .addFields({
        name: '🛡️ Middleman',
        value: userMention(interaction.user),
        inline: false
      })
      .setFields(
        { name: '💠 Forma de Pagamento', value: 'PIX', inline: true },
        { name: '🛒 Comprador', value: userMention(await client.users.fetch(dados.compradorId)), inline: true },
        { name: '💰 Vendedor', value: userMention(await client.users.fetch(dados.vendedorId)), inline: true },
        { name: '🛡️ Middleman', value: userMention(interaction.user), inline: true },
        { name: '📋 Status', value: '🔄 Em Andamento', inline: false }
      )
      .setColor(0x2ECC71);

    // Botões atualizados - remover botão de assumir, adicionar botão de fechar
    const botoesAtualizados = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(ButtonCustomIds.FECHAR_TICKET)
          .setLabel('Fechar Ticket')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🔒')
          .setDisabled(false)
      );

    await embedMessage.edit({
      embeds: [updatedEmbed],
      components: [botoesAtualizados]
    });
  }

  // Avisar no chat
  await interaction.reply({
    content: `✅ **${interaction.user.username}** assumiu a intermediação!\n\nAgora siga as instruções do middleman para concluir a troca com segurança.`
  });

  // Atualizar instruções
  const middlemanInstrucoes = new EmbedBuilder()
    .setColor(0x2ECC71)
    .setTitle('🛡️ Middleman Assumiu!')
    .setDescription(
      `O middleman **${interaction.user.username}** está acompanhando esta troca.\n\n` +
      '**Próximos passos:**\n' +
      '1. O middleman irá orientar o pagamento via PIX\n' +
      '2. O comprador realiza o pagamento\n' +
      '3. O middleman confirma o recebimento\n' +
      '4. O vendedor entrega o item/serviço\n' +
      '5. A intermediação é finalizada'
    );

  await interaction.channel.send({
    content: `${userMention(await client.users.fetch(dados.compradorId))} ${userMention(await client.users.fetch(dados.vendedorId))}`,
    embeds: [middlemanInstrucoes]
  });
}

/**
 * Handle o botão de fechar ticket
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {import('discord.js').Client} client
 */
async function handleFecharTicket(interaction, client) {
  const dados = parseTopicData(interaction.channel.topic);
  
  if (!dados) {
    return interaction.reply({
      content: '❌ Dados da intermediação inválidos.',
      ephemeral: true
    });
  }

  // Apenas o middleman pode fechar
  if (interaction.user.id !== dados.middlemanId) {
    return interaction.reply({
      content: '❌ Apenas o middleman responsável pode fechar esta intermediação.',
      ephemeral: true
    });
  }

  // Mensagem de despedida
  await interaction.channel.send({
    content: '🔒 **Intermediação Finalizada**\n\nEste canal será apagado em 5 segundos...'
  });

  // Aguardar 5 segundos e deletar canal
  setTimeout(async () => {
    try {
      await interaction.channel.delete();
    } catch (error) {
      console.error('Erro ao deletar canal:', error);
    }
  }, 5000);

  await interaction.reply({
    content: '✅ Intermediação finalizada com sucesso!',
    ephemeral: true
  });
}

export {
  ButtonCustomIds,
  parseTopicData,
  serializeTopicData,
  handleIniciarIntermediacao,
  handleSelectPagamento,
  handleSelectPapel,
  handleSelectUsuario,
  handleSolicitarMiddleman,
  handleAssumirIntermediacao,
  handleFecharTicket
};

export default {
  ButtonCustomIds,
  handleIniciarIntermediacao,
  handleSelectPagamento,
  handleSelectPapel,
  handleSelectUsuario,
  handleSolicitarMiddleman,
  handleAssumirIntermediacao,
  handleFecharTicket
};
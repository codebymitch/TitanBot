i.addSubcommand((subcommand) =>
    subcommand
        .setName("setup")
        .setDescription("Sets up the ticket creation panel.")

        .addChannelOption((option) =>
            option.setName("panel_channel")
                .setDescription("Channel for the panel")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
        )

        .addStringOption((option) =>
            option.setName("panel_message")
                .setDescription("Panel message")
                .setRequired(true)
        )

        // BUTTON 1 (REQUIRED)
        .addStringOption(o => o.setName("button_1_label").setDescription("Button 1 label").setRequired(true))
        .addChannelOption(o => o.setName("button_1_category").setDescription("Button 1 category").addChannelTypes(ChannelType.GuildCategory).setRequired(true))

        // BUTTON 2
        .addStringOption(o => o.setName("button_2_label").setDescription("Button 2 label"))
        .addChannelOption(o => o.setName("button_2_category").setDescription("Button 2 category").addChannelTypes(ChannelType.GuildCategory))

        // BUTTON 3
        .addStringOption(o => o.setName("button_3_label").setDescription("Button 3 label"))
        .addChannelOption(o => o.setName("button_3_category").setDescription("Button 3 category").addChannelTypes(ChannelType.GuildCategory))

        // BUTTON 4
        .addStringOption(o => o.setName("button_4_label").setDescription("Button 4 label"))
        .addChannelOption(o => o.setName("button_4_category").setDescription("Button 4 category").addChannelTypes(ChannelType.GuildCategory))

        // BUTTON 5
        .addStringOption(o => o.setName("button_5_label").setDescription("Button 5 label"))
        .addChannelOption(o => o.setName("button_5_category").setDescription("Button 5 category").addChannelTypes(ChannelType.GuildCategory))
)

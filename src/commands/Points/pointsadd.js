import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { checkUserPermissions } from '../../utils/permissionGuard.js';
import { addLevels, getLevelingConfig } from '../../services/points.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const MAX_USERS = 5;

function buildUserOptions(builder) {
    for (let i = 1; i <= MAX_USERS; i++) {
        builder.addUserOption(option =>
            option
                .setName(i === 1 ? 'user' : `user${i}`)
                .setDescription(i === 1 ? 'User to add points to' : `Additional user to add points to`)
                .setRequired(i === 1)
        );
    }
    return builder;
}

export default {
    data: buildUserOptions(
        new SlashCommandBuilder()
            .setName('pointsadd')
            .setDescription('Add points to one or more users')
            .addIntegerOption(option =>
                option
                    .setName('points')
                    .setDescription('Number of points to add')
                    .setRequired(true)
                    .setMinValue(1)
            )
    )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false),
    category: 'Points',

    async execute(interaction, config, client) {
        try {
            await InteractionHelper.safeDefer(interaction);

            const hasPermission = await checkUserPermissions(
                interaction,
                PermissionFlagsBits.ManageGuild,
                'You need ManageGuild permission to use this command.'
            );
            if (!hasPermission) return;

            const levelingConfig = await getLevelingConfig(client, interaction.guildId);
            if (!levelingConfig?.enabled) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        new EmbedBuilder()
                            .setColor('#f1c40f')
                            .setDescription('The points system is currently disabled on this server.')
                    ],
                    flags: MessageFlags.Ephemeral
                });
            }

            const pointsToAdd = interaction.options.getInteger('points');

            const targetUsers = [];
            for (let i = 1; i <= MAX_USERS; i++) {
                const user = interaction.options.getUser(i === 1 ? 'user' : `user${i}`);
                if (user && !targetUsers.some(u => u.id === user.id)) {
                    targetUsers.push(user);
                }
            }

            const results = [];
            for (const user of targetUsers) {
                const member = await interaction.guild.members.fetch(user.id).catch(() => null);
                if (!member) {
                    results.push(`⚠️ ${user} — not found in this server, skipped.`);
                    continue;
                }
                try {
                    const userData = await addLevels(client, interaction.guildId, user.id, pointsToAdd);
                    results.push(`✅ ${user} — **${pointsToAdd}** points added (total: **${userData.level}**)`);
                    logger.info(`[ADMIN] ${interaction.user.tag} added ${pointsToAdd} points to ${user.tag} in guild ${interaction.guildId}`);
                } catch (err) {
                    results.push(`❌ ${user} — failed: ${err.userMessage ?? err.message}`);
                    logger.error(`Failed to add points to ${user.id}:`, err);
                }
            }

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    createEmbed({
                        title: '✅ Points Added',
                        description: results.join('\n'),
                        color: 'success'
                    })
                ]
            });
        } catch (error) {
            logger.error('PointsAdd command error:', error);
            await handleInteractionError(interaction, error, { type: 'command', commandName: 'pointsadd' });
        }
    }
};

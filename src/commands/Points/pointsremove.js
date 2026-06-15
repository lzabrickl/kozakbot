import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { checkUserPermissions } from '../../utils/permissionGuard.js';
import { removeLevels, getUserLevelData, getLevelingConfig } from '../../services/points.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const USER_MENTION_RE = /<@!?(\d+)>/g;

export default {
    data: new SlashCommandBuilder()
        .setName('pointsremove')
        .setDescription('Remove points from one or more users')
        .addStringOption(option =>
            option
                .setName('users')
                .setDescription('Mention the users to remove points from (e.g. @Alice @Bob @Charlie)')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('points')
                .setDescription('Number of points to remove from each user')
                .setRequired(true)
                .setMinValue(1)
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

            const pointsToRemove = interaction.options.getInteger('points');
            const usersInput = interaction.options.getString('users');

            const userIds = [...new Set([...usersInput.matchAll(USER_MENTION_RE)].map(m => m[1]))];

            if (userIds.length === 0) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        new EmbedBuilder()
                            .setColor('#e74c3c')
                            .setDescription('No valid user mentions found. Please @mention at least one user.')
                    ],
                    flags: MessageFlags.Ephemeral
                });
            }

            const results = [];
            for (const userId of userIds) {
                const member = await interaction.guild.members.fetch(userId).catch(() => null);
                if (!member) {
                    results.push(`⚠️ <@${userId}> — not found in this server, skipped.`);
                    continue;
                }

                const userData = await getUserLevelData(client, interaction.guildId, userId);
                if (userData.totalXp === 0 && userData.level === 0) {
                    results.push(`⚠️ <@${userId}> — already has 0 points, skipped.`);
                    continue;
                }

                try {
                    const updatedData = await removeLevels(client, interaction.guildId, userId, pointsToRemove);
                    results.push(`✅ <@${userId}> — **${pointsToRemove}** points removed (total: **${updatedData.level}**)`);
                    logger.info(`[ADMIN] ${interaction.user.tag} removed ${pointsToRemove} points from ${member.user.tag} in guild ${interaction.guildId}`);
                } catch (err) {
                    results.push(`❌ <@${userId}> — failed: ${err.userMessage ?? err.message}`);
                    logger.error(`Failed to remove points from ${userId}:`, err);
                }
            }

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    createEmbed({
                        title: '✅ Points Removed',
                        description: results.join('\n'),
                        color: 'success'
                    })
                ]
            });
        } catch (error) {
            logger.error('PointsRemove command error:', error);
            await handleInteractionError(interaction, error, { type: 'command', commandName: 'pointsremove' });
        }
    }
};

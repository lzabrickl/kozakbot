import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { getUserLevelData, getLevelingConfig } from '../../services/points.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getColor } from '../../config/bot.js';

export default {
    data: new SlashCommandBuilder()
        .setName('pointscheck')
        .setDescription("Check a user's current points")
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to check (defaults to yourself)')
                .setRequired(false)
        )
        .setDMPermission(false),
    category: 'Points',

    async execute(interaction, config, client) {
        try {
            await InteractionHelper.safeDefer(interaction);

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

            const targetUser = interaction.options.getUser('user') ?? interaction.user;
            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

            if (!member) {
                throw new TitanBotError(
                    `User ${targetUser.id} not found in guild`,
                    ErrorTypes.USER_INPUT,
                    'The specified user is not in this server.'
                );
            }

            const userData = await getUserLevelData(client, interaction.guildId, targetUser.id);
            const points = userData?.level ?? 0;

            const embed = new EmbedBuilder()
                .setColor(getColor('primary'))
                .setTitle(`${member.displayName}'s Points`)
                .setThumbnail(member.displayAvatarURL({ dynamic: true }))
                .setDescription(`${member} has **${points}** point${points !== 1 ? 's' : ''}.`)
                .setTimestamp();

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            logger.debug(`Points checked for user ${targetUser.id} in guild ${interaction.guildId}`);
        } catch (error) {
            logger.error('PointsCheck command error:', error);
            await handleInteractionError(interaction, error, { type: 'command', commandName: 'pointscheck' });
        }
    }
};

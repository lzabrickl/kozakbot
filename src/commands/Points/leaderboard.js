import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ComponentType } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { getLeaderboard, getLevelingConfig } from '../../services/points.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const PAGE_SIZE = 10;

function buildPage(leaderboard, page, totalPages) {
    const start = page * PAGE_SIZE;
    const entries = leaderboard.slice(start, start + PAGE_SIZE);

    const lines = entries.map((user, i) => {
        const rank = start + i + 1;
        const mention = `<@${user.userId}>`;
        let prefix;
        if (rank === 1) prefix = '🥇';
        else if (rank === 2) prefix = '🥈';
        else if (rank === 3) prefix = '🥉';
        else prefix = `**${rank}.**`;
        return `${prefix} ${mention} — ${user.level} pts`;
    });

    const embed = new EmbedBuilder()
        .setTitle('🏆 Points Leaderboard')
        .setColor('#2ecc71')
        .setDescription(lines.join('\n'))
        .setFooter({ text: `Page ${page + 1} of ${totalPages} • ${leaderboard.length} members` })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('lb_prev')
            .setLabel('◀ Previous')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId('lb_next')
            .setLabel('Next ▶')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === totalPages - 1),
    );

    return { embed, row };
}

export default {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription("Shows the server's points leaderboard")
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

            const leaderboard = await getLeaderboard(client, interaction.guildId);
            const totalPages = Math.max(1, Math.ceil(leaderboard.length / PAGE_SIZE));
            let page = 0;

            const { embed, row } = buildPage(leaderboard, page, totalPages);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed],
                components: totalPages > 1 ? [row] : [],
            });

            if (totalPages <= 1) return;

            const message = await interaction.fetchReply();
            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                filter: i => i.user.id === interaction.user.id && (i.customId === 'lb_prev' || i.customId === 'lb_next'),
                time: 300_000,
            });

            collector.on('collect', async btn => {
                if (btn.customId === 'lb_prev') page = Math.max(0, page - 1);
                else page = Math.min(totalPages - 1, page + 1);

                const { embed: newEmbed, row: newRow } = buildPage(leaderboard, page, totalPages);
                await btn.update({ embeds: [newEmbed], components: [newRow] }).catch(() => null);
            });

            collector.on('end', () => {
                interaction.editReply({ components: [] }).catch(() => null);
            });

            logger.debug(`Leaderboard displayed for guild ${interaction.guildId}`);
        } catch (error) {
            logger.error('Leaderboard command error:', error);
            await handleInteractionError(interaction, error, { type: 'command', commandName: 'leaderboard' });
        }
    },
};

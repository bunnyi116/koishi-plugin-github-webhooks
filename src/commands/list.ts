import { Context } from 'koishi'
import { Subscribers, TABLES_SUBSCRIBERS } from '../database'
import { PluginConfig } from '..'

export function listCommand(ctx: Context, config: PluginConfig) {
    ctx.command('wh-list', '查看订阅列表')
        .alias('查看订阅github')
        .option('admin', '3')
        .action(async ({ session, options }) => {
            if (options.admin) {    // 管理员
                const list = await ctx.database.get(TABLES_SUBSCRIBERS, {})
                if (!list.length) {
                    session.send('暂无订阅记录。')
                    return;
                }
                const content = list.map((item: Subscribers) => {
                    return `目标：${item.target} | 仓库：${item.repo} | 事件：${item.events} | 平台：${item.platform}`
                }).join('\n')
                session.send(`所有订阅记录：\n${content}`)
            } else {
                const target = session.guildId || session.userId || session.channelId
                if (!target) {
                    session.send('无法识别订阅目标。')
                    return;
                }
                const platform = session.platform
                const list = await ctx.database.get(TABLES_SUBSCRIBERS, { target, platform }) as Subscribers[]
                if (!list.length) {
                    session.send('当前无任何订阅。')
                    return;
                }
                const content = list.map(item => `- ${item.repo} (事件: ${item.events})`).join('\n')
                session.send(`当前订阅的仓库：\n${content}`)
            }
        })
}

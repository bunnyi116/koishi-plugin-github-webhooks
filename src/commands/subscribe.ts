import { Context } from 'koishi'
import { PluginConfig } from '..'
import { TABLES_SUBSCRIBERS } from '../database'

export function subscribeCommand(ctx: Context, config: PluginConfig) {
    ctx.command('wh-sub [repo:string] [eventTypes:string]', '订阅指定 Github 仓库事件推送')
        .alias('仓库订阅')
        .option('desc', '默认订阅所有事件，如需指定事件请用逗号分隔，例如 push,star')
        .action(async ({ session }, repo?: string, eventTypes?: string) => {
            // 若未传入仓库参数，则返回配置中的仓库列表
            if (!repo) {
                if (config.repositories.length === 0) {
                    session.send('当前未设置可供订阅的仓库。')
                    return
                }
                const repoList = config.repositories
                    .map((item, index) => `${index}: ${item.repo}`)
                    .join('\n')
                session.send(`请选择订阅的仓库：\n${repoList}`)
                return;
            }

            // 检查仓库是否在配置项中
            const repoConfig = config.repositories.find(item => item.repo === repo)
            if (!repoConfig) {
                session.send(`仓库 ${repo} 未在预设列表中，请选择正确的仓库。`)
                return;
            }

            // 确定订阅目标、平台和类型
            const target = session.guildId || session.userId || session.channelId
            if (!target) {
                session.send('无法识别订阅目标，请在群聊、私聊或频道中使用此命令。')
                return;
            }
            const platform = session.platform
            const type = session.guildId ? 'group' : (session.userId ? 'user' : 'channel')
            const events = eventTypes ? eventTypes.trim() : 'all'

            // 检查订阅是否已存在（组合主键唯一）
            const exists = await ctx.database.get(TABLES_SUBSCRIBERS, { platform, target, repo })
            if (exists.length) {
                // 存在则更新（覆盖设置，例如 events 字段）
                await ctx.database.set(TABLES_SUBSCRIBERS, { platform, target, repo }, { events })
                session.send(`已更新订阅：${repo}，订阅事件：${events}`)
            } else {
                await ctx.database.create(TABLES_SUBSCRIBERS, { platform, target, repo, type, events })
                session.send(`订阅成功：${repo}，订阅事件：${events}`)
            }
        })
}

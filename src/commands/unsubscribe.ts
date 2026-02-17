import { Context } from 'koishi'
import { PluginConfig } from '..';
import { TABLES_SUBSCRIBERS } from '../database';

export function unsubscribeCommand(ctx: Context, config: PluginConfig) {
    ctx.command('wh-unsub [repo:string] [target]', '取消指定 Github 仓库事件推送订阅')
        .alias('仓库取消订阅')
        .option('admin', '3')
        .action(async ({ session, options }, repo?: string, targetArg?: string) => {
            // 确定目标
            let target: string;
            if (targetArg) {
                if (!options.admin) {
                    session.send('只有管理员才允许删除其他订阅记录。');
                    return;
                }
                target = targetArg;
            } else {
                target = session.guildId || session.channelId || session.userId;
            }
            if (!target) {
                session.send('无法识别订阅目标。');
                return;
            }
            const platform = session.platform;

            // 未传入 repo 参数
            if (!repo) {
                const userSubs = await ctx.database.get(TABLES_SUBSCRIBERS, { platform, target });
                if (userSubs.length == 1) {
                    await ctx.database.remove(TABLES_SUBSCRIBERS, { platform, target });
                    session.send(`仓库取消订阅成功：${repo}`);
                    return;
                } else if (userSubs.length) {
                    const listText = userSubs
                        .map((item, index) => `${index}: ${item.repo} (事件: ${item.events})`)
                        .join('\n');
                    session.send(`未找到订阅 ${repo}。\n您当前已订阅的仓库列表：\n${listText}`);
                    return;
                }
                session.send(`未找到订阅 ${repo}，且当前没有任何订阅记录。`);
                return;
            }

            // 已传入 repo 参数
            const subscriptions = await ctx.database.get(TABLES_SUBSCRIBERS, { platform, target, repo });
            if (subscriptions.length >= 1) {
                await ctx.database.remove(TABLES_SUBSCRIBERS, { platform, target, repo });
                session.send(`仓库取消订阅成功：${repo}`);
                return;
            } else {
                session.send(`没有找到仓库订阅记录: ${repo}`);
                return;
            }
        });
}

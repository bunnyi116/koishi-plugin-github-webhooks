import { Context } from 'koishi'
import { Subscribers, TABLES_SUBSCRIBERS } from '../database'

export function listCommand(ctx: Context) {
  ctx.command('github.list', '查看订阅列表')
    .alias('github.查看订阅')
    .option('all', '-a 查看所有订阅', { authority: 3 })
    .action(async ({ session, options }) => {
      if (options.all) {
        // 管理员查看所有订阅
        const list = await ctx.database.get(TABLES_SUBSCRIBERS, {});
        if (!list.length) {
          await session.send('暂无任何订阅记录。');
          return;
        }
        const content = list.map((item: Subscribers) => {
          return `目标：${item.target} | 仓库：${item.repo} | 事件：${item.events} | 平台：${item.platform}`;
        }).join('\n');
        await session.send(`所有订阅记录：\n${content}`);
      } else {
        // 查看当前频道/群组的订阅
        const target = session.guildId || session.userId || session.channelId;
        if (!target) {
          await session.send('无法识别订阅目标。');
          return;
        }
        const platform = session.platform;
        const list = await ctx.database.get(TABLES_SUBSCRIBERS, { target, platform }) as Subscribers[];
        if (!list.length) {
          await session.send('当前无任何订阅。');
          return;
        }
        const content = list.map(item => `- ${item.repo} (事件: ${item.events})`).join('\n');
        await session.send(`当前订阅的仓库：\n${content}`);
      }
    });
}

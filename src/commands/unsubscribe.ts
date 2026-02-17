import { Context } from 'koishi'
import { TABLES_SUBSCRIBERS } from '../database';

export function unsubscribeCommand(ctx: Context) {
  ctx.command('github.unsub <owner:string> <repo:string>', '取消订阅指定 GitHub 仓库')
    .alias('github.仓库取消订阅')
    .usage('例如：github.unsub owner repo')
    .example('github.unsub koishijs koishi')
    .action(async ({ session }, owner?: string, repo?: string) => {
      if (!owner || !repo) {
        await session.send('请提供仓库所有者和仓库名称\n使用方法：github.unsub owner repo\n例如：github.unsub koishijs koishi');
        return;
      }

      const target = session.guildId || session.channelId || session.userId;
      if (!target) {
        await session.send('无法识别订阅目标。');
        return;
      }

      const platform = session.platform;
      const repoFullName = `${owner}/${repo}`;

      // 检查订阅是否存在
      const subscriptions = await ctx.database.get(TABLES_SUBSCRIBERS, { platform, target, repo: repoFullName });
      if (subscriptions.length >= 1) {
        await ctx.database.remove(TABLES_SUBSCRIBERS, { platform, target, repo: repoFullName });
        await session.send(`✅ 取消订阅成功：${repoFullName}`);
      } else {
        await session.send(`❌ 没有找到仓库订阅记录：${repoFullName}`);
      }
    });
}

import { Context } from 'koishi'
import { TABLES_SUBSCRIBERS } from '../database'
import { EVENT_CONFIG, SUPPORTED_EVENTS } from '../utils'

/**
 * 交互式选择事件类型
 */
async function promptEventSelection(session: any): Promise<string> {
  const eventList = ['0. 全部事件'];
  SUPPORTED_EVENTS.forEach((eventKey, index) => {
    const [emoji, desc] = EVENT_CONFIG[eventKey];
    eventList.push(`${index + 1}. ${emoji} ${desc} (${eventKey})`);
  });

  const message = [
    '请选择要订阅的事件：',
    ...eventList,
    '',
    '如需订阅多个指定事件，请使用【数字+空格/全角逗号/半角逗号+数字】的形式',
    '例如：【1 2 3】或【1,2,3】或【1，2，3】',
    '直接回复 0 或不输入（30秒超时）则订阅全部事件'
  ].join('\n');

  await session.send(message);

  const userInput = await session.prompt(30000);

  if (!userInput || userInput.trim() === '' || userInput.trim() === '0') {
    return 'all';
  }

  const selectedIndices = userInput
    .split(/[\s,，]+/)
    .map(s => s.trim())
    .filter(s => s !== '')
    .map(s => parseInt(s))
    .filter(n => !isNaN(n) && n > 0 && n <= SUPPORTED_EVENTS.length);

  if (selectedIndices.length === 0) {
    await session.send('未识别到有效的事件选择，默认订阅全部事件');
    return 'all';
  }

  const selectedEvents = selectedIndices.map(i => SUPPORTED_EVENTS[i - 1]);
  return selectedEvents.join(',');
}

export function resetSubscribeCommand(ctx: Context) {
  ctx.command('github.reset <owner:string> <repo:string>', '重置订阅事件')
    .alias('github.重置订阅')
    .usage('例如：github.reset owner repo')
    .example('github.reset koishijs koishi')
    .action(async ({ session }, owner?: string, repo?: string) => {
      if (!owner || !repo) {
        await session.send('请提供仓库所有者和仓库名称\n使用方法：github.reset owner repo\n例如：github.reset koishijs koishi');
        return;
      }

      const target = session.guildId || session.userId || session.channelId;
      if (!target) {
        await session.send('无法识别订阅目标，请在群聊、私聊或频道中使用此命令。');
        return;
      }

      const platform = session.platform;
      const repoFullName = `${owner}/${repo}`;

      // 检查订阅是否存在
      const exists = await ctx.database.get(TABLES_SUBSCRIBERS, { platform, target, repo: repoFullName });
      if (!exists.length) {
        await session.send(`当前未订阅仓库 ${repoFullName}\n请先使用 github.sub 命令订阅`);
        return;
      }

      // 交互式选择事件
      const events = await promptEventSelection(session);

      // 更新订阅
      await ctx.database.set(TABLES_SUBSCRIBERS, { platform, target, repo: repoFullName }, { events });

      const eventDesc = events === 'all' ? '全部事件' : events.split(',').map(e => {
        const [emoji, desc] = EVENT_CONFIG[e] || ['', e];
        return `${emoji}${desc}`;
      }).join('、');

      await session.send(`✅ 重置成功！\n仓库：${repoFullName}\n事件：${eventDesc}`);
    });
}

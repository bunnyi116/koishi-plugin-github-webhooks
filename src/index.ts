import crypto from 'crypto'
import { Context, Schema, Element, h } from 'koishi'
import { } from '@koishijs/plugin-server'
// import { } from '@koishijs/plugin-database-sqlite'

// 当前支持的事件类型列表
const SUPPORTED_EVENTS = ['star', 'push', 'workflow_run', 'issues', 'pull_request', 'release', 'issue_comment']

export const name = 'github-webhooks'
export const inject = { required: ['database', 'server'] }

export interface Subscription {
  repo: string       // GitHub 仓库全名，例如 owner/repo
  target: string     // 订阅目标 id（群、用户或频道）
  type: string       // 订阅类型：group, user, channel
  platform: string
  events: string     // 订阅的事件类型（多个事件以逗号分隔），默认为 "all"
}

declare module 'koishi' {
  interface Tables {
    github_subscription: Subscription
  }
}

export interface Config {
  path: string
  repositories: Array<{
    repo: string
    secret: string
  }>
  enableImage: boolean
  enableUnknownEvent: boolean
}

export const Config: Schema<Config> = Schema.object({
  path: Schema.string().default('/github/webhooks').description('Github Webhook 路由路径'),
  repositories: Schema.array(
    Schema.object({
      repo: Schema.string().description('预设仓库全名，例如 owner/repo'),
      secret: Schema.string().description('该仓库对应的 Webhook secret'),
    })
  ).description('允许监听的仓库列表，每个仓库必须配置 secret').default([]),
  enableImage: Schema.boolean().default(false).description('是否在推送时附带 opengraph 图片'),
  enableUnknownEvent: Schema.boolean().default(false).description('是否推送未知事件消息'),
})

/**
 * 从 URL 中提取 GitHub 仓库路径信息
 */
function getGithubRegURL(url: string): string {
  const regex = /(?<=https:\/\/github\.com).*/
  const res = url.match(regex)
  return res ? res[0] : ''
}

/**
 * 根据订阅项发送消息。遍历 ctx.bots 中所有 bot，
 * 如果订阅平台与 bot 平台一致，则发送消息到对应目标，
 * 同时启用 Koishi 内置过滤器（filter）。
 */
function sendEventMessage(ctx: Context, subs: Subscription[], msgElement: Element[]) {
  // 如果消息链为空，则不发送
  if (!msgElement.length) return
  ctx.bots.forEach(bot => {
    subs.forEach(sub => {
      try {
        if (sub.platform.toLowerCase() === bot.platform.toLowerCase()) {
          ctx.bots[`${bot.platform}:${bot.selfId}`].sendMessage(`${sub.target}`, msgElement, { filter: true })
        }
      } catch (e) {
        ctx.logger('github-webhook').error(e)
      }
    })
  })
}

/**
 * 根据不同 Github 事件构造消息链，并加入 emoji 美化
 * @param event 事件类型
 * @param payload webhook 负载
 * @param config 插件配置（用于判断是否附带图片、未知事件推送）
 */
function buildMsgChain(event: string, payload: any, config: Config): Element[] {
  let msgChain: Element[] = []
  const repo = payload.repository
  const repoName = repo?.full_name || '未知仓库'
  const sender = payload.sender || {}
  switch (event) {
    case 'star': {
      const action = payload.action
      const starCount = repo?.stargazers_count ?? 0
      const contentBase = action === 'created'
        ? `⭐ 用户 ${sender.login} star 了仓库 ${repoName}（现有 ${starCount} 个 star）`
        : `⭐ 用户 ${sender.login} unstar 了仓库 ${repoName}（剩余 ${starCount} 个 star）`
      if (config.enableImage) {
        const regUrl = getGithubRegURL(repo['html_url'])
        const hash = crypto.createHash('sha256').update(new Date().toString()).digest('hex').slice(0, 8)
        const imgURL = { src: 'https://opengraph.githubassets.com/' + hash + regUrl }
        msgChain = [h('message', contentBase, h('img', imgURL))]
      } else {
        msgChain = [h('message', contentBase)]
      }
      break
    }
    case 'push': {
      const pusher = payload.pusher || {}
      const commits = payload.commits || []
      let content = `🚀 用户 ${pusher.name} push 到仓库 ${repoName}，提交信息如下：\n`
      commits.forEach((commit: any) => {
        content += `- ${commit.message}\n`
      })
      content += `详情：${payload.compare}`
      // 如果允许图片，则构造 commit 对应的图片（可选）
      if (config.enableImage) {
        const imgElements: Element[] = []
        commits.forEach((commit: any) => {
          const imgHash = crypto.createHash('sha256').update(commit.id).digest('hex').slice(0, 8)
          const urlRes = 'https://opengraph.githubassets.com/' + imgHash + getGithubRegURL(commit.url)
          imgElements.push(h('img', { src: urlRes }))
        })
        msgChain = [h('message', content, imgElements)]
      } else {
        msgChain = [h('message', content)]
      }
      break
    }
    case 'workflow_run': {
      if (payload.action === 'completed') {
        const workDetail = payload.workflow_run
        let content = `⚙️ Action 通知：\n仓库：${repoName}\n事件：${workDetail.event}\n名称：${workDetail.name}\n结果：${workDetail.conclusion}\n`
        content += `相关 Commit：${workDetail.display_title}\n详情：${workDetail.html_url}`
        msgChain = [h('message', content)]
      }
      break
    }
    case 'issues': {
      const issue = payload.issue || {}
      if (payload.action === 'opened') {
        let content = `📝 仓库 ${repoName} 新 Issue [#${issue.number}]：\n标题：${issue.title}\n作者：${issue.user.login}\n详情：${issue.html_url}`
        msgChain = [h('message', content)]
      } else if (payload.action === 'closed') {
        let content = `📝 仓库 ${repoName} Issue [#${issue.number}] 已关闭\n标题：${issue.title}\n详情：${issue.html_url}`
        msgChain = [h('message', content)]
      }
      break
    }
    case 'pull_request': {
      const pr = payload.pull_request || {}
      if (payload.action === 'opened') {
        let content = `🔀 仓库 ${repoName} 新 Pull Request [#${pr.number}]：\n标题：${pr.title}\n作者：${pr.user.login}\n详情：${pr.html_url}`
        msgChain = [h('message', content)]
      } else if (payload.action === 'closed') {
        let content = `🔀 仓库 ${repoName} Pull Request [#${pr.number}] ${pr.merged ? '已合并' : '已关闭'}\n标题：${pr.title}\n详情：${pr.html_url}`
        msgChain = [h('message', content)]
      }
      break
    }
    case 'release': {
      const release = payload.release || {}
      if (payload.action === 'published') {
        let content = `🏷️ 仓库 ${repoName} 发布新 Release：\n版本：${release.tag_name}\n作者：${release.author.login}\n详情：${release.html_url}`
        msgChain = [h('message', content)]
      }
      break
    }
    case 'issue_comment': {
      const issue = payload.issue || {}
      const comment = payload.comment || {}
      if (payload.action === 'created') {
        let content = `💬 仓库 ${repoName} Issue [#${issue.number}] 收到新评论：\n${comment.body}\n作者：${comment.user.login}\n详情：${comment.html_url}`
        msgChain = [h('message', content)]
      }
      break
    }
    default: {
      // 对于未知事件，根据配置决定是否推送（并添加仓库名称）
      if (config.enableUnknownEvent) {
        msgChain = [h('message', `仓库 ${repoName} 收到未知事件: ${event}`)]
      } else {
        msgChain = []
      }
      break
    }
  }
  return msgChain
}

export function apply(ctx: Context, config: Config) {
  ctx.model.extend('github_subscription', {
    repo: { type: 'string', length: 150 },
    target: { type: 'string', length: 150 },
    type: { type: 'string', length: 60 },
    platform: { type: 'string', length: 60 },
    events: 'string',
  }, {
    primary: ['platform', 'type', 'target', 'repo'],
  })

  // 用户订阅命令：wh-sub
  ctx.command('wh-sub [repo:string] [eventTypes:string]', '订阅指定 Github 仓库事件推送')
    .alias('订阅github')
    .option('desc', '默认订阅所有事件，如需指定事件请用逗号分隔，例如 push,star')
    .action(async ({ session }, repo?: string, eventTypes?: string) => {
      // 若未传入仓库参数，则返回配置中的仓库列表（带序号）
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

      let repoName = ''
      if (/^\d+$/.test(repo)) {
        // 若输入为数字，则作为序号查找
        const idx = Number(repo)
        if (idx < 0 || idx >= config.repositories.length) {
          session.send('仓库序号无效，请输入有效的序号。')
          return;
        }
        repoName = config.repositories[idx].repo
      } else {
        repoName = repo
      }
      // 检查仓库是否在配置项中
      const repoConfig = config.repositories.find(item => item.repo === repoName)
      if (!repoConfig) {
        session.send(`仓库 ${repoName} 未在预设列表中，请选择正确的仓库。`)
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
      const exists = await ctx.database.get('github_subscription', { repo: repoName, target, platform })
      if (exists.length) {
        // 存在则更新（覆盖设置，例如 events 字段）
        await ctx.database.set('github_subscription', { repo: repoName, target, platform }, { events })
        session.send(`已更新订阅：${repoName}，订阅事件：${events}`)
      } else {
        await ctx.database.create('github_subscription', { repo: repoName, target, platform, type, events })
        session.send(`订阅成功：${repoName}，订阅事件：${events}`)
      }
    })


  // 合并取消订阅命令（普通用户取消自己订阅，管理员可传入 target 参数删除指定订阅）
  // 合并取消订阅命令（普通用户取消自己订阅，管理员可传入 target 参数删除指定订阅）
  ctx.command('wh-unsub [repo:string] [target]', '取消指定 Github 仓库事件推送订阅')
    .alias('取消订阅github')
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
        target = session.guildId || session.userId || session.channelId;
      }
      if (!target) {
        session.send('无法识别订阅目标。');
        return;
      }
      const platform = session.platform;

      // 如果未传入 repo 参数，则返回当前用户的订阅列表（带序号）
      if (!repo) {
        const subscriptions = await ctx.database.get('github_subscription', { target, platform });
        if (!subscriptions.length) {
          session.send('当前没有订阅记录。');
          return;
        }
        const listText = subscriptions
          .map((item, index) => `${index}: ${item.repo} (事件: ${item.events})`)
          .join('\n');
        session.send(`您当前已订阅的仓库列表：\n${listText}\n请使用 #wh-unsub <序号> 来取消订阅。`);
        return;
      }

      // 判断传入的 repo 是否为数字（订阅序号取消）
      if (/^\d+$/.test(repo)) {
        const subscriptions = await ctx.database.get('github_subscription', { target, platform });
        if (!subscriptions.length) {
          session.send('当前没有订阅记录。');
          return;
        }
        const index = Number(repo);
        if (index < 0 || index >= subscriptions.length) {
          session.send('订阅序号无效，请输入有效的序号。');
          return;
        }
        const subscription = subscriptions[index];
        await ctx.database.remove('github_subscription', { repo: subscription.repo, target, platform });
        session.send(`取消订阅成功：${subscription.repo}，目标：${target}`);
        return;
      } else {
        // 否则按仓库名称取消订阅
        const subscriptions = await ctx.database.get('github_subscription', { repo, target, platform });
        if (!subscriptions.length) {
          // 当未找到对应订阅时，返回当前用户所有订阅记录
          const userSubs = await ctx.database.get('github_subscription', { target, platform });
          if (userSubs.length) {
            const listText = userSubs
              .map((item, index) => `${index}: ${item.repo} (事件: ${item.events})`)
              .join('\n');
            session.send(`未找到订阅 ${repo}。\n您当前已订阅的仓库列表：\n${listText}`);
            return;
          } else {
            session.send(`未找到订阅 ${repo}，且当前没有任何订阅记录。`);
            return;
          }
          return;
        }
        await ctx.database.remove('github_subscription', { repo, target, platform });
        session.send(`取消订阅成功：${repo}，目标：${target}`);
        return;
      }
    });


  // 合并查看订阅命令：wh-list
  // 当使用 --admin 选项时显示所有订阅记录，否则只显示当前会话的订阅
  ctx.command('wh-list', '查看订阅列表')
    .alias('查看订阅github')
    .option('admin', '3')
    .action(async ({ session, options }) => {
      if (options.admin) {
        const list = await ctx.database.get('github_subscription', {})
        if (!list.length) {
          session.send('暂无订阅记录。')
          return;
        }
        const content = list.map((item: Subscription) => {
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
        const list = await ctx.database.get('github_subscription', { target, platform }) as Subscription[]
        if (!list.length) {
          session.send('当前无任何订阅。')
          return;
        }
        const content = list.map(item => `- ${item.repo} (事件: ${item.events})`).join('\n')
        session.send(`当前订阅的仓库：\n${content}`)
      }
    })

  // 获取当前支持的事件类型命令
  ctx.command('wh-types', '获取当前支持推送的 Github 事件类型')
    .alias('支持事件')
    .action(({ session }) => {
      const content = SUPPORTED_EVENTS.map(type => {
        let emoji = ''
        switch (type) {
          case 'star': emoji = '⭐'; break
          case 'push': emoji = '🚀'; break
          case 'workflow_run': emoji = '⚙️'; break
          case 'issues': emoji = '📝'; break
          case 'pull_request': emoji = '🔀'; break
          case 'release': emoji = '🏷️'; break
          case 'issue_comment': emoji = '💬'; break
          default: break
        }
        return `${emoji} ${type}`
      }).join('\n')
      session.send(`当前支持的 Github 事件类型：\n${content}`)
    })

  // Webhook 路由处理
  ctx.server.post(config.path, async (res) => {
    const payload = res.request.body
    const event = res.headers['x-github-event'] as string
    const repoFullName = payload.repository?.full_name
    if (!repoFullName) {
      res.status = 400
      res.body = 'Bad Request: repository info missing'
      return
    }
    // 查找对应仓库的配置项
    const repoConfig = config.repositories.find(item => item.repo === repoFullName)
    if (!repoConfig) {
      res.status = 200
      res.body = `仓库 ${repoFullName} 未在预设列表中，忽略处理。`
      return
    }
    // 校验 secret：使用对应仓库的 secret 计算签名
    const signature = res.headers['x-hub-signature-256'] as string
    const hmac = crypto.createHmac('sha256', repoConfig.secret)
    const digest = 'sha256=' + hmac.update(JSON.stringify(payload)).digest('hex')
    if (signature !== digest) {
      res.status = 403
      res.body = 'Forbidden'
      return
    }
    // 查询当前仓库的所有订阅项，并根据用户自定义的事件类型进行过滤
    let subscriptions = await ctx.database.get('github_subscription', { repo: repoFullName }) as Subscription[]
    subscriptions = subscriptions.filter(sub => {
      if (!sub.events || sub.events === 'all') return true
      const allowedEvents = sub.events.split(',').map(e => e.trim())
      return allowedEvents.includes(event)
    })
    if (!subscriptions.length) {
      res.status = 200
      res.body = 'No subscription for this repository or event not subscribed'
      return
    }
    // 构造消息链，并通知对应订阅者
    const msgChain = buildMsgChain(event, payload, config)
    // 如果消息链为空，则不推送
    if (msgChain.length) {
      sendEventMessage(ctx, subscriptions, msgChain)
    }
    res.status = 200
    res.body = 'Webhook received'
  })
}

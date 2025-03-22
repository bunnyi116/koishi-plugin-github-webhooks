import crypto from 'crypto'
import { Context, Schema, Element, h } from 'koishi'
import { } from '@koishijs/plugin-server'
// import { } from '@koishijs/plugin-database-sqlite'

// 当前支持的事件类型列表
const SUPPORTED_EVENTS = ['star', 'push', 'workflow_run', 'issues', 'pull_request', 'release']

export const name = 'github-webhooks'
export const inject = { required: ['database', 'server'] }

export interface Subscription {
  id?: number
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
  // 仓库配置项：只需要配置仓库全名和对应的 secret
  repositories: Array<{
    repo: string
    secret: string
  }>
}

export const Config: Schema<Config> = Schema.object({
  path: Schema.string().default('/github/webhooks').description('Github Webhook 路由路径'),
  repositories: Schema.array(
    Schema.object({
      repo: Schema.string().description('预设仓库全名，例如 owner/repo'),
      secret: Schema.string().description('该仓库对应的 Webhook secret'),
    })
  ).description('允许监听的仓库列表，每个仓库必须配置 secret').default([]),
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
 * 如果订阅平台与 bot 平台一致，则发送消息到对应目标。
 */
function sendEventMessage(ctx: Context, subs: Subscription[], msgElement: Element[]) {
  ctx.bots.forEach(bot => {
    subs.forEach(sub => {
      try {
        if (sub.platform.toLowerCase() === bot.platform.toLowerCase()) {
          ctx.bots[`${bot.platform}:${bot.selfId}`].sendMessage(`${sub.target}`, msgElement)
        }
      } catch (e) {
        ctx.logger('github-webhook').error(e)
      }
    })
  })
}

/**
 * 根据不同 Github 事件构造消息链，并加入 emoji 美化
 */
function buildMsgChain(event: string, payload: any): Element[] {
  let msgChain: Element[] = []
  const repo = payload.repository
  const repoName = repo?.full_name || '未知仓库'
  const sender = payload.sender || {}
  switch (event) {
    case 'star': {
      const action = payload.action
      const starCount = repo?.stargazers_count ?? 0
      const regUrl = getGithubRegURL(repo['html_url'])
      const hash = crypto.createHash('sha256').update(new Date().toString()).digest('hex').slice(0, 8)
      const imgURL = { src: 'https://opengraph.githubassets.com/' + hash + regUrl }
      if (action === 'created') {
        const content = `⭐ 用户 ${sender.login} star 了仓库 ${repoName}（现有 ${starCount} 个 star）`
        msgChain = [h('message', content, h('img', imgURL))]
      } else if (action === 'deleted') {
        const content = `⭐ 用户 ${sender.login} unstar 了仓库 ${repoName}（剩余 ${starCount} 个 star）`
        msgChain = [h('message', content, h('img', imgURL))]
      }
      break
    }
    case 'push': {
      const pusher = payload.pusher || {}
      const commits = payload.commits || []
      let content = `🚀 用户 ${pusher.name} push 到仓库 ${repoName}，提交信息如下：\n`
      const imgElements: Element[] = []
      commits.forEach((commit: any) => {
        content += `- ${commit.message}\n`
        const imgHash = crypto.createHash('sha256').update(commit.id).digest('hex').slice(0, 8)
        const urlRes = 'https://opengraph.githubassets.com/' + imgHash + getGithubRegURL(commit.url)
        imgElements.push(h('img', { src: urlRes }))
      })
      content += `详情：${payload.compare}`
      msgChain = [h('message', content, imgElements)]
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
    default: {
      msgChain = [h('message', `收到 Github 事件: ${event}`)]
      break
    }
  }
  return msgChain
}

export function apply(ctx: Context, config: Config) {
  ctx.model.extend('github_subscription', {
    id: 'unsigned',
    repo: 'string',
    target: 'string',
    type: 'string',
    platform: 'string',
    events: 'string',
  }, {
    primary: 'id',
    autoInc: true,
  })

  // 用户订阅命令
  // 用户订阅命令（将 repo 参数设为可选）
  ctx.command('wh-sub [repo:string] [eventTypes:string]', '订阅指定 Github 仓库事件推送')
    .alias('订阅github')
    .option('desc', '默认订阅所有事件，如需指定事件请用逗号分隔，例如 push,star')
    .action(async ({ session }, repo?: string, eventTypes?: string) => {
      // 如果没有传入仓库参数，则告知当前可订阅仓库列表
      if (!repo) {
        if (config.repositories.length === 0) {
          session.send('订阅失败,您没有输入仓库名称,当前没有设置可供订阅的仓库。')
          return;
        }
        const repoList = config.repositories.map(item => item.repo).join('\n')
        session.send(`订阅失败,您没有输入仓库名称,当前可订阅仓库列表：\n${repoList}`)
        return;
      }
      // 如果传入了仓库参数，则继续订阅逻辑
      const target = session.guildId || session.userId || session.channelId
      if (!target) {
        session.send('无法识别订阅目标，请在群聊、私聊或频道中使用此命令。')
        return;
      }
      const platform = session.platform
      const exists = await ctx.database.get('github_subscription', { repo, target, platform })
      if (exists.length) {
        session.send('该仓库已订阅过了。')
        return;
      }
      const events = eventTypes ? eventTypes.trim() : 'all'
      await ctx.database.create('github_subscription', {
        repo,
        target,
        platform,
        type: session.guildId ? 'group' : (session.userId ? 'user' : 'channel'),
        events,
      })
      await session.send(`订阅成功：${repo}，订阅事件：${events}`)
    })

  // 取消订阅命令
  ctx.command('wh-unsub <repo>', '取消指定 Github 仓库事件推送订阅')
    .alias('取消订阅github')
    .action(async ({ session }, repo: string) => {
      const target = session.guildId || session.userId || session.channelId
      if (!target) {
        session.send('无法识别订阅目标。')
        return;
      }
      const platform = session.platform
      const subscription = await ctx.database.get('github_subscription', { repo, target, platform })
      if (!subscription.length) {
        session.send('未找到对应的订阅。')
        return;
      }
      await ctx.database.remove('github_subscription', { repo, target, platform })
      session.send(`取消订阅成功：${repo}`)
    })

  // 查看当前订阅命令
  ctx.command('wh-list', '列出本会话已订阅的 Github 仓库及订阅的事件类型')
    .alias('查看订阅github')
    .action(async ({ session }) => {
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
          default: break
        }
        return `${emoji} ${type}`
      }).join('\n')
      session.send(`当前支持的 Github 事件类型：\n${content}`)
    })

  // 管理员命令：查看所有订阅记录
  ctx.command('wh-admin-list', '【管理员】查看所有 Github 订阅记录')
    .alias('管理订阅列表')
    .option('admin', '3')
    .action(async ({ session }) => {
      const list = await ctx.database.get('github_subscription', {})
      if (!list.length) {
        session.send('暂无订阅记录。')
        return;
      }
      const content = list.map((item: Subscription) => {
        return `目标：${item.target} | 仓库：${item.repo} | 事件：${item.events} | 平台：${item.platform}`
      }).join('\n')
      session.send(`所有订阅记录：\n${content}`)
    })

  // 管理员命令：删除指定订阅记录
  ctx.command('wh-admin-remove <repo> <target>', '【管理员】删除指定 Github 订阅记录')
    .alias('删除订阅')
    .option('admin', '3')
    .action(async ({ session }, repo: string, target: string) => {
      const platform = session.platform
      const subscription = await ctx.database.get('github_subscription', { repo, target, platform })
      if (!subscription.length) {
        session.send('未找到对应的订阅记录。')
        return;
      }
      await ctx.database.remove('github_subscription', { repo, target, platform })
      session.send(`已删除订阅记录：仓库 ${repo}，目标 ${target}`)
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
    const msgChain = buildMsgChain(event, payload)
    sendEventMessage(ctx, subscriptions, msgChain)
    res.status = 200
    res.body = 'Webhook received'
  })
}

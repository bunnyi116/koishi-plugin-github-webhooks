import { Context, Element, h, Universal, Bot } from 'koishi'
import { Logger } from './logger'

/**
 * 支持的事件类型配置
 */
export const EVENT_CONFIG = {
  star: ['⭐', 'Star 事件'],
  push: ['🚀', '代码推送'],
  workflow_run: ['⚙️', '工作流'],
  issues: ['📝', 'Issue 操作'],
  pull_request: ['🔀', 'PR 操作'],
  release: ['🏷️', '版本发布'],
  issue_comment: ['💬', 'Issue 评论'],
  fork: ['⑂', '仓库 Fork'],
  watch: ['👀', '仓库关注']
} as const

export const SUPPORTED_EVENTS = Object.keys(EVENT_CONFIG)

/**
 * 根据订阅项发送消息
 */
export function sendEventMessage(ctx: Context, subscriptions: any[], msgElement: (Element | undefined)[], logger: Logger) {
  if (!msgElement.length) return

  subscriptions.forEach(sub => {
    try {
      // 查找对应的 bot
      const bot = (Object.values(ctx.bots) as Bot[]).find(
        b => b.selfId === sub.selfId || b.user?.id === sub.selfId
      );

      if (!bot) {
        logger.warn(`未找到 bot: ${sub.selfId}`);
        return;
      }

      // 跳过 koishi 沙盒 bot 的在线检查
      if (sub.selfId !== 'koishi' && bot.status !== Universal.Status.ONLINE) {
        logger.debug(`bot ${sub.selfId} 不在线`);
        return;
      }

      // 发送消息到指定频道
      logger.debug(`发送消息: bot=${sub.selfId}, channel=${sub.channelId}`);
      bot.sendMessage(sub.channelId, msgElement);
    } catch (e) {
      logger.error(`发送消息失败:`, e);
    }
  });
}

/**
 * 辅助工具函数
 */
const helper = {
  repoHeader: (repo: any): string =>
    `📦 仓库：${repo?.full_name || '未知仓库'}`,

  formatItem: (emoji: string, label: string, value?: any): string => {
    const strValue = value !== undefined && value !== null
      ? value.toString().trim()
      : ''
    return strValue ? `${emoji} ${label}：${strValue}` : ''
  },

  formatLink: (text: string, url: string): string =>
    `🔗 ${text}：${url}`,

  truncate: (text: string, length: number): string =>
    text?.length > length ? text.slice(0, length) + '...' : text || '',

  formatCommits: (commits: any[], max = 3): string[] => {
    if (!commits?.length) return []
    const lines = [
      `📜 提交列表（${commits.length} 个）：`,
      ...commits.slice(0, max).map(c =>
        `├ ${c.id.slice(0, 7)}: ${helper.truncate(c.message.split('\n')[0], 50)}`
      )
    ]
    if (commits.length > max) {
      lines.push(`└ 仅显示前 ${max} 个提交...`)
    }
    return lines
  }
}

/**
 * 事件处理器
 */
const eventHandlers: Record<string, (payload: any) => string | null> = {
  star: (payload) => {
    const { action, repository, sender } = payload
    return [
      helper.repoHeader(repository),
      helper.formatItem('⭐', 'Star 事件', action === 'created' ? '新增' : '取消'),
      helper.formatItem('👤', '操作用户', sender?.login),
      helper.formatItem('✨', '当前星数', repository?.stargazers_count?.toString() || '0'),
      helper.formatLink('查看仓库', repository.html_url)
    ].filter(Boolean).join('\n')
  },

  push: (payload) => {
    const branch = payload.ref.split('/').pop()
    return [
      helper.repoHeader(payload.repository),
      helper.formatItem('🚀', '代码推送', `分支 ${branch}`),
      helper.formatItem('👤', '提交者', payload.pusher?.name),
      ...helper.formatCommits(payload.commits),
      helper.formatLink('查看变更', payload.compare)
    ].filter(Boolean).join('\n')
  },

  workflow_run: (payload) => {
    if (payload.action !== 'completed') return ''
    const workflow = payload.workflow_run
    const status = workflow.conclusion === 'success' ? '✅ 成功' : '❌ 失败'

    const start = new Date(workflow.run_started_at || workflow.created_at)
    const end = new Date(workflow.updated_at)
    const duration = Math.round((end.getTime() - start.getTime()) / 1000)

    return [
      helper.repoHeader(payload.repository),
      helper.formatItem('⚙️', '工作流状态', status),
      helper.formatItem('📛', '工作流名称', workflow.name),
      helper.formatItem('⏱️', '运行时长', `${duration}秒`),
      helper.formatLink('查看详情', workflow.html_url)
    ].filter(Boolean).join('\n')
  },

  issues: (payload) => {
    const { action, repository } = payload
    const issue = payload.issue || {}
    const sender = payload.sender?.login || '未知用户'

    const baseLines = [
      helper.repoHeader(repository),
      `📌 事件类型：${{
        opened: '📝 新建 Issue',
        closed: '🔒 关闭 Issue',
        reopened: '🔓 重新开启 Issue',
        deleted: '🗑️ 删除 Issue',
        assigned: '👤 指派 Issue',
        labeled: '🏷️ 标记 Issue'
      }[action] || '未知操作'}`
    ]

    const title = issue.title
      ? `🏷️ 标题：${issue.title}`
      : (action === 'deleted' ? '🗑️ 已删除 Issue' : '🏷️ 无标题')
    baseLines.push(title)

    switch (action) {
      case 'opened':
        issue.body && baseLines.push(`📄 内容：${helper.truncate(issue.body, 100)}`)
        break
      case 'assigned':
        baseLines.push(`👥 负责人：${payload.assignee?.login || '未知用户'}`)
        break
      case 'labeled':
        baseLines.push(`🔖 标签：${payload.label?.name || '未知标签'}`)
        break
      case 'deleted':
        baseLines.push(`🚨 该 Issue 已被永久删除`)
        break
    }

    baseLines.push(
      `👤 操作者：${sender}`,
      helper.formatLink('查看详情', issue.html_url || repository.html_url)
    )

    return baseLines.filter(line => line?.trim()).join('\n')
  },

  issue_comment: (payload) => {
    const { comment, issue } = payload
    // 判断是 PR 评论还是 Issue 评论
    const isPR = !!issue.pull_request
    const type = isPR ? 'Pull Request' : 'Issue'
    return [
      helper.repoHeader(payload.repository),
      helper.formatItem('💬', '新评论', `${type} #${issue.number}`),
      helper.formatItem('📝', '评论内容', helper.truncate(comment.body, 100)),
      helper.formatItem('👤', '评论者', comment.user?.login),
      helper.formatLink('查看详情', comment.html_url)
    ].filter(Boolean).join('\n')
  },

  pull_request: (payload) => {
    const { action, pull_request: pr } = payload
    const actionMap = {
      opened: ['🔄 新建 PR', `标题：${pr.title}`],
      closed: [`✅ ${pr.merged ? '合并' : '关闭'} PR`],
      reopened: ['🔄 重新开启 PR'],
      review_requested: ['👥 请求审核', `审核者：${payload.requested_reviewer?.login || '未知用户'}`],
      ready_for_review: ['📢 PR 准备就绪'],
      synchronize: ['🔄 代码更新'],
      edited: ['✏️ 内容修改']
    }

    const contentLines = [
      helper.repoHeader(payload.repository),
      ...(actionMap[action] || []).map(text =>
        text.startsWith('✅') || text.startsWith('🔄')
          ? `📌 事件状态：${text}`
          : `📢 事件操作：${text}`
      ),
      `📝 PR 标题：${pr.title}`,
      `👤 操作者：${payload.sender?.login || '未知用户'}`,
      helper.formatLink('查看详情', pr.html_url)
    ]

    return contentLines.filter(line => line?.trim()).join('\n')
  },

  release: (payload) => {
    const { release } = payload
    return [
      helper.repoHeader(payload.repository),
      helper.formatItem('🏷️', '版本事件', {
        published: '🎉 发布新版本',
        edited: '✏️ 更新版本',
        deleted: '🗑️ 删除版本'
      }[payload.action]),
      helper.formatItem('🏷️', '版本号', release.tag_name?.toString() || '未知版本'),
      helper.formatItem('👤', '发布者', release.author?.login),
      helper.formatLink('查看详情', release.html_url)
    ].filter(Boolean).join('\n')
  },

  fork: (payload) => [
    helper.repoHeader(payload.repository),
    helper.formatItem('⑂', '仓库 Fork', '新分支仓库被创建'),
    helper.formatItem('👤', '操作者', payload.sender?.login),
    helper.formatItem('📦', '新仓库', payload.forkee.full_name),
    helper.formatLink('查看 Fork', payload.forkee.html_url)
  ].filter(Boolean).join('\n'),

  watch: (payload) => [
    helper.repoHeader(payload.repository),
    helper.formatItem('👀', 'Watch 事件', payload.action === 'started' ? '开始关注' : '取消关注'),
    helper.formatItem('👤', '操作者', payload.sender?.login),
    helper.formatLink('查看仓库', payload.repository.html_url)
  ].filter(Boolean).join('\n'),
}

/**
 * 主消息构建函数
 */
export function buildMsgChain(ctx: Context, payload_event: string, payload: any): (Element | null)[] {
  try {
    const handler = eventHandlers[payload_event]
    if (!handler) {
      return []
    }
    const content = handler(payload)
    return content ? [h('message', content)] : []
  } catch (error) {
    ctx?.logger('github-webhooks').warn('消息生成失败:', error)
    return []
  }
}

import { PluginConfig } from '.'
import crypto from 'crypto'
import { Context, Element, h } from 'koishi'

/** 从 URL 中提取 GitHub 仓库路径信息 */
export function getGithubRegURL(url: string): string {
    const regex = /(?<=https:\/\/github\.com).*/
    const res = url.match(regex)
    return res ? res[0] : ''
}

/** 根据订阅项发送消息 */
export function sendEventMessage(ctx: Context, subscriptions: any[], msgElement: Element[]) {
    if (!msgElement.length) return
    ctx.bots.forEach(bot => {
        subscriptions.forEach(sub => {
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

// ===================== 辅助工具 =====================
const helper = {
    repoHeader: (repo: any): string =>
        `📦 仓库：${repo?.full_name || '未知仓库'}`,

    formatItem: (emoji: string, label: string, value?: string): string => {
        return value?.trim() ? `${emoji} ${label}：${value}` : ''
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

// ===================== 事件处理器 =====================
const eventHandlers: Record<string, (payload: any) => string> = {
    star: (payload) => {
        const { action, repository, sender } = payload
        return [
            helper.repoHeader(repository),
            helper.formatItem('⭐', 'Star 事件', action === 'created' ? '新增' : '取消'),
            helper.formatItem('👤', '操作用户', sender?.login || '未知'),
            helper.formatItem('✨', '当前星数', payload.repository.stargazers_count ?? '0'),
            helper.formatLink('查看仓库', repository.html_url)
        ].join('\n')
    },

    push: (payload) => {
        const branch = payload.ref.split('/').pop()
        return [
            helper.repoHeader(payload.repository),
            helper.formatItem('🚀', '代码推送', `分支 ${branch}`),
            helper.formatItem('👤', '提交者', payload.pusher?.name || '未知'),
            helper.formatCommits(payload.commits),
            helper.formatLink('查看变更', payload.compare)
        ].join('\n')
    },

    workflow_run: (payload) => {
        if (payload.action !== 'completed') return ''
        const workflow = payload.workflow_run
        const status = workflow.conclusion === 'success' ? '✅ 成功' : '❌ 失败'
        return [
            helper.repoHeader(payload.repository),
            helper.formatItem('⚙️', '工作流状态', status),
            helper.formatItem('📛', '工作流名称', workflow.name),
            helper.formatItem('⏱️', '运行时长', `${Math.round(workflow.duration / 60)}秒`),
            helper.formatLink('查看详情', workflow.html_url)
        ].join('\n')
    },

    issues: (payload) => {
        const { action, repository } = payload
        const issue = payload.issue || {}
        const sender = payload.sender?.login || '未知用户'

        // 基础信息行
        const baseLines = [
            helper.repoHeader(repository),
            `📌 事件类型：${{
                opened: '📝 新建 Issue',
                closed: '🔒 关闭 Issue',
                reopened: '🔓 重新开启 Issue',
                deleted: '🗑️ 删除 Issue', // 新增删除事件类型
                assigned: '👤 指派 Issue',
                labeled: '🏷️ 标记 Issue'
            }[action] || '未知操作'}`
        ]

        // 标题处理（兼容已删除的 Issue）
        const title = issue.title
            ? `🏷️ 标题：${issue.title}`
            : (action === 'deleted' ? '🗑️ 已删除 Issue' : '🏷️ 无标题')
        baseLines.push(title)

        // 附加信息处理
        switch (action) {
            case 'opened':
                issue.body && baseLines.push(`📄 内容：${helper.truncate(issue.body, 100)}`)
                break
            case 'assigned':
                baseLines.push(`👥 负责人：${payload.assignee?.login || '未知'}`)
                break
            case 'labeled':
                baseLines.push(`🔖 标签：${payload.label?.name || '未知'}`)
                break
            case 'deleted': // 处理删除事件
                baseLines.push(`🚨 该 Issue 已被永久删除`)
                break
        }

        // 公共信息
        baseLines.push(
            `👤 操作者：${sender}`,
            helper.formatLink('查看详情', issue.html_url || repository.html_url) // 兼容已删除的链接
        )

        // 严格过滤空值
        return baseLines.filter(line => line?.trim()).join('\n')
    },

    pull_request: (payload) => {
        const { action, pull_request: pr } = payload
        const actionMap = {
            opened: ['🔄 新建 PR', `标题：${pr.title}`],
            closed: [`✅ ${pr.merged ? '合并' : '关闭'} PR`],
            reopened: ['🔄 重新开启 PR'],
            review_requested: ['👥 请求审核', `审核者：${payload.requested_reviewer?.login || '未知'}`],
            ready_for_review: ['📢 PR 准备就绪'],
            synchronize: ['🔄 代码更新'],
            edited: ['✏️ 内容修改']
        }

        const contentLines = [
            helper.repoHeader(payload.repository),
            ...(actionMap[action] || []).map((text: string) =>
                text.startsWith('✅') || text.startsWith('🔄')
                    ? `📌 事件状态：${text}`
                    : `📢 事件操作：${text}`
            ),
            `📝 PR 标题：${pr.title}`,
            `👤 操作者：${payload.sender?.login || '未知'}`,
            helper.formatLink('查看详情', pr.html_url)
        ]

        return contentLines.filter(line => line?.trim()).join('\n')
    },

    release: (payload) => {
        const { release } = payload
        const actionMap = {
            published: '🎉 发布新版本',
            edited: '✏️ 更新版本',
            deleted: '🗑️ 删除版本'
        }
        return [
            helper.repoHeader(payload.repository),
            helper.formatItem('🏷️', '版本事件', actionMap[payload.action]),
            helper.formatItem('🏷️', '版本号', release.tag_name),
            helper.formatItem('👤', '发布者', release.author?.login ?? '未知'),
            helper.formatLink('查看详情', release.html_url)
        ].join('\n')
    },

    issue_comment: (payload) => {
        const { comment, issue } = payload
        return [
            helper.repoHeader(payload.repository),
            helper.formatItem('💬', '新评论', `Issue #${issue.number}`),
            helper.formatItem('📝', '评论内容', helper.truncate(comment.body, 100)),
            helper.formatItem('👤', '评论者', comment.user?.login || '未知'),
            helper.formatLink('查看详情', comment.html_url)
        ].join('\n') // 关键修复：改用换行符连接
    },

    fork: (payload) => [
        helper.repoHeader(payload.repository),
        helper.formatItem('⑂', '仓库 Fork', '新分支仓库被创建'),
        helper.formatItem('👤', '操作者', payload.sender?.login || '未知'),
        helper.formatItem('📦', '新仓库', payload.forkee.full_name),
        helper.formatLink('查看 Fork', payload.forkee.html_url)
    ].join('\n'),

    watch: (payload) => [
        helper.repoHeader(payload.repository),
        helper.formatItem('👀', 'Watch 事件',
            payload.action === 'started' ? '开始关注' : '取消关注'),
        helper.formatItem('👤', '操作者', payload.sender?.login || '未知'),
        helper.formatLink('查看仓库', payload.repository.html_url)
    ].join('\n')
}


// 主消息构建函数
export function buildMsgChain(ctx: Context, event: string, payload: any, config: PluginConfig): Element[] {
    try {
        const handler = eventHandlers[event]
        if (!handler) {
            return config.enableUnknownEvent
                ? [h('message', [helper.repoHeader(payload.repository), `📢 未知事件类型：${event}`
                ].filter(Boolean).join('\n'))]
                : []
        }
        if (!config.enableWatch && event.toLowerCase() == 'watch') {
            return;
        }
        const content = handler(payload)
        return content ? [h('message', content)] : []
    } catch (error) {
        ctx?.logger('github-webhooks').warn('消息生成失败:', error)
        return;
    }
}
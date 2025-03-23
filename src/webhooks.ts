import crypto from 'crypto'
import { } from '@koishijs/plugin-server'
import { Context } from 'koishi'
import { PluginConfig } from '.'
import { sendEventMessage, buildMsgChain } from './utils'
import { Subscribers, TABLES_SUBSCRIBERS } from './database'

export function setupWebhookServer(ctx: Context, config: PluginConfig) {
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
        let subscriptions = await ctx.database.get(TABLES_SUBSCRIBERS, { repo: repoFullName }) as Subscribers[]
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
        const msgChain = buildMsgChain(ctx, event, payload, config)
        // 如果消息链为空，则不推送
        if (msgChain.length) {
            sendEventMessage(ctx, subscriptions, msgChain)
        }
        res.status = 200
        res.body = 'Webhook received'
    })
}

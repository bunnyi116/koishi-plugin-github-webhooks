import crypto from 'crypto'
import { } from '@koishijs/plugin-server'
import { Context } from 'koishi'
import { PluginConfig } from '.'
import { sendEventMessage, buildMsgChain } from './utils'
import { Subscribers, TABLES_SUBSCRIBERS } from './database'

export function setupWebhookServer(ctx: Context, config: PluginConfig) {
    ctx.server.post(config.path, async (res) => {
        const payload = res.request.body
        const payload_event = res.headers['x-github-event'] as string
        const payload_repoFullName = payload.repository?.full_name

        // 检查是否有仓库名称
        if (!payload_repoFullName) {
            res.status = 400
            res.body = 'Bad Request: repository info missing'
            return
        }

        // 校验仓库推送事件
        const config_repo = config.repositories.find(item => item.repo === payload_repoFullName)
        if (config_repo) {
            // 如果配置了仓库 secret，则需要校验签名
            const signature = res.headers['x-hub-signature-256'] as string
            const hmac = crypto.createHmac('sha256', config_repo.secret)
            const digest = 'sha256=' + hmac.update(JSON.stringify(payload)).digest('hex')
            if (signature !== digest) {
                res.status = 403
                res.body = 'Forbidden'
                return
            }
        } else if (!config.allowUnknownRepositoryPush) {
            // 如果没有找到对应仓库的配置项，并且不允许未知仓库推送，则直接返回
            res.status = 403
            res.body = 'Forbidden: Unknown repository'
            return
        }

        // 查询当前仓库的所有订阅项，并根据用户自定义的事件类型进行过滤
        let subscriptions = await ctx.database.get(TABLES_SUBSCRIBERS, { repo: payload_repoFullName }) as Subscribers[]
        subscriptions = subscriptions.filter(sub => {
            if (!sub.events || sub.events === 'all') return true
            const allowedEvents = sub.events.split(',').map(e => e.trim())
            if (allowedEvents.includes(payload_event)) {
                return true
            } else {
                // 如果配置了未知事件推送，则允许未知事件
                return config_repo.enableUnknownEvent
            }
        })
        
        if (!subscriptions.length) {
            res.status = 200
            res.body = 'No subscription for this repository or event not subscribed'
            return
        }

        if (config_repo) {
            // 如果配置了仓库, 先过滤掉配置中未启用的事件
            if (!config_repo.enableWatch && payload_event === 'watch') {
                res.status = 200
                res.body = 'Watch event not enabled for this repository'
                return
            }
        }

        // 构造消息链，并通知对应订阅者
        const msgChain = buildMsgChain(ctx, payload_event, payload, config_repo)

        // 如果消息链为空，则不推送
        if (msgChain.length) {
            sendEventMessage(ctx, subscriptions, msgChain)
        }
        res.status = 200
        res.body = 'Webhook received'
    })
}

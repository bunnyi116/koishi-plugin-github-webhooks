import { Context } from 'koishi'

export const TABLES_SUBSCRIBERS = 'github_webhooks_subscriptions_v2';

export interface Subscribers {
  platform: string
  type: string
  target: string
  repo: string
  events: string
  selfId: string
  channelId: string
}

declare module 'koishi' {
  interface Tables {
    github_webhooks_subscriptions_v2: Subscribers
  }
}

export function applyDatabase(ctx: Context) {
  ctx.model.extend(TABLES_SUBSCRIBERS, {
    platform: { type: 'string', length: 50 },
    type: { type: 'string', length: 50 },
    target: { type: 'string', length: 150 },
    repo: { type: 'string', length: 150 },
    events: 'string',
    selfId: { type: 'string', length: 150 },
    channelId: { type: 'string', length: 150 },
  }, {
    primary: ['platform', 'type', 'target', 'repo'],
  })
}

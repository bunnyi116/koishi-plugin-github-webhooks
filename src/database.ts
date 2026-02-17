import { Context } from 'koishi'

export const TABLES_SUBSCRIBERS = 'github_subscribers';

export interface Subscribers {
  platform: string
  type: string
  target: string
  repo: string
  events: string
}

declare module 'koishi' {
  interface Tables {
    github_subscribers: Subscribers
  }
}

export function applyDatabase(ctx: Context) {
  ctx.model.extend(TABLES_SUBSCRIBERS, {
    platform: { type: 'string', length: 50 },
    type: { type: 'string', length: 50 },
    target: { type: 'string', length: 150 },
    repo: { type: 'string', length: 150 },
    events: 'string',
  }, {
    primary: ['platform', 'type', 'target', 'repo'],
  })
}
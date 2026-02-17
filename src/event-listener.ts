import { Context } from 'koishi'
import { PluginConfig } from '.'
import { sendEventMessage, buildMsgChain } from './utils'
import { Subscribers, TABLES_SUBSCRIBERS } from './database'
import { Logger } from './logger'

/**
 * 设置事件监听器，监听 adapter-github 派发的事件
 */
export function setupEventListeners(ctx: Context, config: PluginConfig, logger: Logger) {
  // 监听所有 GitHub 事件
  (ctx as any).on('github/event', async (eventData: any) => {
    const { owner, repo, type, payload, botId } = eventData;
    const repoFullName = `${owner}/${repo}`;

    logger.debug(`收到事件: ${type} from ${repoFullName}, botId: ${botId}`);

    // 只处理指定 bot 的事件
    if (botId !== config.botId) {
      logger.debug(`Bot ID 不匹配 (期望: ${config.botId}, 实际: ${botId})，跳过事件处理`);
      return;
    }

    logger.debug(`Bot ID 匹配，开始处理事件`);

    // 查询当前仓库的所有订阅项
    let subscriptions = await ctx.database.get(TABLES_SUBSCRIBERS, { repo: repoFullName }) as Subscribers[];
    logger.debug(`查询到 ${subscriptions.length} 个订阅`);

    if (subscriptions.length === 0) {
      logger.debug(`仓库 ${repoFullName} 没有任何订阅`);
      return;
    }

    // 将 GitHub 事件类型转换为 webhook 事件名称
    const eventName = convertEventTypeToWebhookName(type);
    logger.debug(`事件类型转换: ${type} -> ${eventName}`);

    // 根据用户自定义的事件类型进行过滤
    const filteredSubscriptions = subscriptions.filter(sub => {
      if (!sub.events || sub.events === 'all') {
        logger.debug(`订阅 ${sub.target} 订阅了全部事件`);
        return true;
      }
      const allowedEvents = sub.events.split(',').map(e => e.trim());
      const matched = allowedEvents.includes(eventName);
      logger.debug(`订阅 ${sub.target} 的事件列表: ${sub.events}, 是否匹配: ${matched}`);
      return matched;
    });

    logger.debug(`过滤后剩余 ${filteredSubscriptions.length} 个订阅`);

    if (!filteredSubscriptions.length) {
      logger.debug(`没有订阅匹配事件 ${eventName}`);
      return;
    }

    // 构造 webhook 格式的 payload 用于消息构建
    const webhookPayload = convertEventDataToWebhookPayload(eventData);
    logger.debug(`构造的 webhook payload`);

    // 构造消息链
    const msgChain = buildMsgChain(ctx, eventName, webhookPayload);
    logger.debug(`构造的消息链长度: ${msgChain?.length || 0}`);

    // 如果消息链为空，则不推送
    if (msgChain && msgChain.length) {
      logger.debug(`推送事件 ${eventName} 到 ${filteredSubscriptions.length} 个订阅 (仓库: ${repoFullName})`);
      sendEventMessage(ctx, filteredSubscriptions, msgChain, logger);
    } else {
      logger.debug(`消息链为空，跳过发送`);
    }
  });
}

/**
 * 将 GitHub Events API 的事件类型转换为 Webhook 事件名称
 */
function convertEventTypeToWebhookName(eventType: string): string {
  const mapping: Record<string, string> = {
    'IssuesEvent': 'issues',
    'IssueCommentEvent': 'issue_comment',
    'PullRequestEvent': 'pull_request',
    'PullRequestReviewCommentEvent': 'pull_request_review_comment',
    'DiscussionEvent': 'discussion',
    'DiscussionCommentEvent': 'discussion_comment',
    'WorkflowRunEvent': 'workflow_run',
    'WorkflowJobEvent': 'workflow_job',
    'WatchEvent': 'watch',
    'ForkEvent': 'fork',
    'PushEvent': 'push',
    'ReleaseEvent': 'release',
  };
  return mapping[eventType] || eventType.toLowerCase();
}

/**
 * 将 adapter-github 的事件数据转换为 webhook payload 格式
 */
function convertEventDataToWebhookPayload(eventData: any): any {
  const { owner, repo, payload, actor, type } = eventData;

  // 构造基础的 repository 对象
  const repository = {
    full_name: `${owner}/${repo}`,
    name: repo,
    owner: {
      login: owner,
    },
    html_url: `https://github.com/${owner}/${repo}`,
    stargazers_count: 0,
  };

  // 构造 sender 对象
  const sender = actor ? {
    login: actor.login,
    avatar_url: actor.avatar_url,
  } : null;

  // 根据事件类型构造不同的 payload
  const webhookPayload: any = {
    repository,
    sender,
    action: payload.action,
  };

  // 根据事件类型添加特定字段
  switch (type) {
    case 'IssuesEvent':
      webhookPayload.issue = payload.issue;
      break;
    case 'IssueCommentEvent':
      webhookPayload.issue = payload.issue;
      webhookPayload.comment = payload.comment;
      break;
    case 'PullRequestEvent':
      webhookPayload.pull_request = payload.pull_request;
      break;
    case 'PullRequestReviewCommentEvent':
      webhookPayload.pull_request = payload.pull_request;
      webhookPayload.comment = payload.comment;
      break;
    case 'DiscussionEvent':
      webhookPayload.discussion = payload.discussion;
      break;
    case 'DiscussionCommentEvent':
      webhookPayload.discussion = payload.discussion;
      webhookPayload.comment = payload.comment;
      break;
    case 'WorkflowRunEvent':
      webhookPayload.workflow_run = payload.workflow_run;
      webhookPayload.workflow = payload.workflow;
      break;
    case 'WorkflowJobEvent':
      webhookPayload.workflow_job = payload.workflow_job;
      break;
    case 'ForkEvent':
      webhookPayload.forkee = payload.forkee;
      break;
    case 'PushEvent':
      webhookPayload.ref = payload.ref;
      webhookPayload.before = payload.before;
      webhookPayload.after = payload.after;
      webhookPayload.commits = payload.commits;
      webhookPayload.head_commit = payload.headCommit;
      webhookPayload.pusher = actor;
      // 构造 compare URL
      webhookPayload.compare = `https://github.com/${owner}/${repo}/compare/${payload.before?.slice(0, 7)}...${payload.after?.slice(0, 7)}`;
      break;
    case 'ReleaseEvent':
      webhookPayload.release = payload.release;
      break;
    case 'WatchEvent':
      webhookPayload.action = payload.action || 'started';
      break;
  }

  return webhookPayload;
}

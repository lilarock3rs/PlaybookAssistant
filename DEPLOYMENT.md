# Deployment Guide

This guide covers deploying the Playbook AI Assistant to Vercel.

## Prerequisites

- Vercel account
- GitHub repository (optional but recommended)
- All required API keys and credentials

## Step 1: Prepare for Deployment

1. **Environment Variables**: Ensure all environment variables are documented in `.env.example`
2. **Dependencies**: Verify all dependencies are in `package.json`
3. **TypeScript**: Ensure code compiles without errors:
   ```bash
   npm run typecheck
   ```

## Step 2: Deploy to Vercel

### Option A: Deploy from Git Repository

1. Connect your repository to Vercel:
   ```bash
   vercel --prod
   ```

2. Or use the Vercel dashboard to import your repository

### Option B: Deploy Directly

1. Deploy from local directory:
   ```bash
   vercel --prod
   ```

## Step 3: Configure Environment Variables

In the Vercel dashboard, set these environment variables:

### Required Variables
```
SLACK_BOT_TOKEN=xoxb-your-production-bot-token
SLACK_SIGNING_SECRET=your-production-signing-secret
GOOGLE_API_KEY=your-google-api-key
CLICKUP_API_KEY=your-clickup-api-key
DATABASE_URL=postgresql://user:pass@host:port/db?ssl=true
NODE_ENV=production
```

### Optional Variables
```
CLICKUP_TEAM_ID=your-team-id
CLICKUP_SPACE_ID=your-space-id
LOG_LEVEL=info
```

## Step 4: Set Up Database

1. **Create Postgres Database** (if not using Vercel Postgres):
   - Ensure pgvector extension is available
   - Configure SSL connection

2. **Initialize Database Schema**:
   ```bash
   curl -X POST https://your-domain.vercel.app/api/db/init
   ```

## Step 5: Configure Slack App

Update your Slack App configuration with production endpoints:

### Slash Commands
- `/playbook-search`: `https://your-domain.vercel.app/api/slack/commands`
- `/playbook-category`: `https://your-domain.vercel.app/api/slack/commands`
- `/playbook-sync`: `https://your-domain.vercel.app/api/slack/commands`
- `/playbook-help`: `https://your-domain.vercel.app/api/slack/commands`

### Event Subscriptions
- Request URL: `https://your-domain.vercel.app/api/slack/events`
- Events:
  - `app_mention`
  - `message.channels`
  - `message.groups`
  - `message.im`
  - `message.mpim`

### Interactivity & Shortcuts
- Request URL: `https://your-domain.vercel.app/api/slack/interactive`

## Step 6: Configure ClickUp Webhooks (Optional)

For real-time synchronization:

1. Go to ClickUp Settings > Integrations > Webhooks
2. Add webhook endpoint: `https://your-domain.vercel.app/api/clickup/webhook`
3. Select events:
   - Task Created
   - Task Updated
   - Task Deleted
   - Task Moved

## Step 7: Initial Data Sync

Perform initial sync of playbooks:

```bash
curl -X POST https://your-domain.vercel.app/api/clickup/sync \
  -H "Content-Type: application/json" \
  -d '{"force_sync": true, "limit": 100}'
```

## Step 8: Verify Deployment

1. **Health Check**: Verify all endpoints are responding
2. **Test Slack Commands**: Try commands in your Slack workspace
3. **Check Logs**: Monitor Vercel function logs for errors
4. **Test Search**: Perform test searches to verify AI functionality

## Monitoring and Maintenance

### Check System Status
```bash
curl https://your-domain.vercel.app/api/clickup/status
curl https://your-domain.vercel.app/api/db/analytics
```

### Log Monitoring
- Use Vercel dashboard to monitor function logs
- Set up error alerting for critical failures
- Monitor API usage and rate limits

### Regular Maintenance
- Monitor sync logs for failures
- Check embedding coverage percentage
- Update AI models as needed
- Monitor database performance

## Troubleshooting

### Common Issues

1. **Database Connection Errors**:
   - Verify DATABASE_URL is correct
   - Ensure SSL is properly configured
   - Check pgvector extension is installed

2. **Slack Verification Failures**:
   - Verify SLACK_SIGNING_SECRET matches app configuration
   - Check request URL configuration in Slack app

3. **AI Service Errors**:
   - Verify GOOGLE_API_KEY has proper permissions
   - Check API quotas and rate limits
   - Monitor embedding generation success rate

4. **ClickUp Sync Issues**:
   - Verify CLICKUP_API_KEY is valid
   - Check team/space permissions
   - Monitor webhook delivery (if enabled)

### Performance Optimization

1. **Caching**: Monitor cache hit rates and adjust TTL
2. **Rate Limiting**: Tune rate limits based on usage patterns
3. **Database**: Optimize vector search queries
4. **Function Duration**: Monitor and optimize cold start times

## Security Considerations

1. **Environment Variables**: Never commit secrets to repository
2. **API Access**: Implement proper authentication for admin endpoints
3. **Rate Limiting**: Prevent abuse with appropriate limits
4. **Input Validation**: Ensure all inputs are properly validated
5. **Logging**: Avoid logging sensitive information

## Scaling Considerations

1. **Database**: Monitor query performance and consider read replicas
2. **Embeddings**: Consider batch processing for large syncs
3. **Caching**: Implement Redis for distributed caching if needed
4. **Rate Limits**: Adjust based on team size and usage patterns

## Backup and Recovery

1. **Database Backups**: Set up automated database backups
2. **Configuration**: Document all configuration changes
3. **Monitoring**: Set up alerts for system health issues
4. **Recovery Procedures**: Document recovery steps for common failures
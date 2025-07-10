# Playbook AI Assistant

An AI-powered Slack bot that recommends relevant playbooks from ClickUp using semantic search and Google Gemini embeddings.

## Features

- **Semantic Search**: Find playbooks using natural language queries
- **AI-Powered Recommendations**: Get personalized suggestions based on context
- **Real-time Sync**: Automatically sync playbooks from ClickUp
- **Slack Integration**: Native slash commands and interactive responses
- **Vector Search**: Fast similarity matching using pgvector
- **Category Browsing**: Explore playbooks by automatically categorized topics

## Architecture

- **Backend**: Vercel Functions (Node.js/TypeScript)
- **AI**: Google Gemini API for embeddings and recommendations
- **Database**: Vercel Postgres with pgvector for vector search
- **Integrations**: Slack Bolt SDK, ClickUp API
- **Deployment**: Vercel with environment variables

## Quick Start

### Prerequisites

- Node.js 18+
- Vercel account
- Slack App with bot token and signing secret
- ClickUp API key
- Google Gemini API key
- Postgres database with pgvector extension

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd playbook-ai-assistant
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

4. Configure environment variables in `.env`:
   ```bash
   SLACK_BOT_TOKEN=xoxb-your-slack-bot-token
   SLACK_SIGNING_SECRET=your-slack-signing-secret
   GOOGLE_API_KEY=your-google-api-key
   CLICKUP_API_KEY=your-clickup-api-key
   DATABASE_URL=postgresql://username:password@host:port/database
   NODE_ENV=development
   ```

5. Initialize the database:
   ```bash
   curl -X POST http://localhost:3000/api/db/init
   ```

6. Start development server:
   ```bash
   npm run dev
   ```

### Deployment

1. Deploy to Vercel:
   ```bash
   vercel --prod
   ```

2. Set up environment variables in Vercel dashboard

3. Configure Slack App endpoints:
   - Slash Commands: `https://your-domain.vercel.app/api/slack/commands`
   - Events: `https://your-domain.vercel.app/api/slack/events`
   - Interactivity: `https://your-domain.vercel.app/api/slack/interactive`

4. Set up ClickUp webhook (optional):
   - Endpoint: `https://your-domain.vercel.app/api/clickup/webhook`

## Slack Commands

- `/playbook-search [query]` - Search for relevant playbooks
- `/playbook-category [category]` - Browse playbooks by category
- `/playbook-sync` - Synchronize playbooks from ClickUp (admin only)
- `/playbook-help` - Show help information

## API Endpoints

### ClickUp Integration
- `POST /api/clickup/sync` - Sync playbooks from ClickUp
- `POST /api/clickup/webhook` - Handle ClickUp webhooks
- `GET /api/clickup/status` - Get sync status

### AI Operations
- `POST /api/ai/search` - Semantic search for playbooks
- `POST /api/ai/embedding` - Generate text embeddings
- `POST /api/ai/recommendations` - Get AI-powered recommendations

### Database Operations
- `POST /api/db/init` - Initialize database schema
- `GET /api/db/playbooks` - Get playbooks
- `POST /api/db/search` - Vector search in database
- `GET /api/db/analytics` - Get system analytics

### Slack Integration
- `POST /api/slack/commands` - Handle slash commands
- `POST /api/slack/events` - Handle Slack events
- `POST /api/slack/interactive` - Handle interactive components

## Configuration

### Slack App Setup

1. Create a new Slack App at https://api.slack.com/apps
2. Configure Bot Token Scopes:
   - `commands`
   - `chat:write`
   - `chat:write.public`
   - `im:write`
   - `app_mentions:read`
   - `channels:history`
   - `groups:history`
   - `im:history`
   - `mpim:history`

3. Create Slash Commands:
   - `/playbook-search`
   - `/playbook-category`
   - `/playbook-sync`
   - `/playbook-help`

4. Enable Events:
   - `app_mention`
   - `message.channels`
   - `message.groups`
   - `message.im`
   - `message.mpim`

5. Enable Interactivity for buttons and modals

### ClickUp Setup

1. Get your API key from ClickUp Settings > Apps
2. Optionally set up webhooks for real-time sync
3. Configure team/space IDs for specific synchronization

### Google Gemini Setup

1. Get API key from Google AI Studio
2. Enable Gemini API for your project
3. Configure usage limits and quotas

## Development

### Project Structure

```
playbook-ai-assistant/
├── api/                    # Vercel Functions
│   ├── slack/             # Slack endpoints
│   ├── clickup/           # ClickUp synchronization
│   ├── ai/                # AI logic with Gemini
│   └── db/                # Database operations
├── lib/                   # Configured clients
├── utils/                 # Utilities
├── config/                # Configuration
└── types/                 # TypeScript types
```

### Key Features

- **Rate Limiting**: Prevents API abuse with configurable limits
- **Caching**: Improves performance with in-memory caching
- **Logging**: Structured logging for debugging and monitoring
- **Error Handling**: Comprehensive error handling with user-friendly messages
- **Validation**: Input validation using Zod schemas
- **Vector Search**: Efficient similarity search using pgvector

### Testing

Run type checking:
```bash
npm run typecheck
```

Run linting:
```bash
npm run lint
```

## Monitoring

- Check sync status: `GET /api/clickup/status`
- View analytics: `GET /api/db/analytics`
- Monitor logs in Vercel dashboard
- Set up alerts for failed syncs or API errors

## Troubleshooting

### Common Issues

1. **Database Connection**: Ensure DATABASE_URL is correct and includes SSL parameters
2. **Slack Verification**: Check SLACK_SIGNING_SECRET matches your app configuration
3. **API Rate Limits**: Monitor usage and adjust rate limiting configuration
4. **Embedding Failures**: Verify GOOGLE_API_KEY has proper permissions

### Support

- Check application logs in Vercel dashboard
- Verify environment variables are set correctly
- Test API endpoints individually
- Check Slack App configuration and permissions

## License

MIT License - see LICENSE file for details
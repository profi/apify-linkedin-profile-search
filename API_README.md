# LinkedIn Scraper API Documentation

This API layer wraps the existing LinkedIn profile scraper to enable programmatic access via HTTP endpoints.

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Ensure Environment Variables

Make sure you have the required environment variables set in your `.env` file:

```env
HARVESTAPI_TOKEN=your_harvest_api_token_here
HARVESTAPI_URL=https://api.harvest-api.com
```

### 3. Start the API Server

```bash
npm run start:api
```

The server will start on `http://localhost:3001` by default.

## API Endpoints

### POST /scrape/company

Initiates a LinkedIn company profile scraping job. Returns immediately with a job ID while the scraper runs asynchronously in the background.

**URL:** `POST http://localhost:3001/scrape/company`

**Request Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "source": "linkedin_company",
  "companyUrls": [
    "https://www.linkedin.com/company/sopro-social-prospecting"
  ],
  "keywords": "",
  "role": "",
  "maxResults": 1,
  "persistToListBuild": true,
  "webhookUrl": "https://my-api.com/receiver-endpoint"
}
```

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `source` | string | No | Source identifier (informational only) |
| `companyUrls` | array | **Yes** | Array of LinkedIn company URLs to scrape profiles from |
| `keywords` | string | No | Keywords to filter profiles (maps to `searchQuery`) |
| `role` | string | No | Job title/role to filter profiles (maps to `currentJobTitles`) |
| `maxResults` | number | No | Maximum number of results to return (default: 1000000) |
| `persistToListBuild` | boolean | No | Not currently used (accepted for compatibility) |
| `webhookUrl` | string | **Yes** | HTTP(S) URL to POST results to when scraping completes |

**Response (202 Accepted):**
```json
{
  "status": "started",
  "jobId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Error Response (400 Bad Request):**
```json
{
  "status": "error",
  "message": "Missing or invalid required field: companyUrls (must be a non-empty array)"
}
```

**Error Response (500 Internal Server Error):**
```json
{
  "status": "error",
  "message": "Internal server error",
  "details": "Error details here"
}
```

### GET /health

Health check endpoint to verify the server is running.

**URL:** `GET http://localhost:3001/health`

**Response (200 OK):**
```json
{
  "status": "healthy",
  "timestamp": "2025-12-05T20:44:00.000Z",
  "uptime": 123.456
}
```

## Webhook Callbacks

When a scraping job completes (either successfully or with an error), the API will POST the results to the `webhookUrl` provided in the original request.

### Success Webhook

**POST to your webhookUrl:**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "results": [
    {
      "fullName": "John Doe",
      "headline": "Software Engineer at Example Corp",
      "location": "San Francisco, CA",
      "profileUrl": "https://www.linkedin.com/in/johndoe",
      ...
    }
  ]
}
```

### Error Webhook

**POST to your webhookUrl:**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "error",
  "error": "Scraper process exited with code 1. stderr: Error details..."
}
```

### Webhook Retry Logic

- The API will retry failed webhook deliveries up to **3 times**
- Retry delays use **exponential backoff**: 1s, 2s, 4s
- Non-2xx HTTP responses trigger retries
- Network errors trigger retries

## Example Usage

### Using cURL

```bash
curl -X POST http://localhost:3001/scrape/company \
  -H "Content-Type: application/json" \
  -d '{
    "source": "linkedin_company",
    "companyUrls": ["https://www.linkedin.com/company/sopro-social-prospecting"],
    "keywords": "",
    "role": "",
    "maxResults": 1,
    "persistToListBuild": true,
    "webhookUrl": "http://localhost:3000/webhook"
  }'
```

### Using JavaScript/Node.js

```javascript
const response = await fetch('http://localhost:3001/scrape/company', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    source: 'linkedin_company',
    companyUrls: ['https://www.linkedin.com/company/sopro-social-prospecting'],
    maxResults: 10,
    webhookUrl: 'https://your-api.com/webhook',
  }),
});

const result = await response.json();
console.log('Job started:', result.jobId);
```

### Using Python

```python
import requests

response = requests.post('http://localhost:3001/scrape/company', json={
    'source': 'linkedin_company',
    'companyUrls': ['https://www.linkedin.com/company/sopro-social-prospecting'],
    'maxResults': 10,
    'webhookUrl': 'https://your-api.com/webhook'
})

result = response.json()
print(f"Job started: {result['jobId']}")
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `HARVESTAPI_TOKEN` | **Yes** | - | HarvestAPI authentication token (required by scraper) |
| `HARVESTAPI_URL` | No | `https://api.harvest-api.com` | HarvestAPI base URL |
| `API_PORT` | No | `3001` | Port for the API server |
| `API_HOST` | No | `0.0.0.0` | Host for the API server |

### Scripts

- `npm run start:api` - Start the API server
- `npm run start:dev` - Run the scraper directly (original mode)
- `npm start` - Alias for `start:dev`

## Architecture

```
Client Request
    ↓
Express.js API Server (api-server.ts)
    ↓
Job Runner (src/api/job-runner.ts)
    ↓
Scraper Wrapper (src/api/scraper-wrapper.ts)
    ↓
LinkedIn Scraper (src/main.ts) [Runs as child process]
    ↓
Webhook Handler (src/api/webhook-handler.ts)
    ↓
Client's Webhook URL
```

### Data Storage

Results are saved to the local filesystem during scraping:

- **Dataset Location**: `storage/datasets/default/`
- **Format**: Individual JSON files (one per profile)
- **Persistence**: Files persist across runs unless manually deleted

> **Note**: When running locally, all scraped data goes to the `default` dataset regardless of the `profileScraperMode` setting. The mode only affects what data fields are scraped, not where it's stored.

### Key Components

1. **api-server.ts** - Express.js server handling HTTP requests
2. **src/api/job-runner.ts** - Orchestrates async scraper execution
3. **src/api/scraper-wrapper.ts** - Converts API format to Apify input format
4. **src/api/webhook-handler.ts** - Delivers results to webhook URL with retry logic
5. **src/api/types.ts** - TypeScript type definitions

## Error Handling

### Request Validation Errors (400)

- Missing or invalid `companyUrls`
- Missing or invalid `webhookUrl`
- Invalid URL format in `companyUrls` or `webhookUrl`

### Scraper Execution Errors

Errors during scraper execution are caught and sent to the webhook URL as error payloads:

- Scraper process crashes
- Scraper exits with non-zero code
- Rate limits hit
- Invalid credentials

### Webhook Delivery Errors

If webhook delivery fails after 3 retries, the error is logged but the overall job is still considered complete. Monitor logs for webhook delivery failures.

## Troubleshooting

### API server won't start

- Check that port 3001 is available
- Verify all dependencies are installed (`npm install`)
- Check for syntax errors in TypeScript files

### Scraper jobs fail immediately

- Verify `HARVESTAPI_TOKEN` environment variable is set
- Check scraper logs in console output
- Ensure the scraper works standalone: `npm run start:dev`

### Webhooks not received

- Verify `webhookUrl` is accessible from the server
- Check webhook server logs for incoming requests
- Review API server logs for webhook delivery attempts
- Ensure webhook URL uses HTTP or HTTPS protocol

### No results returned

- Check if the company URL is valid
- Verify LinkedIn Sales Navigator access
- Check rate limits in scraper output
- Review `maxResults` parameter

## Logs

All components log to stdout with prefixes for easy identification:

- `[API]` - Express.js server logs
- `[Job Runner]` - Job orchestration logs
- `[Scraper Wrapper]` - Input preparation logs
- `[Webhook]` - Webhook delivery logs
- `[Scraper <jobId>]` - Scraper process stdout
- `[Scraper <jobId> ERROR]` - Scraper process stderr

## Production Considerations

### Security

- Add authentication middleware (not included by default)
- Use HTTPS in production
- Validate and sanitize all inputs
- Rate limit API endpoints
- Restrict CORS origins

### Scalability

- Consider job queue system (Redis, Bull) for high-volume scenarios
- Add job status endpoint to query job progress
- Implement job cancellation mechanism
- Add database for job persistence
- Use process manager (PM2, systemd) for server uptime

### Monitoring

- Add structured logging (Winston, Pino)
- Implement health checks and metrics
- Set up alerting for failed jobs
- Track webhook delivery success rates

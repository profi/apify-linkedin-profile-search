/**
 * LinkedIn Scraper API Server
 * 
 * This Express.js server provides a REST API wrapper around the existing
 * LinkedIn profile scraper. It accepts HTTP requests, immediately responds
 * with a job ID, and executes scraper jobs asynchronously in the background.
 * 
 * Usage: npm run start:api
 */

import express, { Request, Response } from 'express';

// Disable SSL validation for development (allows self-signed certs)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import { randomUUID } from 'node:crypto';
import { ScrapeCompanyRequest, ScrapeJobResponse, ErrorResponse, JobConfig } from './src/api/types.js';
import { startScraperJob } from './src/api/job-runner.js';
import { readScraperResults } from './src/api/job-runner.js';
import { transformToApifyFormat } from './src/api/apify-formatter.js';
import { getProjectRoot } from './src/api/scraper-wrapper.js';

// Create Express application
const app = express();

// Configuration
const PORT = process.env.API_PORT || 3001;
const HOST = process.env.API_HOST || '0.0.0.0';

// Middleware
app.use(express.json()); // Parse JSON request bodies

// Request logging middleware
app.use((req, res, next) => {
    console.log(`\n[API] ${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

/**
 * Health check endpoint
 * 
 * GET /health
 * Returns 200 OK if the server is running
 */
app.get('/health', (req: Request, res: Response) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    });
});

/**
 * Main scraping endpoint
 * 
 * POST /scrape/company
 * 
 * Accepts scraping requests, validates input, generates a job ID,
 * and starts the scraper asynchronously in the background.
 * 
 * Returns immediately with status "started" and a unique job ID.
 */
app.post('/scrape/company', async (req: Request, res: Response) => {
    try {
        // Parse and validate request body
        const request = req.body as ScrapeCompanyRequest;

        // Validation: Check required fields
        if (!request.companyUrls || !Array.isArray(request.companyUrls) || request.companyUrls.length === 0) {
            const errorResponse: ErrorResponse = {
                status: 'error',
                message: 'Missing or invalid required field: companyUrls (must be a non-empty array)',
            };
            return res.status(400).json(errorResponse);
        }

        if (!request.webhookUrl || typeof request.webhookUrl !== 'string') {
            const errorResponse: ErrorResponse = {
                status: 'error',
                message: 'Missing or invalid required field: webhookUrl (must be a string)',
            };
            return res.status(400).json(errorResponse);
        }

        // Validate webhookUrl is a valid HTTP(S) URL
        try {
            const url = new URL(request.webhookUrl);
            if (!['http:', 'https:'].includes(url.protocol)) {
                throw new Error('Invalid protocol');
            }
        } catch (urlError) {
            const errorResponse: ErrorResponse = {
                status: 'error',
                message: 'Invalid webhookUrl: must be a valid HTTP or HTTPS URL',
                details: (urlError as Error).message,
            };
            return res.status(400).json(errorResponse);
        }

        // Validate company URLs format
        for (const url of request.companyUrls) {
            if (typeof url !== 'string' || !url.includes('linkedin.com/company/')) {
                const errorResponse: ErrorResponse = {
                    status: 'error',
                    message: `Invalid company URL: "${url}". Must be a LinkedIn company URL.`,
                };
                return res.status(400).json(errorResponse);
            }
        }

        // Generate unique job ID
        const jobId = randomUUID();

        console.log(`[API] Created new scraping job: ${jobId}`);
        console.log(`[API] Company URLs:`, request.companyUrls);
        console.log(`[API] Webhook URL: ${request.webhookUrl}`);

        // Prepare job configuration
        const jobConfig: JobConfig = {
            jobId,
            companyUrls: request.companyUrls,
            keywords: request.keywords,
            role: request.role,
            maxResults: request.maxResults || 1000000,
            webhookUrl: request.webhookUrl,
        };

        // Start the scraper job asynchronously (fire-and-forget)
        // This does NOT block the HTTP response
        startScraperJob(jobConfig);

        // Return immediate response to client
        const response: ScrapeJobResponse = {
            status: 'started',
            jobId,
        };

        console.log(`[API] Returning immediate response for job ${jobId}`);

        // Return 202 Accepted (request accepted for background processing)
        return res.status(202).json(response);

    } catch (error) {
        console.error('[API] Error processing request:', error);

        const errorResponse: ErrorResponse = {
            status: 'error',
            message: 'Internal server error',
            details: (error as Error).message,
        };

        return res.status(500).json(errorResponse);
    }
});


/**
 * Get job results
 * 
 * GET /scrape/jobs/:jobId/results
 * 
 * Returns the scraped results for a job in Apify-compatible format.
 * Note: Currently returns results from the default dataset.
 */
app.get('/scrape/jobs/:jobId/results', async (req: Request, res: Response) => {
    try {
        const jobId = req.params.jobId;
        console.log(`[API] Fetching results for job ${jobId}`);

        const projectRoot = getProjectRoot();
        const rawResults = await readScraperResults(projectRoot);
        const apifyResults = transformToApifyFormat(rawResults);

        console.log(`[API] Returning ${apifyResults.length} profile(s) for job ${jobId}`);
        res.json(apifyResults);

    } catch (error) {
        console.error(`[API] Error fetching results for job ${req.params.jobId}:`, error);
        const errorResponse: ErrorResponse = {
            status: 'error',
            message: 'Failed to retrieve results',
            details: (error as Error).message
        };
        res.status(500).json(errorResponse);
    }
});


/**
 * 404 handler for undefined routes
 */
app.use((req: Request, res: Response) => {
    const errorResponse: ErrorResponse = {
        status: 'error',
        message: `Route not found: ${req.method} ${req.path}`,
    };
    res.status(404).json(errorResponse);
});

/**
 * Global error handler
 */
app.use((error: Error, req: Request, res: Response, next: any) => {
    console.error('[API] Unhandled error:', error);

    const errorResponse: ErrorResponse = {
        status: 'error',
        message: 'Internal server error',
        details: error.message,
    };

    res.status(500).json(errorResponse);
});

/**
 * Start the server
 */
app.listen(Number(PORT), HOST, () => {
    console.log('\n========================================');
    console.log('LinkedIn Scraper API Server');
    console.log('========================================');
    console.log(`Server running at: http://${HOST}:${PORT}`);
    console.log(`Health check: http://${HOST}:${PORT}/health`);
    console.log(`Scrape endpoint: POST http://${HOST}:${PORT}/scrape/company`);
    console.log('========================================\n');
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('\n[API] SIGTERM received, shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('\n[API] SIGINT received, shutting down gracefully...');
    process.exit(0);
});

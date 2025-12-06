/**
 * Webhook Handler
 * 
 * This module handles posting scraper results to the provided webhook URL.
 * It implements retry logic with exponential backoff to ensure reliable delivery.
 */

// Disable SSL validation for development (allows self-signed certs)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import { WebhookPayload } from './types.js';

/**
 * Maximum number of retry attempts for webhook delivery
 */
const MAX_RETRIES = 3;

/**
 * Initial retry delay in milliseconds (doubles with each retry)
 */
const INITIAL_RETRY_DELAY = 1000;

/**
 * Send webhook payload to the specified URL with retry logic
 * 
 * @param webhookUrl - The URL to POST the payload to
 * @param payload - The webhook payload containing job results or error
 * @returns Promise that resolves when webhook is successfully delivered
 */
export async function sendWebhook(
    webhookUrl: string,
    payload: any
): Promise<void> {
    let lastError: Error | null = null;

    // Try sending webhook with exponential backoff
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            console.log(`[Webhook] Sending to ${webhookUrl} (attempt ${attempt}/${MAX_RETRIES})...`);
            console.log(`[Webhook] Payload:`, JSON.stringify(payload, null, 2));

            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            // Check if response is successful (2xx status code)
            if (response.ok) {
                console.log(`[Webhook] Successfully delivered to ${webhookUrl}`);
                console.log(`[Webhook] Response status: ${response.status}`);
                return;
            }

            // Non-2xx response, log and prepare to retry
            const responseText = await response.text();
            console.error(`[Webhook] Failed with status ${response.status}: ${responseText}`);
            lastError = new Error(`HTTP ${response.status}: ${responseText}`);

        } catch (error) {
            // Network error or other exception
            console.error(`[Webhook] Error on attempt ${attempt}:`, error);
            lastError = error as Error;
        }

        // If this wasn't the last attempt, wait before retrying
        if (attempt < MAX_RETRIES) {
            const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
            console.log(`[Webhook] Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    // All retries failed
    console.error(`[Webhook] Failed to deliver webhook after ${MAX_RETRIES} attempts`);
    console.error(`[Webhook] Last error:`, lastError);
    throw lastError || new Error('Webhook delivery failed');
}

/**
 * Send a successful completion webhook in Apify-compatible format
 * 
 * @param webhookUrl - The URL to POST to
 * @param jobId - The job identifier (runId)
 * @param results - The scraped results array (already in Apify format)
 */
export async function sendSuccessWebhook(
    webhookUrl: string,
    jobId: string,
    results: any[]
): Promise<void> {
    // Send webhook in Apify-compatible format
    const payload = {
        userId: 'local-scraper',
        createdAt: new Date().toISOString(),
        eventType: 'ACTOR.RUN.SUCCEEDED',
        eventData: {
            actorId: 'local-scraper',
            actorRunId: jobId
        },
        resource: {
            id: jobId,
            actId: 'local-scraper',
            userId: 'local-scraper',
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            status: 'SUCCEEDED'
        }
    };

    console.log(`[Webhook] Sending Apify-compatible success payload for job ${jobId}`);
    console.log(`[Webhook] Results count: ${results.length}`);

    await sendWebhook(webhookUrl, payload);
}

/**
 * Send an error webhook in Apify-compatible format
 * 
 * @param webhookUrl - The URL to POST to
 * @param jobId - The job identifier
 * @param error - The error message or Error object
 */
export async function sendErrorWebhook(
    webhookUrl: string,
    jobId: string,
    error: string | Error
): Promise<void> {
    const errorMessage = typeof error === 'string' ? error : error.message;

    const payload = {
        userId: 'local-scraper',
        createdAt: new Date().toISOString(),
        eventType: 'ACTOR.RUN.FAILED',
        eventData: {
            actorId: 'local-scraper',
            actorRunId: jobId
        },
        resource: {
            id: jobId,
            actId: 'local-scraper',
            userId: 'local-scraper',
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            status: 'FAILED'
        },
        error: errorMessage
    };

    await sendWebhook(webhookUrl, payload);
}

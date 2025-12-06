/**
 * API Type Definitions
 * 
 * This file contains all TypeScript interfaces and types used by the API layer.
 * These types define the structure of requests, responses, and internal data.
 */

/**
 * Request format for POST /scrape/company endpoint
 */
export interface ScrapeCompanyRequest {
    /** Source identifier (always "linkedin_company" for company scraping) */
    source: string;

    /** Array of LinkedIn company URLs to scrape profiles from */
    companyUrls: string[];

    /** Optional keywords to filter profiles */
    keywords?: string;

    /** Optional role/job title to filter profiles */
    role?: string;

    /** Maximum number of results to return (default: 1000000) */
    maxResults?: number;

    /** Whether to persist results to list build (currently not used but accepted) */
    persistToListBuild?: boolean;

    /** URL to POST results to when scraping completes */
    webhookUrl: string;
}

/**
 * Immediate response returned by POST /scrape/company endpoint
 */
export interface ScrapeJobResponse {
    /** Status of the job (immediately returns "started") */
    status: 'started';

    /** Unique identifier for this scrape job */
    jobId: string;
}

/**
 * Payload sent to webhook URL on job completion
 */
export interface WebhookPayload {
    /** Job identifier matching the original request */
    jobId: string;

    /** Final status of the job */
    status: 'completed' | 'error';

    /** Scraped results (only present when status is "completed") */
    results?: any[];

    /** Error message (only present when status is "error") */
    error?: string;
}

/**
 * Internal job configuration passed to job runner
 */
export interface JobConfig {
    /** Unique job identifier */
    jobId: string;

    /** Array of LinkedIn company URLs */
    companyUrls: string[];

    /** Optional keywords filter */
    keywords?: string;

    /** Optional role filter */
    role?: string;

    /** Maximum items to scrape */
    maxResults: number;

    /** Webhook URL for result delivery */
    webhookUrl: string;
}

/**
 * Error response format for API errors
 */
export interface ErrorResponse {
    /** Error status */
    status: 'error';

    /** Human-readable error message */
    message: string;

    /** Optional error details */
    details?: any;
}

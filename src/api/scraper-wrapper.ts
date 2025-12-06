/**
 * Scraper Wrapper
 * 
 * This module prepares the input for the existing LinkedIn scraper.
 * It converts API request parameters into the Apify input format and
 * writes the INPUT.json file that the scraper expects.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JobConfig } from './types.js';

// Get the project root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');

/**
 * Path to the INPUT.json file that the Apify scraper reads
 */
const INPUT_FILE_PATH = join(
    PROJECT_ROOT,
    'storage',
    'key_value_stores',
    'default',
    'INPUT.json'
);

/**
 * Prepare scraper input file from job configuration
 * 
 * This function converts the API request format to the Apify input format
 * and writes it to the INPUT.json file that the scraper expects to read.
 * 
 * @param jobConfig - Job configuration from API request
 */
export async function prepareScraperInput(jobConfig: JobConfig): Promise<void> {
    console.log(`[Scraper Wrapper] Preparing input for job ${jobConfig.jobId}`);

    // Map API request format to Apify input format
    const apifyInput = {
        // Map companyUrls to currentCompanies (the scraper's expected field name)
        currentCompanies: jobConfig.companyUrls,

        // Set scraper mode (using "Full" for complete profile data)
        profileScraperMode: 'Full',

        // Set maximum items to scrape
        maxItems: jobConfig.maxResults,

        // Start from page 1
        startPage: 1,

        // Add webhookUrl to pass through to the scraper's output
        webhookUrl: jobConfig.webhookUrl,

        // Add keywords if provided (optional filter)
        ...(jobConfig.keywords && { searchQuery: jobConfig.keywords }),

        // Add role/job title if provided (optional filter)
        ...(jobConfig.role && { currentJobTitles: [jobConfig.role] }),
    };

    console.log('[Scraper Wrapper] Input configuration:', JSON.stringify(apifyInput, null, 2));

    // Ensure the directory exists
    await mkdir(dirname(INPUT_FILE_PATH), { recursive: true });

    // Write the input file
    await writeFile(INPUT_FILE_PATH, JSON.stringify(apifyInput, null, 2), 'utf-8');

    console.log(`[Scraper Wrapper] Wrote input to ${INPUT_FILE_PATH}`);
}

/**
 * Get the path to the main scraper entry point
 * 
 * @returns Absolute path to main.ts
 */
export function getScraperEntryPoint(): string {
    return join(PROJECT_ROOT, 'src', 'main.ts');
}

/**
 * Get the project root directory
 * 
 * @returns Absolute path to project root
 */
export function getProjectRoot(): string {
    return PROJECT_ROOT;
}

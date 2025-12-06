/**
 * Job Runner
 * 
 * This module orchestrates the asynchronous execution of scraper jobs.
 * It spawns the scraper as a child process, monitors its execution,
 * and sends results to the webhook URL upon completion.
 */

import { spawn } from 'node:child_process';
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { JobConfig } from './types.js';
import { sendSuccessWebhook, sendErrorWebhook } from './webhook-handler.js';
import { prepareScraperInput, getScraperEntryPoint, getProjectRoot } from './scraper-wrapper.js';
import { transformToApifyFormat } from './apify-formatter.js';

/**
 * Path to the dataset where scraper stores results
 * Note: Actor.pushData() always uses the default dataset when running locally,
 * regardless of the second parameter (which is used for billing events on Apify platform)
 */
const DATASET_PATH_TEMPLATE = 'storage/datasets/default';

/**
 * Initialize storage directories
 * Ensures the dataset directory exists before scraper runs
 */
async function initializeStorage(projectRoot: string): Promise<void> {
    const datasetDir = join(projectRoot, DATASET_PATH_TEMPLATE);
    try {
        await mkdir(datasetDir, { recursive: true });
        console.log(`[Job Runner] Storage initialized: ${datasetDir}`);
    } catch (error) {
        console.warn('[Job Runner] Failed to initialize storage:', error);
    }
}

/**
 * Execute a scraper job asynchronously
 * 
 * This function:
 * 1. Prepares the input file for the scraper
 * 2. Spawns the scraper as a child process
 * 3. Monitors the scraper execution
 * 4. Reads the results from the dataset
 * 5. Sends results to the webhook URL
 * 
 * The function runs completely async and does not block the caller.
 * 
 * @param jobConfig - Job configuration containing all necessary parameters
 */
export async function runScraperJob(jobConfig: JobConfig): Promise<void> {
    const { jobId, webhookUrl } = jobConfig;

    console.log(`\n========================================`);
    console.log(`[Job Runner] Starting job ${jobId}`);
    console.log(`[Job Runner] Company URLs:`, jobConfig.companyUrls);
    console.log(`[Job Runner] Max results: ${jobConfig.maxResults}`);
    console.log(`[Job Runner] Webhook URL: ${webhookUrl}`);
    console.log(`========================================\n`);

    try {
        // Step 0: Initialize storage directories
        const projectRoot = getProjectRoot();
        await initializeStorage(projectRoot);

        // Step 1: Prepare the scraper input file
        await prepareScraperInput(jobConfig);

        // Step 2: Spawn the scraper process
        console.log(`[Job Runner] Spawning scraper process for job ${jobId}...`);

        const scraperPath = getScraperEntryPoint();

        // Spawn tsx to run the TypeScript scraper
        const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
        const scraperProcess = spawn(command, ['tsx', scraperPath], {
            cwd: projectRoot,
            env: {
                ...process.env,
                // Preserve existing environment variables (HARVESTAPI_TOKEN, etc.)
            },
            stdio: ['ignore', 'pipe', 'pipe'], // Capture stdout and stderr
            shell: true
        });

        // Collect stdout and stderr for debugging
        let stdoutData = '';
        let stderrData = '';

        scraperProcess.stdout?.on('data', (data) => {
            const output = data.toString();
            stdoutData += output;
            console.log(`[Scraper ${jobId}]`, output.trim());
        });

        scraperProcess.stderr?.on('data', (data) => {
            const output = data.toString();
            stderrData += output;
            console.error(`[Scraper ${jobId} ERROR]`, output.trim());
        });

        // Wait for the scraper process to complete
        const exitCode = await new Promise<number>((resolve, reject) => {
            scraperProcess.on('close', (code) => {
                resolve(code || 0);
            });

            scraperProcess.on('error', (error) => {
                reject(error);
            });
        });

        console.log(`\n[Job Runner] Scraper process exited with code ${exitCode} for job ${jobId}`);

        // Step 3: Check if scraper succeeded
        if (exitCode !== 0) {
            throw new Error(`Scraper process exited with code ${exitCode}. stderr: ${stderrData}`);
        }

        // Step 4: Read the results from the dataset
        console.log(`[Job Runner] Reading results for job ${jobId}...`);
        const rawResults = await readScraperResults(projectRoot);

        console.log(`[Job Runner] Found ${rawResults.length} raw results for job ${jobId}`);

        // Step 4.5: Transform to Apify-compatible format
        console.log(`[Job Runner] Transforming results to Apify format...`);
        const apifyFormattedResults = transformToApifyFormat(rawResults);
        console.log(`[Job Runner] Transformed ${apifyFormattedResults.length} results to Apify format`);

        // Step 5: Send success webhook with Apify-formatted results
        console.log(`[Job Runner] Sending success webhook for job ${jobId}...`);
        await sendSuccessWebhook(webhookUrl, jobId, apifyFormattedResults);

        console.log(`\n========================================`);
        console.log(`[Job Runner] Job ${jobId} completed successfully!`);
        console.log(`========================================\n`);

    } catch (error) {
        // Handle any errors during job execution
        console.error(`\n========================================`);
        console.error(`[Job Runner] Job ${jobId} failed with error:`);
        console.error(error);
        console.error(`========================================\n`);

        // Send error webhook
        try {
            await sendErrorWebhook(webhookUrl, jobId, error as Error);
            console.log(`[Job Runner] Error webhook sent for job ${jobId}`);
        } catch (webhookError) {
            console.error(`[Job Runner] Failed to send error webhook for job ${jobId}:`, webhookError);
        }
    }
}

/**
 * Read scraper results from the dataset directory
 * 
 * The Apify scraper writes results as individual JSON files in the dataset directory.
 * This function reads all those files and combines them into a single array.
 * 
 * @param projectRoot - Root directory of the project
 * @returns Array of scraped profile objects
 */
export async function readScraperResults(projectRoot: string): Promise<any[]> {
    const datasetDir = join(projectRoot, DATASET_PATH_TEMPLATE);

    try {
        const { readdir } = await import('node:fs/promises');
        const files = await readdir(datasetDir);

        // Filter for JSON files only
        const jsonFiles = files.filter(f => f.endsWith('.json'));

        if (jsonFiles.length === 0) {
            console.log('[Job Runner] No result files found in dataset');
            return [];
        }

        // Read and parse all JSON files
        const results: any[] = [];

        for (const file of jsonFiles) {
            const filePath = join(datasetDir, file);
            const content = await readFile(filePath, 'utf-8');

            try {
                const data = JSON.parse(content);
                results.push(data);
            } catch (parseError) {
                console.error(`[Job Runner] Failed to parse ${file}:`, parseError);
            }
        }

        return results;

    } catch (error) {
        // Dataset directory might not exist if scraper found no results
        console.warn('[Job Runner] Could not read dataset directory:', error);
        return [];
    }
}

/**
 * Start a scraper job without blocking
 * 
 * This function initiates the job in a fire-and-forget manner.
 * It returns immediately while the job continues in the background.
 * 
 * @param jobConfig - Job configuration
 */
export function startScraperJob(jobConfig: JobConfig): void {
    // Run the job asynchronously without awaiting
    runScraperJob(jobConfig).catch((error) => {
        console.error(`[Job Runner] Unhandled error in job ${jobConfig.jobId}:`, error);
    });
}

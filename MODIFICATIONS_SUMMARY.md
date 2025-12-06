# Local LinkedIn Scraper Modifications - Summary

## Latest Fix (Dec 6, 2025)

### Dataset Storage Issue - RESOLVED ✅

**Problem:** Results were not being saved to dataset folders, causing ENOENT errors.

**Root Cause:** 
- Misunderstanding of Apify SDK behavior
- `Actor.pushData(item, 'full-profile')` - the second parameter is NOT a dataset name
- The second parameter is an **event name** for billing/charging on Apify platform
- When running locally, ALL data goes to `storage/datasets/default/` regardless

**Solution:**
1. Corrected dataset path in `job-runner.ts` to `storage/datasets/default`
2. Added `initializeStorage()` function to create dataset directory automatically
3. Added storage initialization at job start to prevent ENOENT errors
4. Updated API README with data storage documentation

**Result:** Scraper now correctly saves and reads results from `storage/datasets/default/`

---

## Changes Made

Successfully modified the local scraper to send webhooks in Apify-compatible format. The webhook processor in InternalApiAdapter can now handle results from the local scraper without any modifications.

### Files Created/Modified

#### 1. **Created: `apify-formatter.ts`** ✅
- **Location:** `src/api/apify-formatter.ts`
- **Purpose:** Transform local scraper results to Apify format
- **Key Functions:**
  - `mapToApifyFormat()` - Maps single profile to Apify structure
  - `transformToApifyFormat()` - Transforms array of results
  - `extractPublicIdentifier()` - Extracts LinkedIn ID from URL
  - `parseDate()` - Parses date strings to Apify format

#### 2. **Modified: `job-runner.ts`** ✅
- **Changes:**
  - Imported `transformToApifyFormat` function
  - Added transformation step after reading results
  - **Fixed dataset path** to use `storage/datasets/default` (where Apify SDK actually saves data locally)
  - Added `initializeStorage()` function to ensure dataset directory exists
  - Added storage initialization at job start to prevent ENOENT errors:
    ```typescript
    const projectRoot = getProjectRoot();
    await initializeStorage(projectRoot);
    const rawResults = await readScraperResults(projectRoot);
    const apifyFormattedResults = transformToApifyFormat(rawResults);
    await sendSuccessWebhook(webhookUrl, jobId, apifyFormattedResults);
    ```

#### 3. **Modified: `webhook-handler.ts`** ✅
- **Changes:**
  - Rewrote `sendSuccessWebhook()` to send Apify-compatible format:
    ```typescript
    {
      userId: 'local-scraper',
      createdAt: ISO timestamp,
      eventType: 'ACTOR.RUN.SUCCEEDED',
      eventData: {
        actorId: 'local-scraper',
        actorRunId: jobId
      },
      resource: {
        id: jobId,
        status: 'SUCCEEDED',
        ...
      }
    }
    ```
  - Rewrote `send ErrorWebhook()` to send Apify-compatible format with `FAILED` status

## How It Works Now

### 1. **Request Flow** (Unchanged)
```
POST /scrape/company
  ↓
Immediate response with jobId
  ↓
Scraper runs in background
```

### 2. **Result Processing Flow** (NEW)
```
Raw scraper results
  ↓
Transform to Apify format (apify-formatter.ts)
  ↓
Send Apify-compatible webhook (webhook-handler.ts)
  ↓
InternalApiAdapter receives webhook
  ↓
ApifyWebhookProcessorService processes results
  ↓
Data persisted to database
```

### 3. **Webhook Payload Format**
The local scraper now sends:

**Success:**
```json
{
  "userId": "local-scraper",
  "createdAt": "2025-12-05T23:00:00.000Z",
  "eventType": "ACTOR.RUN.SUCCEEDED",
  "eventData": {
    "actorId": "local-scraper",
    "actorRunId": "550e8400-e29b-41d4-a716-446655440000"
  },
  "resource": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "actId": "local-scraper",
    "userId": "local-scraper",
    "startedAt": "2025-12-05T23:00:00.000Z",
    "finishedAt": "2025-12-05T23:05:00.000Z",
    "status": "SUCCEEDED"
  }
}
```

This matches the `ApifyWebhookPayload` structure expected by `ApifyWebhookController.cs`.

### 4. **Results Format**
Each profile in the results array is now formatted as `ApifyLinkedInProfile`:

```javascript
{
  id: "profile-url",
  publicIdentifier: "john-doe",
  linkedinUrl: "https://www.linkedin.com/in/john-doe",
  firstName: "John",
  lastName: "Doe",
  headline: "Software Engineer at Example",
  about: "Summary text...",
  location: {
    linkedinText: "San Francisco, CA"
  },
  profilePicture: {
    url: "https://...",
    sizes: []
  },
  experience: [
    {
      position: "SoftwareEngineer",
      companyName: "Example Corp",
      companyLinkedinUrl: "https://...",
      duration: "2 years",
      startDate: {
        month: "Jan",
        year: 2023,
        text: "Jan 2023"
      },
      endDate: {
        month: null,
        year: null,
        text: "Present"
      }
    }
  ],
  education: [...],
  skills: [
    { name: "JavaScript", endorsements: null }
  ]
}
```

## Testing

###Prerequisites
1. ✅ Local scraper API is running (`npm start`)
2. ✅ InternalApiAdapter is running
3. ✅ Valid JWT token

### Test Command

```powershell
# Trigger scrape via InternalApiAdapter
$token = "YOUR_JWT_TOKEN"

$body = @{
    source = "local_linkedin_company"
    companyUrl = "https://www.linkedin.com/company/sopro-social-prospecting"
    maxResults = 1
    persistToListBuild = $true
    listBuildName = "Test Local Scraper"
} | ConvertTo-Json

$response = Invoke-RestMethod `
    -Uri "https://localhost:44311/api/leadsearch/start" `
    -Method Post `
    -Headers @{ "Authorization" = "Bearer $token" } `
    -ContentType "application/json" `
    -Body $body

Write-Host "Job ID: $($response.runId)"
```

### Expected Behavior

1. **Immediate response:**
   - `providerUsed`: `"Local LinkedIn Scraper"`
   - `runId`: GUID from local scraper
   - `status`: `"Processing"`

2. **Database (immediate):**
   - New `ApifyRuns` record with `ProviderType = 'LocalScraper'`, `Status = 0` (Pending)

3. **After 30s-5min:**
   - Local scraper completes
   - Sends Apify-compatible webhook to `https://localhost:44311/api/apify/webhook`
   - `ApifyWebhookController` receives and processes
   - `ApifyWebhookProcessorService` persists results

4. **Database (final):**
   - `ApifyRuns.Status` = `2` (Completed)
   - `ListBuilds` table has new record
   - `People` table has scraped profiles
   - `Companies`, `PersonCompany`, `PersonEducation`, `PersonSkill` tables populated

## Summary

✅ **Local scraper modified** to output Apify-compatible format  
✅ **Webhook format** matches `ApifyWebhookPayload` structure  
✅ **Profile format** matches `ApifyLinkedInProfile` structure  
✅ **No changes needed** to InternalApiAdapter webhook processor  
✅ **Reuses 100%** of existing tested infrastructure  

The integration is complete and ready for testing!

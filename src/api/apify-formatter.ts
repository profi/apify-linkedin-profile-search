/**
 * Apify Format Mapper
 * 
 * This module transforms raw local scraper results into Apify-compatible format
 * so they can be processed by the existing ApifyWebhookProcessorService.
 */

/**
 * Extract the public identifier from a LinkedIn profile URL
 * Example: "https://www.linkedin.com/in/john-doe" => "john-doe"
 */
function extractPublicIdentifier(profileUrl: string): string {
    if (!profileUrl) return '';

    try {
        const url = new URL(profileUrl);
        const pathParts = url.pathname.split('/').filter(p => p);
        // LinkedIn profile URLs are like /in/{publicIdentifier}
        if (pathParts[0] === 'in' && pathParts[1]) {
            return pathParts[1];
        }
    } catch { }

    return '';
}

/**
 * Extract first name from full name
 */
function extractFirstName(fullName: string): string {
    if (!fullName) return '';
    const parts = fullName.trim().split(' ');
    return parts[0] || '';
}

/**
 * Extract last name from full name
 */
function extractLastName(fullName: string): string {
    if (!fullName) return '';
    const parts = fullName.trim().split(' ');
    return parts.slice(1).join(' ') || '';
}

/**
 * Map a single local scraper profile to Apify format
 */
export function mapToApifyFormat(localProfile: any): any {
    const publicIdentifier = extractPublicIdentifier(localProfile.profileUrl || '');

    return {
        // Basic Info
        id: localProfile.profileUrl || '',
        publicIdentifier,
        linkedinUrl: localProfile.profileUrl,
        firstName: extractFirstName(localProfile.fullName || ''),
        lastName: extractLastName(localProfile.fullName || ''),
        headline: localProfile.headline || '',
        about: localProfile.summary || '',

        // Profile Flags
        openToWork: false,
        hiring: false,
        premium: false,
        influencer: false,
        memorialized: false,
        verified: false,

        // Location
        location: localProfile.location ? {
            linkedinText: localProfile.location,
            countryCode: null,
            parsed: null
        } : null,

        // Profile Picture
        profilePicture: localProfile.profilePictureUrl ? {
            url: localProfile.profilePictureUrl,
            sizes: []
        } : null,

        // Cover Picture
        coverPicture: null,

        // Object URN (not available from local scraper)
        objectUrn: null,

        // Dates
        registeredAt: null,

        // Top Skills
        topSkills: [],

        // Connection Info
        connectionsCount: localProfile.connections ? parseConnectionCount(localProfile.connections) : null,
        followerCount: null,

        // Current Position (derived from positions array)
        currentPosition: localProfile.positions && localProfile.positions.length > 0 ?
            [mapCurrentPosition(localProfile.positions[0])] : [],

        // Education (top education - first item)
        profileTopEducation: localProfile.education && localProfile.education.length > 0 ?
            [mapEducation(localProfile.education[0])] : [],

        // Full Experience
        experience: localProfile.positions ?
            localProfile.positions.map(mapExperience) : [],

        // Full Education
        education: localProfile.education ?
            localProfile.education.map(mapEducation) : [],

        // Skills
        skills: localProfile.skills ?
            localProfile.skills.map((skill: string) => ({ name: skill, endorsements: null, positions: [] })) : [],

        // Other sections (not available from local scraper)
        certifications: [],
        projects: [],
        volunteering: [],
        receivedRecommendations: [],
        publications: [],
        courses: [],
        patents: [],
        honorsAndAwards: [],
        languages: [],
        causes: [],
        featured: null,
        composeOptionType: null,
        moreProfiles: [],
        _meta: null
    };
}

/**
 * Parse connection count from strings like "500+", "1,234", etc.
 */
function parseConnectionCount(connections: string): number | null {
    if (!connections) return null;

    // Remove non-numeric characters except digits
    const cleaned = connections.replace(/[^0-9]/g, '');
    const num = parseInt(cleaned, 10);

    return isNaN(num) ? null : num;
}

/**
 * Map current position info
 */
function mapCurrentPosition(position: any): any {
    return {
        companyId: null,
        companyLinkedinUrl: position.companyUrl || null,
        companyName: position.company || '',
        dateRange: {
            start: parseDate(position.startDate),
            end: parseDate(position.endDate)
        }
    };
}

/**
 * Map experience/position info
 */
function mapExperience(position: any): any {
    return {
        position: position.title || '',
        location: position.location || null,
        employmentType: null,
        workplaceType: null,
        companyName: position.company || '',
        companyLinkedinUrl: position.companyUrl || null,
        companyId: null,
        companyUniversalName: null,
        companyLogo: null,
        duration: position.duration || null,
        description: position.description || null,
        skills: [],
        startDate: parseStartDate(position.startDate),
        endDate: parseEndDate(position.endDate),
        experienceGroupId: null
    };
}

/**
 * Map education info
 */
function mapEducation(edu: any): any {
    return {
        schoolId: edu.schoolId || null,
        companyId: null,
        schoolLinkedinUrl: edu.schoolUrl || null,
        schoolName: edu.school || '',
        degree: edu.degree || null,
        fieldOfStudy: edu.fieldOfStudy || null,
        skills: [],
        startDate: parseDate(edu.startDate),
        endDate: parseDate(edu.endDate),
        period: edu.period || null,
        schoolLogo: null
    };
}

/**
 * Parse date string to Apify DateInfo format
 */
function parseDate(dateStr: string): any {
    if (!dateStr) return null;

    // Try to parse year and month from various formats
    const yearMatch = dateStr.match(/\b(19|20)\d{2}\b/);
    if (!yearMatch) return null;

    const year = parseInt(yearMatch[0], 10);

    // Try to extract month
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    let month = null;

    for (let i = 0; i < months.length; i++) {
        if (dateStr.toLowerCase().includes(months[i])) {
            month = i + 1;
            break;
        }
    }

    return {
        month,
        year,
        day: null
    };
}

/**
 * Parse start date to Apify StartDateInfo format
 */
function parseStartDate(dateStr: string): any {
    if (!dateStr) return null;

    const parsed = parseDate(dateStr);
    if (!parsed) return null;

    return {
        month: parsed.month ? getMonthAbbreviation(parsed.month) : null,
        year: parsed.year,
        text: dateStr
    };
}

/**
 * Parse end date to Apify EndDateInfo format
 */
function parseEndDate(dateStr: string): any {
    if (!dateStr) return null;

    // Check if it's "Present"
    if (dateStr.toLowerCase().includes('present')) {
        return {
            month: null,
            year: null,
            text: 'Present'
        };
    }

    const parsed = parseDate(dateStr);
    if (!parsed) return null;

    return {
        month: parsed.month ? getMonthAbbreviation(parsed.month) : null,
        year: parsed.year,
        text: dateStr
    };
}

/**
 * Get month abbreviation from month number (1-12)
 */
function getMonthAbbreviation(month: number): string {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[month - 1] || '';
}

/**
 * Transform an array of local scraper results to Apify format
 */
export function transformToApifyFormat(localResults: any[]): any[] {
    return localResults.map(mapToApifyFormat);
}

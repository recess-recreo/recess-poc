/**
 * Utility functions for handling provider images
 * 
 * WHY: Since the database doesn't have image URLs and the live Recess site
 * isn't directly accessible, we need a flexible system that can:
 * 1. Try multiple potential image sources
 * 2. Generate contextual placeholder images
 * 3. Easily adapt when we discover the actual URL patterns
 * 
 * DESIGN DECISION: Using a strategy pattern with fallbacks ensures
 * the app always shows something visually appealing while being flexible
 * enough to integrate with real image sources later
 */

interface ImageUrlOptions {
  providerId?: string;
  providerName?: string;
  category?: string;
  imageType?: 'cover' | 'logo';
}

/**
 * Generates an appropriate image URL for a provider
 * 
 * STRATEGY: Try multiple approaches in order of preference:
 * 1. Check if database has an image URL (currently always empty)
 * 2. Try potential Recess CDN patterns (prepared for when we discover them)
 * 3. Use category-specific Unsplash images for visual appeal
 * 4. Fall back to local placeholder
 * 
 * @param dbImageUrl The image URL from database (if any)
 * @param options Additional context for generating URLs
 * @returns The best available image URL
 */
export function getProviderImageUrl(
  dbImageUrl: string | null | undefined,
  options: ImageUrlOptions = {}
): string {
  // 1. If database has an image, use it
  if (dbImageUrl && dbImageUrl.trim() !== '') {
    return dbImageUrl;
  }

  const { providerId, providerName, category, imageType = 'cover' } = options;

  // 2. Try potential Recess CDN patterns (these are educated guesses)
  // Once we discover the actual pattern, we can update this
  if (providerId || providerName) {
    // These URLs might work once we know the actual pattern
    const potentialUrls = [
      // Pattern 1: Using provider ID
      providerId && `https://cdn.joinrecess.com/providers/${providerId}/${imageType}.jpg`,
      // Pattern 2: Using slugified provider name
      providerName && `https://assets.joinrecess.com/programs/${slugify(providerName)}.jpg`,
      // Pattern 3: Generic CDN pattern
      providerId && `https://www.joinrecess.com/api/images/provider/${providerId}`,
    ].filter(Boolean);

    // For now, skip these since the site redirects
    // When we have the actual pattern, we can enable this
    // return potentialUrls[0];
  }

  // 3. Use category-specific stock images for visual appeal
  // This provides variety and context-appropriate imagery
  if (category) {
    return getCategoryImage(category);
  }

  // 4. Use a generic activity image from Unsplash
  // Random selection from curated collection of kids' activities
  const activityImages = [
    'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9', // Kids playing
    'https://images.unsplash.com/photo-1544776193-352d25ca82cd', // Art class
    'https://images.unsplash.com/photo-1596464716127-f2a82984de30', // Sports
    'https://images.unsplash.com/photo-1527603815363-e79385e0747e', // Music
    'https://images.unsplash.com/photo-1509062522246-3755977927d7', // Learning
    'https://images.unsplash.com/photo-1558021212-51b6ecfa0db9', // Summer camp
    'https://images.unsplash.com/photo-1516627145497-ae6968895b74', // Swimming
    'https://images.unsplash.com/photo-1472162072942-cd5147eb3902', // Dance
  ];
  
  // Use provider name or ID to consistently select same image
  const seed = providerId || providerName || Math.random().toString();
  const index = Math.abs(hashCode(seed)) % activityImages.length;
  
  // Add Unsplash parameters for optimization
  return `${activityImages[index]}?auto=format&fit=crop&w=400&h=300&q=80`;
}

/**
 * Gets a category-specific image URL
 * 
 * WHY: Different activity categories should have visually distinct images
 * to help users quickly identify the type of program
 * 
 * @param category The activity category
 * @returns An appropriate stock image URL
 */
function getCategoryImage(category: string): string {
  const categoryLower = category.toLowerCase();
  
  // Map categories to specific Unsplash images
  const categoryImages: Record<string, string> = {
    // Sports & Athletics
    'sports': 'https://images.unsplash.com/photo-1596464716127-f2a82984de30',
    'soccer': 'https://images.unsplash.com/photo-1574629810360-7efbbe195018',
    'basketball': 'https://images.unsplash.com/photo-1546519638-68e109498ffc',
    'swimming': 'https://images.unsplash.com/photo-1516627145497-ae6968895b74',
    'gymnastics': 'https://images.unsplash.com/photo-1594736797933-d0501ba2fe65',
    
    // Arts & Creativity
    'art': 'https://images.unsplash.com/photo-1544776193-352d25ca82cd',
    'music': 'https://images.unsplash.com/photo-1527603815363-e79385e0747e',
    'dance': 'https://images.unsplash.com/photo-1472162072942-cd5147eb3902',
    'theater': 'https://images.unsplash.com/photo-1503095396549-807759245b35',
    'drama': 'https://images.unsplash.com/photo-1503095396549-807759245b35',
    
    // Academic & Learning
    'academic': 'https://images.unsplash.com/photo-1509062522246-3755977927d7',
    'stem': 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158',
    'science': 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158',
    'coding': 'https://images.unsplash.com/photo-1515879218367-8466d910aaa4',
    'robotics': 'https://images.unsplash.com/photo-1561144257-e32e8efc6c4f',
    
    // Camps & Programs
    'camp': 'https://images.unsplash.com/photo-1558021212-51b6ecfa0db9',
    'summer camp': 'https://images.unsplash.com/photo-1558021212-51b6ecfa0db9',
    'after school': 'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9',
    'daycare': 'https://images.unsplash.com/photo-1587654780291-39c9404d746b',
  };
  
  // Check for exact match or partial match
  for (const [key, url] of Object.entries(categoryImages)) {
    if (categoryLower.includes(key)) {
      return `${url}?auto=format&fit=crop&w=400&h=300&q=80`;
    }
  }
  
  // Default fallback for unknown categories
  return 'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?auto=format&fit=crop&w=400&h=300&q=80';
}

/**
 * Simple string slugification for URL generation
 * 
 * @param text The text to slugify
 * @returns URL-safe slug
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // Remove non-word chars
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/--+/g, '-') // Replace multiple - with single -
    .trim();
}

/**
 * Simple hash function for consistent random selection
 * 
 * WHY: We want the same provider to always get the same placeholder image
 * for visual consistency across page refreshes
 * 
 * @param str The string to hash
 * @returns A hash code
 */
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
}

/**
 * Gets a fallback image URL when all else fails
 * 
 * @returns Local placeholder image URL
 */
export function getFallbackImageUrl(): string {
  return '/placeholder-provider.jpg';
}
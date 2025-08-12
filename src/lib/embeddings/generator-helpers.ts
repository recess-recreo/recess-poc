/**
 * Helper methods for enhanced embedding text generation.
 * 
 * WHY: These methods are separated to provide reusable utility functions because:
 * - Consistent formatting across all embedding types
 * - Easy to test and maintain formatting logic
 * - Can be reused by other embedding generators if needed
 */

/**
 * Extract neighborhood information from provider data.
 */
export function extractNeighborhoodInfo(provider: any): string {
  const parts = [];
  if (provider.address) parts.push(provider.address);
  if (provider.street_line_1) parts.push(provider.street_line_1);
  return parts.length > 0 ? parts.join(', ') : 'area';
}

/**
 * Format price information consistently.
 */
export function formatPriceInfo(price: string | number): string {
  if (!price) return 'Contact for pricing';
  
  const priceStr = price.toString().toLowerCase();
  if (priceStr.includes('free') || priceStr === '0') {
    return 'Free';
  }
  if (priceStr.includes('month')) {
    return `${price}/month`;
  }
  if (priceStr.includes('week')) {
    return `${price}/week`;
  }
  if (priceStr.includes('session') || priceStr.includes('class')) {
    return `${price}/session`;
  }
  
  return price.toString();
}

/**
 * Format category/activity information.
 */
export function formatCategoryInfo(category: string): string {
  if (!category) return 'Activities';
  
  // Map NAICS codes to readable categories
  const categoryMappings: { [key: string]: string } = {
    '611620': 'Sports and fitness instruction',
    '713940': 'Fitness and recreational sports centers',
    '611610': 'Fine arts schools',
    '611699': 'Educational services',
    '812990': 'Personal services',
  };
  
  return categoryMappings[category] || category;
}

/**
 * Format age information consistently.
 */
export function formatAgeInfo(grades: string): string {
  if (!grades) return 'All ages';
  
  const gradesStr = grades.toLowerCase();
  if (gradesStr.includes('k') || gradesStr.includes('kindergarten')) {
    return `Kindergarten and up, ${grades}`;
  }
  if (gradesStr.includes('pre') || gradesStr.includes('3') || gradesStr.includes('4') || gradesStr.includes('5')) {
    return `Ages 3-5 years, ${grades}`;
  }
  if (gradesStr.includes('6') || gradesStr.includes('7') || gradesStr.includes('8')) {
    return `Middle school ages, ${grades}`;
  }
  if (gradesStr.includes('9') || gradesStr.includes('high') || gradesStr.includes('teen')) {
    return `High school ages, ${grades}`;
  }
  if (gradesStr.includes('adult')) {
    return `Adult programs, ${grades}`;
  }
  
  return grades;
}

/**
 * Create comprehensive provider offerings text.
 * Aggregates all camps/sessions to create a summary of what the provider offers.
 */
export function createProviderOfferingsText(camps: any[]): {
  summary: string;
  ages: string;
  schedule: string;
  specialties: string;
} {
  if (!camps || camps.length === 0) {
    return { summary: '', ages: '', schedule: '', specialties: '' };
  }

  // Extract program names and categories
  const programNames = camps.slice(0, 10).map(camp => camp.title).filter(Boolean);
  const categories = camps.map(camp => camp.category).filter(Boolean);
  const uniqueCategories = [...new Set(categories)];
  
  // Extract age ranges
  const ageRanges = camps.map(camp => camp.grades || camp.min_age && camp.max_age ? `${camp.min_age}-${camp.max_age}` : null)
    .filter(Boolean);
  const uniqueAgeRanges = [...new Set(ageRanges)];
  
  // Extract scheduling patterns
  const schedules = camps.map(camp => {
    if (camp.time) return camp.time;
    if (camp.dateRange) return camp.dateRange;
    return null;
  }).filter(Boolean);
  
  // Extract special features
  const specialties = [];
  if (camps.some(camp => camp.price && (camp.price.toString().toLowerCase().includes('free') || camp.price === '0'))) {
    specialties.push('free programs available');
  }
  if (camps.some(camp => camp.description && camp.description.toLowerCase().includes('compet'))) {
    specialties.push('competitive programs');
  }
  if (camps.some(camp => camp.description && camp.description.toLowerCase().includes('beginner'))) {
    specialties.push('beginner-friendly');
  }
  if (camps.some(camp => camp.spotsLeft && parseInt(camp.spotsLeft) > 5)) {
    specialties.push('availability');
  }
  
  return {
    summary: programNames.slice(0, 5).join(', '),
    ages: uniqueAgeRanges.slice(0, 3).join(', ') || 'various ages',
    schedule: schedules.slice(0, 2).join(', ') || 'flexible scheduling',
    specialties: specialties.join(', ') || 'specialized instruction'
  };
}
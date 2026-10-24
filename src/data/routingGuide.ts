import { Category, DepartmentId } from '../types';

export interface DepartmentInfo {
  id: DepartmentId;
  name: string;
  category: Category;
  subteams: string[];
  icon: 'droplet' | 'bolt' | 'broom' | 'wifi';
  color: string;
}

export const ROUTING_GUIDE_TITLE = 'Team-defined sample routing guide';

export const ROUTING_GUIDE: Record<Exclude<Category, 'unclear'>, DepartmentInfo> = {
  plumbing: {
    id: 'plumbing',
    name: 'Plumbing Dept',
    category: 'plumbing',
    subteams: ['Water Supply', 'Drainage', 'Taps & Fittings', 'Drinking Water'],
    icon: 'droplet',
    color: '#0284c7', // sky-600
  },
  electricity: {
    id: 'electricity',
    name: 'Electrical Dept',
    category: 'electricity',
    subteams: ['Fans & Lights', 'Switches & Sockets', 'Power Supply', 'Appliances'],
    icon: 'bolt',
    color: '#d97706', // amber-600
  },
  cleanliness: {
    id: 'cleanliness',
    name: 'Housekeeping Dept',
    category: 'cleanliness',
    subteams: ['Washroom Cleaning', 'Corridors', 'Garbage Collection', 'Pest Control'],
    icon: 'broom',
    color: '#059669', // emerald-600
  },
  internet: {
    id: 'internet',
    name: 'IT Dept',
    category: 'internet',
    subteams: ['Wi-Fi', 'LAN', 'Login/Accounts'],
    icon: 'wifi',
    color: '#7c3aed', // violet-600
  },
};

/**
 * Deterministically lookup department from category.
 * Gemini never chooses the department; code looks it up here.
 */
export function getDepartmentForCategory(category: Category): DepartmentId | 'unclear' {
  if (category === 'unclear') return 'unclear';
  return ROUTING_GUIDE[category]?.id || 'unclear';
}

export function getAllCategories(): Array<Exclude<Category, 'unclear'>> {
  return ['plumbing', 'electricity', 'cleanliness', 'internet'];
}

export function getSubteamsForCategory(category: Category): string[] {
  if (category === 'unclear') return [];
  return ROUTING_GUIDE[category]?.subteams || [];
}

export function isValidSubtype(category: Category, subtype: string): boolean {
  if (category === 'unclear') return false;
  const guide = ROUTING_GUIDE[category];
  return guide ? guide.subteams.includes(subtype) : false;
}

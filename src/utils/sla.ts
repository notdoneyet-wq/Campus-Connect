import { SafetyFlag, Urgency } from '../types';

export const SLA_HOURS: Record<Urgency, number> = {
  critical: 2,
  high: 6,
  medium: 24,
  low: 72,
};

export const SLA_RULES_INFO = [
  { urgency: 'critical', label: 'Critical', hours: 2, description: 'Immediate safety or infrastructure threats (2h response)' },
  { urgency: 'high', label: 'High', hours: 6, description: 'Direct living disruption or CampusShield alerts (6h response)' },
  { urgency: 'medium', label: 'Medium', hours: 24, description: 'Standard room or appliance repairs (24h response)' },
  { urgency: 'low', label: 'Low', hours: 72, description: 'Minor cosmetic or low impact maintenance (72h response)' },
];

/**
 * Any CampusShield safety flag forces urgency to at least High
 */
export function enforceSafetyUrgency(
  suggestedUrgency: Urgency,
  safetyFlags: SafetyFlag[]
): Urgency {
  const hasSafetyFlag = safetyFlags.some((flag) => flag !== 'none');
  if (hasSafetyFlag) {
    if (suggestedUrgency === 'low' || suggestedUrgency === 'medium') {
      return 'high';
    }
  }
  return suggestedUrgency;
}

/**
 * Calculate target SLA timestamp in milliseconds
 */
export function calculateSlaDueAt(createdAt: number, urgency: Urgency): number {
  const hours = SLA_HOURS[urgency] || 24;
  return createdAt + hours * 3600 * 1000;
}

/**
 * Check if a ticket has breached SLA based on simulated now
 */
export function isTicketOverdue(slaDueAt: number, simulatedNow: number): boolean {
  return simulatedNow > slaDueAt;
}

/**
 * Format SLA countdown relative to simulatedNow
 */
export function getSlaStatus(
  slaDueAt: number,
  simulatedNow: number,
  isClosed: boolean
): {
  isOverdue: boolean;
  timeLeftFormatted: string;
  badgeColor: 'green' | 'amber' | 'red' | 'gray';
} {
  if (isClosed) {
    return {
      isOverdue: false,
      timeLeftFormatted: 'Completed',
      badgeColor: 'gray',
    };
  }

  const diffMs = slaDueAt - simulatedNow;
  if (diffMs <= 0) {
    const overdueHrs = Math.floor(Math.abs(diffMs) / (3600 * 1000));
    const overdueMins = Math.floor((Math.abs(diffMs) % (3600 * 1000)) / (60 * 1000));
    return {
      isOverdue: true,
      timeLeftFormatted: `Overdue by ${overdueHrs}h ${overdueMins}m`,
      badgeColor: 'red',
    };
  }

  const remainingHrs = Math.floor(diffMs / (3600 * 1000));
  const remainingMins = Math.floor((diffMs % (3600 * 1000)) / (60 * 1000));

  let badgeColor: 'green' | 'amber' | 'red' = 'green';
  if (diffMs <= 2 * 3600 * 1000) {
    badgeColor = 'amber';
  }

  const timeLeftFormatted =
    remainingHrs > 0
      ? `${remainingHrs}h ${remainingMins}m left`
      : `${remainingMins}m left`;

  return {
    isOverdue: false,
    timeLeftFormatted,
    badgeColor,
  };
}

import { DepartmentId, Technician, Ticket } from '../types';

export const INITIAL_TECHNICIANS: Technician[] = [
  // Plumbing
  {
    id: 'tech-plumb-1',
    name: 'Ramesh Kumar (Senior Plumber)',
    department: 'plumbing',
    skills: ['Water Supply', 'Drainage', 'Taps & Fittings'],
    workload: 2,
    available: true,
  },
  {
    id: 'tech-plumb-2',
    name: 'Santosh Meena (Plumbing Asst)',
    department: 'plumbing',
    skills: ['Drinking Water', 'Taps & Fittings'],
    workload: 1,
    available: true,
  },
  // Electricity
  {
    id: 'tech-elec-1',
    name: 'Vikram Singh (Senior Electrician)',
    department: 'electricity',
    skills: ['Power Supply', 'Switches & Sockets', 'Appliances'],
    workload: 3,
    available: true,
  },
  {
    id: 'tech-elec-2',
    name: 'Anil Verma (Electrician)',
    department: 'electricity',
    skills: ['Fans & Lights', 'Switches & Sockets'],
    workload: 0,
    available: true,
  },
  // Cleanliness
  {
    id: 'tech-clean-1',
    name: 'Sunita Devi (Housekeeping Lead)',
    department: 'cleanliness',
    skills: ['Washroom Cleaning', 'Corridors', 'Garbage Collection'],
    workload: 1,
    available: true,
  },
  {
    id: 'tech-clean-2',
    name: 'Manoj Yadav (Sanitation)',
    department: 'cleanliness',
    skills: ['Pest Control', 'Corridors', 'Washroom Cleaning'],
    workload: 2,
    available: true,
  },
  // Internet
  {
    id: 'tech-net-1',
    name: 'Deepak Sharma (Network Engineer)',
    department: 'internet',
    skills: ['Wi-Fi', 'LAN', 'Login/Accounts'],
    workload: 2,
    available: true,
  },
  {
    id: 'tech-net-2',
    name: 'Neha Gupta (IT Support)',
    department: 'internet',
    skills: ['Wi-Fi', 'Login/Accounts'],
    workload: 1,
    available: true,
  },
];

export interface TechnicianMatchResult {
  technician: Technician;
  score: number;
  matchReasons: string[];
}

/**
 * Smart Dispatch Ranking:
 * 1. Matching skill (ticket subtype in technician.skills) -> +100
 * 2. Lowest open workload -> +(50 - workload * 10)
 * 3. Already assigned to another ticket on the same floor -> +30
 */
export function rankTechniciansForTicket(
  ticket: Ticket,
  technicians: Technician[],
  allTickets: Ticket[] = []
): TechnicianMatchResult[] {
  // Filter technicians by department
  const deptTechs = technicians.filter(
    (t) => t.department === ticket.departmentId && t.available
  );

  // Check if technician is assigned to active tickets on the same hostel and floor
  const sameFloorTechNames = new Set(
    allTickets
      .filter(
        (t) =>
          t.hostel === ticket.hostel &&
          t.floor === ticket.floor &&
          t.id !== ticket.id &&
          t.status !== 'Resolved' &&
          t.status !== 'Verified' &&
          t.assignedTo
      )
      .map((t) => t.assignedTo)
  );

  const results: TechnicianMatchResult[] = deptTechs.map((tech) => {
    let score = 0;
    const matchReasons: string[] = [];

    // 1. Skill match
    if (ticket.subtype && tech.skills.includes(ticket.subtype)) {
      score += 100;
      matchReasons.push(`Matches skill "${ticket.subtype}"`);
    } else if (tech.skills.length > 0) {
      score += 20;
    }

    // 2. Workload (lower is better)
    const workloadBonus = Math.max(0, 50 - tech.workload * 10);
    score += workloadBonus;
    matchReasons.push(`Active workload: ${tech.workload}`);

    // 3. Same floor proximity
    if (sameFloorTechNames.has(tech.name) || sameFloorTechNames.has(tech.id)) {
      score += 30;
      matchReasons.push(`Already working on ${ticket.hostel} Floor ${ticket.floor}`);
    }

    return {
      technician: tech,
      score,
      matchReasons,
    };
  });

  return results.sort((a, b) => b.score - a.score);
}

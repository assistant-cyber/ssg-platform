export type TeamRole = 'admin' | 'manager' | 'standard';

export interface TeamMember {
  id: string;
  name: string;
  role: TeamRole;
  email: string;
  phone?: string;
}

export const TEAM_MEMBERS: TeamMember[] = [
  {
    id: 'team-1',
    name: 'Cannon Russell',
    role: 'admin',
    email: 'cannon@scottishstainedglass.com',
    phone: '(303) 944-2350',
  },
  {
    id: 'team-2',
    name: 'Derek Espejo',
    role: 'manager',
    email: 'derek@scottishgroupcompanies.com',
    phone: '(720) 703-2247',
  },
  {
    id: 'team-3',
    name: 'Mallory Pettersen',
    role: 'manager',
    email: 'mallory@scottishgroupcompanies.com',
  },
  {
    id: 'team-4',
    name: 'Sammy Schwindt',
    role: 'manager',
    email: 'sammy@scottishgroupcompanies.com',
    phone: '(702) 908-1286',
  },
];
